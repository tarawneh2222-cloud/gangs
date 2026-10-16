'use strict';

require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Collection,
  Events
} = require('discord.js');

// === 1. خادم الويب لاستمرار التشغيل على Render ===
const web = express();
web.get('/', (_req, res) => res.status(200).send('✅ البوت يعمل بنجاح ومربوط بقاعدة البيانات السحابية'));
web.get('/health', (_req, res) => res.json({ ok: true }));
web.listen(Number(process.env.PORT) || 3000, '0.0.0.0');

// === 2. الاتصال بـ MongoDB Atlas ===
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://tarawneh2222_db_user:I3g64sq87XbVgYrj@cluster0.qehfk3b.mongodb.net/?retryWrites=true&w=majority';

let isMongoConnected = false;

mongoose.connect(MONGODB_URI)
  .then(() => {
    isMongoConnected = true;
    console.log('🚀 تم الاتصال بنجاح بقاعدة بيانات MongoDB Atlas السحابية!');
  })
  .catch(err => {
    console.error('⚠️ تعذر الاتصال بـ MongoDB، يتم استخدام نظام الحفظ المحلي:', err.message);
  });

const GameSchema = new mongoose.Schema({
  id: { type: String, default: 'main_game_data' },
  users: { type: Object, default: {} },
  gangs: { type: Object, default: {} },
  bounties: { type: Object, default: {} },
  territories: { type: Object, default: {} },
  activeWars: { type: Object, default: {} },
  activeConvoys: { type: Object, default: {} },
  mayor: { type: Object, default: { id: null, taxRate: 15, treasury: 0 } },
  policeForce: { type: Array, default: [] },
  settings: { type: Object, default: {} }
}, { minimize: false });

const GameDataModel = mongoose.model('GameData', GameSchema);

// === 3. نظام قراءة وحفظ البيانات ===
const DATA_FILE = path.join(__dirname, 'data.json');
const BACKUP_FILE = path.join(__dirname, 'data_backup.json');

async function readData() {
  if (isMongoConnected) {
    try {
      let doc = await GameDataModel.findOne({ id: 'main_game_data' });
      if (!doc) {
        doc = await GameDataModel.create({
          id: 'main_game_data',
          users: {},
          gangs: {},
          bounties: { '123456789': 15000 },
          activeWars: {},
          activeConvoys: {},
          mayor: { id: null, taxRate: 15, treasury: 0 },
          policeForce: [],
          territories: {}
        });
      }
      const dataObj = doc.toObject();
      if (!dataObj.users) dataObj.users = {};
      if (!dataObj.gangs) dataObj.gangs = {};
      if (!dataObj.bounties) dataObj.bounties = {};
      if (!dataObj.mayor) dataObj.mayor = { id: null, taxRate: 15, treasury: 0 };
      if (!dataObj.policeForce) dataObj.policeForce = [];
      return dataObj;
    } catch (e) {
      console.error('❌ خطأ قراءة MongoDB:', e.message);
    }
  }

  try {
    if (fs.existsSync(DATA_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      if (!parsed.users) parsed.users = {};
      if (!parsed.gangs) parsed.gangs = {};
      if (!parsed.bounties) parsed.bounties = {};
      if (!parsed.mayor) parsed.mayor = { id: null, taxRate: 15, treasury: 0 };
      if (!parsed.policeForce) parsed.policeForce = [];
      return parsed;
    }
  } catch (err) {}
  return { users: {}, gangs: {}, bounties: {}, activeWars: {}, activeConvoys: {}, mayor: { id: null, taxRate: 15, treasury: 0 }, policeForce: [], territories: {}, settings: {} };
}

async function saveData(data) {
  if (isMongoConnected) {
    try {
      await GameDataModel.updateOne(
        { id: 'main_game_data' },
        { 
          $set: {
            users: data.users,
            gangs: data.gangs,
            bounties: data.bounties,
            territories: data.territories,
            activeWars: data.activeWars,
            activeConvoys: data.activeConvoys,
            mayor: data.mayor,
            policeForce: data.policeForce,
            settings: data.settings
          }
        },
        { upsert: true }
      );
    } catch (e) {
      console.error('❌ خطأ حفظ MongoDB:', e.message);
    }
  }

  try {
    const jsonString = JSON.stringify(data, null, 2);
    fs.writeFileSync(DATA_FILE, jsonString);
    fs.writeFileSync(BACKUP_FILE, jsonString);
  } catch (err) {}
}

const WEAPONS = {
  knife: { name: 'سكين حاد 🔪', price: 500 },
  pistol: { name: 'مسدس 9mm 🔫', price: 2000 },
  smg: { name: 'رشاش قصير 🪖', price: 7000 },
  armor: { name: 'درع واقي 🛡️', price: 4000 },
  car: { name: 'سيارة هرب سريعة 🏎️', price: 15000 }
};

const JOBS = {
  driver: { name: '🏎️ السائق الخبير', desc: 'يزيد سرعة الهروب وفرار السرقات.' },
  hacker: { name: '💻 الهكر الإجرامي', desc: 'يخفض رسوم غسيل الأموال إلى 5%.' },
  hitman: { name: '🪖 المسلح العنيف', desc: 'قوة مضاعفة في الاغتيالات والنزاعات.' },
  medic: { name: '🩺 طبيب السوق السوداء', desc: 'يساعد في تقليص مدة السجن.' },
  lawyer: { name: '⚖️ المحامي الفاسد', desc: 'يخفض الكفالة إلى 2,500 عملة بدلاً من 5,000.' },
  cop: { name: '👮 شرطي المدينة', desc: 'حفظ الأمن وإلقاء القبض على المجرمين وتقاضي الرواتب.' }
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

client.commands = new Collection();

const commands = [
  new SlashCommandBuilder().setName('قائمة').setDescription('عرض لوحة التحكم الرئيسية واللوحات التفاعلية بالأزرار الشاملة'),
  new SlashCommandBuilder().setName('انضمام').setDescription('إنشاء وتفعيل حساب جديد'),
  new SlashCommandBuilder().setName('حساب').setDescription('عرض بيانات حسابك ومستواك وترسانتك'),
  new SlashCommandBuilder().setName('يومي').setDescription('الحصول على المكافأة اليومية'),
  new SlashCommandBuilder().setName('صندوق_يومي').setDescription('فتح صندوق الهدايا اليومي'),
  new SlashCommandBuilder().setName('سوق_سوداء').setDescription('شراء الأسلحة والسيارات والدروع'),
  new SlashCommandBuilder().setName('سرقة').setDescription('تنفيذ عملية سطو مسلح (بتهئدة 30 ثانية)'),
  new SlashCommandBuilder().setName('المطلوبين').setDescription('عرض قائمة الأشخاص المطلوب اغتيالهم وأصحاب المكافآت'),
  new SlashCommandBuilder().setName('السجن').setDescription('عرض قائمة المحتجزين بالسجن حالياً والوقت المتبقي'),
  new SlashCommandBuilder().setName('كفالة').setDescription('دفع كفالة الخروج من السجن'),
  new SlashCommandBuilder().setName('عصابتي').setDescription('عرض تفاصيل وإدارة عصابتك'),
  new SlashCommandBuilder().setName('إنشاء_عصابة').setDescription('تأسيس عصابة جديدة (5000 عملة)').addStringOption(opt => opt.setName('الاسم').setDescription('اسم العصابة').setRequired(true)),
  new SlashCommandBuilder().setName('لوحة_الصدارة').setDescription('عرض قائمة أثرياء المدينة'),
  new SlashCommandBuilder()
    .setName('تعويض')
    .setDescription('إ
