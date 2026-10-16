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
          bounties: {},
          activeWars: {},
          territories: {
            bank: { name: '🏦 البنك المركزي', owner: null, tax: 2000 },
            port: { name: '🚢 الميناء المحصن', owner: null, tax: 1500 },
            club: { name: '🍸 الملهى الليلي', owner: null, tax: 1000 }
          }
        });
      }
      const dataObj = doc.toObject();
      if (!dataObj.users) dataObj.users = {};
      if (!dataObj.gangs) dataObj.gangs = {};
      if (!dataObj.bounties) dataObj.bounties = {};
      if (!dataObj.activeWars) dataObj.activeWars = {};
      if (!dataObj.territories) {
        dataObj.territories = {
          bank: { name: '🏦 البنك المركزي', owner: null, tax: 2000 },
          port: { name: '🚢 الميناء المحصن', owner: null, tax: 1500 },
          club: { name: '🍸 الملهى الليلي', owner: null, tax: 1000 }
        };
      }
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
      if (!parsed.activeWars) parsed.activeWars = {};
      return parsed;
    }
  } catch (err) {}
  return { users: {}, gangs: {}, bounties: {}, activeWars: {}, territories: {}, settings: {} };
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

// === 4. الأسلحة والترقيات والمهن ===
const WEAPONS = {
  knife: { name: 'سكين حاد 🔪', price: 500, desc: 'سلاح خفيف يزيد نسبة النجاح' },
  pistol: { name: 'مسدس 9mm 🔫', price: 2000, desc: 'يزيد نسبة الخطف بـ 15%' },
  smg: { name: 'رشاش قصير 🪖', price: 7000, desc: 'مخصص للاغتيالات والاحتلال' },
  armor: { name: 'درع واقي 🛡️', price: 4000, desc: 'يحميك من السجن والغرامة' },
  car: { name: 'سيارة هرب سريعة 🏎️', price: 15000, desc: 'تزيد نسبة النجاح والفرار بـ 15%' }
};

const UPGRADES = {
  silencer: { name: 'كاتم صوت للمسدس 🤫', price: 5000, desc: 'يقلل فرصة القبض عليك عند الخطف والسرقة بنسبة 20%' },
  thermal: { name: 'منظار حراري للرشاش 🎯', price: 12000, desc: 'يرفع نسبة نجاح الاغتيال والاحتلال إلى أقصى حد' }
};

const JOBS = {
  driver: { name: '🏎️ السائق الخبير', desc: 'تزيد نسبة نجاح الخطف والفرار من الشرطة بنسبة +20% إضافية.' },
  hacker: { name: '💻 الهكر الإجرامي', desc: 'تخفيض رسوم غسيل الأموال إلى 5% وإمكانية استخدام أمر `/اختراق`.' },
  hitman: { name: '🪖 المسلح العنيف', desc: 'تزيد نسبة نجاح الاغتيال واحتلال المناطق بـ +20% وتكسب أرباح سرقة أرفع.' },
  boss: { name: '🏭 العراب / رجل الأعمال', desc: 'ميزات استثمارية عبر أمر `/استثمار` وأرباح مضاعفة.' },
  spy: { name: '🕵️ الجاسوس', desc: 'إمكانية استخدام أمر `/تجسس` لكشف حسابات ومعدات الخصوم.' },
  medic: { name: '🩺 طبيب السوق السوداء', desc: 'تخفيض غرامات القبض 50% وإمكانية استخدام `/إسعاف` للمسجونين.' },
  demo: { name: '💣 خبير المتفجرات', desc: 'زيادة القوة التدميرية ونسبة نجاح السرقات الكبرى.' },
  lawyer: { name: '⚖️ المحامي الفاسد', desc: 'تخفيض الكفالة لـ 2,500 عملة وتقليل مدة السجن للنصف تلقائياً.' }
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

// === 5. تسجيل الأوامر البرمجية ===
const commands = [
  new SlashCommandBuilder().setName('قائمة').setDescription('عرض لوحة التحكم الرئيسية واللوحات التفاعلية بالأزرار الشاملة'),
  new SlashCommandBuilder().setName('انضمام').setDescription('إنشاء وتفعيل حساب جديد'),
  new SlashCommandBuilder().setName('حساب').setDescription('عرض بيانات حسابك ومستواك وترسانتك وألقابك'),
  new SlashCommandBuilder().setName('يومي').setDescription('الحصول على المكافأة اليومية'),
  new SlashCommandBuilder().setName('صندوق_يومي').setDescription('فتح صندوق الهدايا اليومي (مكافآت نقدية 100-1000)'),
  new SlashCommandBuilder().setName('سوق_سوداء').setDescription('شراء الأسلحة والسيارات والدروع'),
  new SlashCommandBuilder()
    .setName('شراء')
    .setDescription('شراء عنصر من السوق السوداء')
    .addStringOption(opt =>
      opt.setName('القطعة').setDescription('اختر القطعة').setRequired(true)
        .addChoices(
          { name: 'سكين (500)', value: 'knife' },
          { name: 'مسدس (2000)', value: 'pistol' },
          { name: 'رشاش (7000)', value: 'smg' },
          { name: 'درع واقي (4000)', value: 'armor' },
          { name: 'سيارة هرب (15000)', value: 'car' }
        )),
  new SlashCommandBuilder()
    .setName('ترقية')
    .setDescription('ترقية المعدات والأسلحة')
    .addStringOption(opt => opt.setName('الترقية').setDescription('اختر الترقية').setRequired(true).addChoices(
      { name: 'كاتم صوت للمسدس (5000)', value: 'silencer' },
      { name: 'منظار حراري للرشاش (12000)', value: 'thermal' }
    )),
  new SlashCommandBuilder().setName('سرقة').setDescription('تنفيذ عملية سطو مسلح لجمع الأموال'),
  new SlashCommandBuilder()
    .setName('تحويل')
    .setDescription('تحويل أموال إلى لاعب آخر')
    .addUserOption(opt => opt.setName('المستلم').setDescription('الشخص المراد تحويل المال له').setRequired(true))
    .addIntegerOption(opt => opt.setName('المبلغ').setDescription('المبلغ المراد تحويله').setRequired(true)),
  new SlashCommandBuilder()
    .setName('عقد')
    .setDescription('وضع مكافأة مالية على رأس شخص لاغتياله (الحد الأدنى 5000 عملة)')
    .addUserOption(opt => opt.setName('الهدف').setDescription('الشخص المطلوب اغتياله').setRequired(true))
    .addIntegerOption(opt => opt.setName('المكافأة').setDescription('المبلغ المرصود').setRequired(true)),
  new SlashCommandBuilder().setName('المطلوبين').setDescription('عرض لائحة الأشخاص المطلوب اغتيالهم ومجرمي عدو الشعب'),
  new SlashCommandBuilder().setName('عمل_شاق').setDescription('كسر الأحجار لتقليص مدة عقوبة السجن'),
  new SlashCommandBuilder().setName('تهريب').setDescription('تنفيذ عملية هجوم مسلح لتحرير أعضاء عصابتك من السجن'),
  new SlashCommandBuilder().setName('تجسس').setDescription('خاص للجاسوس: كشف رصيد ومعدات لاعب آخر').addUserOption(opt => opt.setName('الهدف').setDescription('الهدف').setRequired(true)),
  new SlashCommandBuilder().setName('اختراق').setDescription('خاص للهكر: محاولة سرقة إلكترونية من لاعب آخر').addUserOption(opt => opt.setName('الهدف').setDescription('الهدف').setRequired(true)),
  new SlashCommandBuilder().setName('إسعاف').setDescription('خاص للطبيب: تقليص سجن زميلك').addUserOption(opt => opt.setName('الهدف').setDescription('الهدف').setRequired(true)),
  new SlashCommandBuilder().setName('استثمار').setDescription('خاص للعراب: جني عوائد أرباح استثمارية سريعة'),
  new SlashCommandBuilder().setName('سباق').setDescription('مراهنة سباق سيارات الشوارع').addIntegerOption(opt => opt.setName('المبلغ').setDescription('المبلغ').setRequired(true)),
  new SlashCommandBuilder().setName('روليت').setDescription('لعبة الكازينو الروليت بالألوان')
    .addIntegerOption(opt => opt.setName('المبلغ').setDescription('المبلغ').setRequired(true))
    .addStringOption(opt => opt.setName('اللون').setDescription('اختر اللون').setRequired(true).addChoices(
      { name: '🔴 أحمر (مضاعفة x2)', value: 'red' },
      { name: '⚫ أسود (مضاعفة x2)', value: 'black' },
      { name: '🟢 أخضر (مضاعفة x14)', value: 'green' }
    )),
  new SlashCommandBuilder().setName('سطو_بنك').setDescription('فعالية جماعية لاقتحام البنك المركزي'),
  new SlashCommandBuilder()
    .setName('غسيل_أموال')
    .setDescription('تبييض الأموال (رسوم 15% أو 5% للهكر)')
    .addIntegerOption(opt => opt.setName('المبلغ').setDescription('المبلغ').setRequired(true)),
  new SlashCommandBuilder()
    .setName('خطف')
    .setDescription('محاولة خطف لاعب باشتراط فدية مالية')
    .addUserOption(opt => opt.setName('الهدف').setDescription('الشخص المراد خطفه').setRequired(true))
    .addIntegerOption(opt => opt.setName('الفدية').setDescription('الفدية').setRequired(true)),
  new SlashCommandBuilder().setName('فدية').setDescription('دفع الفدية لإعادة حريتك'),
  new SlashCommandBuilder().setName('المخطوفين').setDescription('عرض قائمة اللاعبين المخطوفين ومقدار الفدية'),
  new SlashCommandBuilder().setName('السجن').setDescription('عرض قائمة المحتجزين بالسجن حالياً والوقت المتبقي'),
  new SlashCommandBuilder()
    .setName('اغتيال')
    .setDescription('تنفيذ اغتيال لتجريد الهدف من جزء من رصيده والحصول على مكافأة العقد إن وجدت')
    .addUserOption(opt => opt.setName('الهدف').setDescription('الهدف').setRequired(true)),
  new SlashCommandBuilder()
    .setName('احتلال')
    .setDescription('محاولة السيطرة على منطقة لصالح عصابتك')
    .addStringOption(opt =>
      opt.setName('المنطقة').setDescription('اختر المنطقة').setRequired(true)
        .addChoices(
          { name: 'البنك المركزي', value: 'bank' },
          { name: 'الميناء المحصن', value: 'port' },
          { name: 'الملهى الليلي', value: 'club' }
        )),
  new SlashCommandBuilder().setName('نرد').setDescription('مراهنة على رمية النرد').addIntegerOption(opt => opt.setName('المبلغ').setDescription('المبلغ').setRequired(true)),
  new SlashCommandBuilder().setName('عملة').setDescription('لعبة ملك أو كتابة').addIntegerOption(opt => opt.setName('المبلغ').setDescription('المبلغ').setRequired(true)).addStringOption(opt => opt.setName('الوجه').setDescription('اختر').setRequired(true).addChoices({ name: 'ملك 👑', value: 'king' }, { name: 'كتابة 📜', value: 'tail' })),
  new SlashCommandBuilder().setName('سلوت').setDescription('ماكينة السلوت الكازينو').addIntegerOption(opt => opt.setName('المبلغ').setDescription('المبلغ').setRequired(true)),
  new SlashCommandBuilder().setName('كفالة').setDescription('دفع كفالة الخروج من السجن (5000 عملة)'),
  new SlashCommandBuilder().setName('إنشاء_عصابة').setDescription('تأسيس عصابة جديدة (5000 عملة)').addStringOption(opt => opt.setName('الاسم').setDescription('اسم العصابة').setRequired(true)),
  new SlashCommandBuilder().setName('عصابتي').setDescription('لوحة تحكم عصابتك والأعضاء'),
  new SlashCommandBuilder().setName('لوحة_الصدارة').setDescription('عرض قائمة الأثرياء'),
  new SlashCommandBuilder().setName('تعويض').setDescription('إضافة رصيد (للمشرفين)').addUserOption(opt => opt.setName('الشخص').setDescription('المستفيد').setRequired(true)).addIntegerOption(opt => opt.setName('المبلغ').setDescription('المبلغ').setRequired(true))
];

commands.forEach(cmd => client.commands.set(cmd.name, cmd));

client.once(Events.ClientReady, async () => {
  console.log(`✅ جاهز وتعمل كـ: ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ تم تسجيل كافة الأوامر بنجاح!');
  } catch (error) {
    console.error('❌ خطأ في تحميل الأوامر:', error);
  }
});

function initUser(data, userId) {
  if (!data.users) data.users = {};
  if (!data.users[userId]) {
    data.users[userId] = {
      balance: 1000,
      cleanBalance: 0,
      xp: 0,
      level: 1,
      kills: 0,
      escapes: 0,
      createdAt: new Date().toISOString(),
      dailyLast: null,
      boxLast: 0,
      inventory: { knife: 0, pistol: 0, smg: 0, armor: 0, car: 0 },
      upgrades: { silencer: false, thermal: false },
      job: null,
      gang: null,
      jailUntil: 0,
      kidnappedBy: null,
      ransomPrice: 0,
      lastInvest: 0
    };
  }
  const u = data.users[userId];
  if (u.cleanBalance === undefined) u.cleanBalance = 0;
  if (u.xp === undefined) u.xp = 0;
  if (u.level === undefined) u.level = 1;
  if (u.kills === undefined) u.kills = 0;
  if (u.escapes === undefined) u.escapes = 0;
  if (!u.inventory) u.inventory = { knife: 0, pistol: 0, smg: 0, armor: 0, car: 0 };
  if (!u.upgrades) u.upgrades = { silencer: false, thermal: false };
  if (u.boxLast === undefined) u.boxLast = 0;
  if (u.lastInvest === undefined) u.lastInvest = 0;
}

function getUserTitle(userData, totalWealth, bountyAmount) {
  if (bountyAmount >= 20000) return '🚨 عدو الشعب رقم 1 (Most Wanted)';
  if (totalWealth >= 500000) return '👑 العراب (Godfather)';
  if (userData.kills >= 10) return '🗡️ سفاح المدينة';
  if (userData.escapes >= 5) return '🔓 ملك الهروب السري';
  if (userData.upgrades && userData.upgrades.thermal && userData.upgrades.silencer) return '🏎️ الشبح الخفي';
  return '📌 مجرم مبتدئ';
}

function addXp(userData, amount) {
  userData.xp += amount;
  const nextLevelXp = userData.level * 200;
  if (userData.xp >= nextLevelXp) {
    userData.level += 1;
    return true;
  }
  return false;
}

// === 6. التفاعل الكامل مع الأزرار والقوائم والمودال وحرب العصابات ===
client.on(Events.InteractionCreate, async interaction => {
  const data = await readData();

  // A. معالجة القوائم المنسدلة (Select Menu) لشراء الأسلحة واحتلال المناطق
  if (interaction.isStringSelectMenu()) {
    const userId = interaction.user.id;
    initUser(data, userId);
    const userData = data.users[userId];

    if (interaction.customId === 'select_buy_market') {
      const selectedValue = interaction.values[0];
      if (WEAPONS[selectedValue]) {
        const item = WEAPONS[selectedValue];
        if (userData.balance < item.price) {
          return interaction.reply({ content: `❌ رصيدك لا يكفي لشراء ${item.name}! تحتاج إلى ${item.price.toLocaleString()} عملة.`, ephemeral: true });
        }
        userData.balance -= item.price;
        userData.inventory[selectedValue] = (userData.inventory[selectedValue] || 0) + 1;
        await saveData(data);
        return interaction.reply({ content: `✅ **تم شراء ${item.name} بنجاح!** تم خصم ${item.price.toLocaleString()} عملة.`, ephemeral: true });
      } else if (UPGRADES[selectedValue]) {
        const up = UPGRADES[selectedValue];
        if (userData.upgrades[selectedValue]) {
          return interaction.reply({ content: `❌ أنت تملك ترقية ${up.name} بالفعل!`, ephemeral: true });
        }
        if (userData.balance < up.price) {
          return interaction.reply({ content: `❌ رصيدك لا يكفي! تحتاج إلى ${up.price.toLocaleString()} عملة.`, ephemeral: true });
        }
        userData.balance -= up.price;
        userData.upgrades[selectedValue] = true;
        await saveData(data);
        return interaction.reply({ content: `🛠️ **تم ترقية تجهيزك بـ ${up.name} بنجاح!**`, ephemeral: true });
      }
    }

    if (interaction.customId === 'select_capture_territory') {
      const terrKey = interaction.values[0];
      const territory = data.territories[terrKey];

      if (!userData.gang || !data.gangs[userData.gang]) {
        return interaction.reply({ content: '❌ يجب أن تنتمي لعصابة لتستطيع السيطرة على المناطق!', ephemeral: true });
      }

      let captureChance = 0.50;
      if (userData.inventory.smg > 0) captureChance += 0.25;
      if (userData.inventory.car > 0) captureChance += 0.15;
      if (userData.job === 'hitman') captureChance += 0.20;
      if (userData.upgrades.thermal) captureChance += 0.15;

      if (Math.random() < captureChance) {
        territory.owner = userData.gang;
        data.gangs[userData.gang].bank = (data.gangs[userData.gang].bank || 0) + territory.tax;
        await saveData(data);
        return interaction.reply({ content: `⚔️ **اقتحام وسيطرة ناجحة!** سيطرت عصابة **[ ${userData.gang} ]** على **${territory.name}** وجنت **${territory.tax.toLocaleString()}** عملة لخزينتها! 🔥`, ephemeral: true });
      } else {
        return interaction.reply({ content: `💥 **فشلت عملية السيطرة على ${territory.name}!** تصدت الحراسات للهجوم!`, ephemeral: true });
      }
    }
    return;
  }

  // B. معالجة إدخال الأموال وإعلان الحرب عبر Modals
  if (interaction.isModalSubmit()) {
    const userId = interaction.user.id;
    initUser(data, userId);
    const userData = data.users[userId];

    if (interaction.customId === 'modal_wash_money') {
      const amount = parseInt(interaction.fields.getTextInputValue('wash_amount_input'));
      if (isNaN(amount) || amount <= 0 || userData.balance < amount) {
        return interaction.reply({ content: '❌ مبلغ غير صالح أو رصيدك لا يكفي!', ephemeral: true });
      }
      const feeRate = userData.job === 'hacker' ? 0.05 : 0.15;
      const fee = Math.floor(amount * feeRate);
      const cleanAmount = amount - fee;

      userData.balance -= amount;
      userData.cleanBalance += cleanAmount;
      await saveData(data);
      return interaction.reply({ content: `🧼 **تم غسيل الأموال بنجاح!** تحويل **${cleanAmount.toLocaleString()}** عملة للبنك (رسوم: ${fee.toLocaleString()} عملة).`, ephemeral: true });
    }

    if (interaction.customId === 'modal_dice_game') {
      const bet = parseInt(interaction.fields.getTextInputValue('dice_bet_input'));
      if (isNaN(bet) || bet <= 0 || userData.balance < bet) return interaction.reply({ content: '❌ رصيدك لا يكفي!', ephemeral: true });

      const playerRoll = Math.floor(Math.random() * 6) + 1;
      const botRoll = Math.floor(Math.random() * 6) + 1;

      if (playerRoll > botRoll) {
        userData.balance += bet;
        await saveData(data);
        return interaction.reply({ content: `🎲 **فوز ساحق!** رميت **${playerRoll}** مقابل **${botRoll}** للكازينو. كسبت **${bet.toLocaleString()}** عملة! 💰✨`, ephemeral: true });
      } else if (playerRoll < botRoll) {
        userData.balance -= bet;
        await saveData(data);
        return interaction.reply({ content: `🎲 **خسارة!** رميت **${playerRoll}** مقابل **${botRoll}** للكازينو. خسرت **${bet.toLocaleString()}** عملة.`, ephemeral: true });
      } else {
        return interaction.reply({ content: `🎲 **تعادل!** رميتما **${playerRoll}**، تم استرداد المبلغ.`, ephemeral: true });
      }
    }

    if (interaction.customId === 'modal_declare_gang_war') {
      const targetGangName = interaction.fields.getTextInputValue('war_target_gang');
      const betAmount = parseInt(interaction.fields.getTextInputValue('war_bet_amount'));

      if (!userData.gang || !data.gangs[userData.gang]) {
        return interaction.reply({ content: '❌ يجب أن تكون عضواً أو زعيماً لعصابة لإعلان الحرب!', ephemeral: true });
      }

      const myGang = data.gangs[userData.gang];
      if (myGang.leader !== userId) {
        return interaction.reply({ content: '❌ الزعيم فقط هو من يستطيع إعلان حرب العصابات!', ephemeral: true });
      }

      if (!data.gangs[targetGangName]) {
        return interaction.reply({ content: '❌ العصابة المستهدفة غير موجودة!', ephemeral: true });
      }

      if (targetGangName === userData.gang) {
        return interaction.reply({ content: '❌ لا يمكنك إعلان الحرب على عصابتك!', ephemeral: true });
      }

      if ((myGang.bank || 0) < betAmount) {
        return interaction.reply({ content: `❌ خزينة عصابتك لا تكفي لمبلغ الرهان (${betAmount.toLocaleString()} عملة)!`, ephemeral: true });
      }

      const warId = `war_${Date.now()}`;
      data.activeWars[warId] = {
        attacker: userData.gang,
        defender: targetGangName,
        bet: betAmount,
        attackerScore: 0,
        defenderScore: 0,
        participants: []
      };

      await saveData(data);

      const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('⚔️ إعلان حرب عصابات ملحمية جديدة!')
        .setDescription(`أعلنت عصابة **[ ${userData.gang} ]** الحرب المسلحة على عصابة **[ ${targetGangName} ]**!\n💰 **مبلغ الرهان على المعركة:** **${betAmount.toLocaleString()}** عملة من الخزينة.`)
        .addFields({ name: '📌 طريقة المشاركة:', value: 'انقر على زر `⚔️ المشاركة في الهجوم / الدفاع` بالأسفل للقتال لصالح عصابتك!' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`btn_join_war_${warId}`).setLabel('⚔️ الانضمام للمعركة المسلحة').setStyle(ButtonStyle.Danger)
      );

      return interaction.reply({ embeds: [embed], components: [row] });
    }
    return;
  }

  // C. معالجة ضغطات الأزرار الرئيسية الشاملة وحرب العصابات
  if (interaction.isButton()) {
    const userId = interaction.user.id;
    initUser(data, userId);
    const userData = data.users[userId];

    // الانضمام لمعركة حرب العصابات المباشرة
    if (interaction.customId.startsWith('btn_join_war_')) {
      const warId = interaction.customId.replace('btn_join_war_', '');
      const war = data.activeWars[warId];

      if (!war) return interaction.reply({ content: '❌ هذه المعركة انتهت بالفعل!', ephemeral: true });
      if (!userData.gang) return interaction.reply({ content: '❌ يجب أن تكون عضواً في إحدى العصابتين المشاركتين!', ephemeral: true });
      if (userData.gang !== war.attacker && userData.gang !== war.defender) {
        return interaction.reply({ content: '❌ عصابتك ليست طرفاً في هذه الحرب!', ephemeral: true });
      }

      if (war.participants.includes(userId)) {
        return interaction.reply({ content: '❌ لقد شاركت بالفعل في هذه المعركة!', ephemeral: true });
      }

      war.participants.push(userId);
      let power = 1;
      if (userData.inventory.smg > 0) power += 3;
      if (userData.inventory.pistol > 0) power += 1;
      if (userData.upgrades.thermal) power += 2;

      if (userData.gang === war.attacker) {
        war.attackerScore += power;
      } else {
        war.defenderScore += power;
      }

      await saveData(data);

      let winner = null;
      if (war.attackerScore >= 10) winner = war.attacker;
      if (war.defenderScore >= 10) winner = war.defender;

      if (winner) {
        const loser = winner === war.attacker ? war.defender : war.attacker;
        data.gangs[winner].bank = (data.gangs[winner].bank || 0) + war.bet;
        data.gangs[loser].bank = Math.max(0, (data.gangs[loser].bank || 0) - war.bet);
        delete data.activeWars[warId];
        await saveData(data);

        return interaction.reply({ content: `🏆💥 **انتصارات ملحمية!** فازت عصابة **[ ${winner} ]** بحرب العصابات واستولت على **${war.bet.toLocaleString()}** عملة من خزينة **[ ${loser} ]**!` });
      }

      return interaction.reply({ content: `⚔️ **انضممت للقتال!** أضفت قوة **+${power}** لصالح عصابتك [ ${userData.gang} ]!\nالنتيجة الحالية: المهاجم (${war.attackerScore}) vs المدافع (${war.defenderScore})`, ephemeral: true });
    }

    // 1. زر حسابي
    if (interaction.customId === 'main_btn_account') {
      let invText = '';
      for (const [k, v] of Object.entries(userData.inventory)) {
        if (v > 0) invText += `• ${WEAPONS[k].name}: **${v}**\n`;
      }
      if (!invText) invText = 'لا توجد أسلحة أو سيارات';
      const statusText = userData.kidnappedBy ? `⚠️ مخطوف من قبل <@${userData.kidnappedBy}>` : 'طليق وحر 🕊️';
      const jobText = userData.job ? JOBS[userData.job].name : 'بدون مهنة ❌';
      const totalWealth = (userData.balance || 0) + (userData.cleanBalance || 0);
      const userBounty = data.bounties[userId] || 0;
      const title = getUserTitle(userData, totalWealth, userBounty);

      const embed = new EmbedBuilder()
        .setColor('#2ECC71')
        .setTitle(`📊 ملف المجرم: ${interaction.user.username}`)
        .addFields(
          { name: '🎖️ اللقب الشرفي', value: title, inline: false },
          { name: '💰 الرصيد النقدي', value: `${(userData.balance || 0).toLocaleString()} عملة`, inline: true },
          { name: '🏦 الرصيد المبيض', value: `${(userData.cleanBalance || 0).toLocaleString()} عملة`, inline: true },
          { name: '⭐ المستوى', value: `مستوى **${userData.level || 1}** (${userData.xp || 0} XP)`, inline: true },
          { name: '🎭 المهنة الإجرامية', value: jobText, inline: true },
          { name: '📌 الحالة الحالية', value: statusText, inline: true },
          { name: '🛡️ العصابة', value: userData.gang || 'بدون عصابة ❌', inline: true },
          { name: '🎒 الترسانة والمركبات', value: invText, inline: false }
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // 2. زر اليومي والصندوق
    if (interaction.customId === 'main_btn_daily') {
      const now = Date.now();
      if (now - (userData.dailyLast || 0) < 24 * 60 * 60 * 1000) {
        return interaction.reply({ content: '❌ استلمت مكافأتك اليومية بالفعل!', ephemeral: true });
      }
      userData.dailyLast = now;
      userData.balance += 1500;
      await saveData(data);
      return interaction.reply({ content: '🎉 **حصلت على مكافأتك اليومية (1,500 عملة)!**', ephemeral: true });
    }

    if (interaction.customId === 'main_btn_box') {
      const now = Date.now();
      if (now - (userData.boxLast || 0) < 24 * 60 * 60 * 1000) {
        return interaction.reply({ content: '❌ فتحت صندوقك اليومي بالفعل!', ephemeral: true });
      }
      userData.boxLast = now;
      const prizeMoney = Math.floor(Math.random() * 901) + 100;
      userData.balance += prizeMoney;
      await saveData(data);
      return interaction.reply({ content: `🎁 **فتح الصندوق اليومي!** حصلت على **${prizeMoney.toLocaleString()}** عملة نقدية! 💰`, ephemeral: true });
    }

    // 3. زر تنفيذ سرقة
    if (interaction.customId === 'main_btn_rob') {
      const now = Date.now();
      if ((userData.jailUntil || 0) > now) return interaction.reply({ content: '🚨 أنت مسجون! لا يمكنك القيام بالسطو.', ephemeral: true });

      let baseChance = 0.40 + (userData.level * 0.02);
      if (userData.inventory.pistol > 0) baseChance += 0.15;
      if (userData.inventory.smg > 0) baseChance += 0.25;
      if (userData.inventory.car > 0) baseChance += 0.10;
      if (userData.upgrades.silencer) baseChance += 0.10;

      if (Math.random() < baseChance) {
        const loot = Math.floor(Math.random() * 800) + 200 + (userData.level * 50);
        userData.balance += loot;
        addXp(userData, 40);
        await saveData(data);
        return interaction.reply({ content: `🥷 **عملية سطو ناجحة!** حصلت على **${loot.toLocaleString()}** عملة و **40 XP**! 💰`, ephemeral: true });
      } else {
        if (userData.inventory.armor > 0) {
          userData.inventory.armor -= 1;
          await saveData(data);
          return interaction.reply({ content: '🛡️ فشلت عملية السطو ولكن الدرع الواقي حماك من السجن!', ephemeral: true });
        } else {
          const jailMinutes = userData.job === 'lawyer' ? 5 : 10;
          userData.jailUntil = now + (jailMinutes * 60 * 1000);
          userData.balance = Math.max(0, userData.balance - 300);
          await saveData(data);
          return interaction.reply({ content: `🚨 **قبضت عليك الشرطة!** تم تغريمك وسجنك لمدة **${jailMinutes} دقائق**! 🚔`, ephemeral: true });
        }
      }
    }

    // 4. زر غسيل الأموال تفاعلي
    if (interaction.customId === 'main_btn_wash') {
      const modal = new ModalBuilder()
        .setCustomId('modal_wash_money')
        .setTitle('🧼 غسيل الأموال النقدي');

      const washInput = new TextInputBuilder()
        .setCustomId('wash_amount_input')
        .setLabel('المبلغ المراد غسيله للبنك:')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('مثال: 5000')
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(washInput));
      return interaction.showModal(modal);
    }

    // 5. زر السوق الشامل (عرض القوائم المنسدلة)
    if (interaction.customId === 'main_btn_market') {
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('select_buy_market')
        .setPlaceholder('🛒 اختر السلاح أو الترقية لشراء فوراً...')
        .addOptions([
          { label: '🔪 سكين حاد', description: 'السعر: 500 عملة', value: 'knife' },
          { label: '🔫 مسدس 9mm', description: 'السعر: 2,000 عملة', value: 'pistol' },
          { label: '🪖 رشاش قصير SMG', description: 'السعر: 7,000 عملة', value: 'smg' },
          { label: '🛡️ درع واقي', description: 'السعر: 4,000 عملة', value: 'armor' },
          { label: '🏎️ سيارة هرب سريعة', description: 'السعر: 15,000 عملة', value: 'car' },
          { label: '🤫 كاتم صوت للمسدس (ترقية)', description: 'السعر: 5,000 عملة', value: 'silencer' },
          { label: '🎯 منظار حراري للرشاش (ترقية)', description: 'السعر: 12,000 عملة', value: 'thermal' }
        ]);

      const row = new ActionRowBuilder().addComponents(selectMenu);
      return interaction.reply({ content: '🛍️ **السوق السوداء والترقيات التكتيكية:**\nاختر القطعة التي تريد شرائها فوراً من القائمة أدناه:', components: [row], ephemeral: true });
    }

    // 6. زر السجن والكفالة والتهريب
    if (interaction.customId === 'main_btn_jail') {
      const now = Date.now();
      let jailList = '';
      for (const [id, u] of Object.entries(data.users || {})) {
        if ((u.jailUntil || 0) > now) {
          const remSec = Math.ceil((u.jailUntil - now) / 1000);
          jailList += `• <@${id}> — متبقي **${remSec} ثانية**\n`;
        }
      }
      const embed = new EmbedBuilder()
        .setColor('#c0392b')
        .setTitle('🚔 السجن المركزي والعمليات التفاعلية')
        .setDescription(jailList || 'السجن خالي تماماً حالياً! 🕊️');

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('jail_btn_bail').setLabel('🔓 دفع كفالة (5,000)').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('jail_btn_work').setLabel('⛏️ عمل شاق').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('jail_btn_breakout').setLabel('🥷 هجوم لتهريب العصابة').setStyle(ButtonStyle.Danger)
      );

      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    if (interaction.customId === 'jail_btn_bail') {
      const now = Date.now();
      if ((userData.jailUntil || 0) <= now) return interaction.reply({ content: '❌ أنت لست مسجوناً!', ephemeral: true });

      const bailCost = userData.job === 'lawyer' ? 2500 : 5000;
      if (userData.balance < bailCost) return interaction.reply({ content: `❌ رصيدك لا يكفي للكفالة (${bailCost.toLocaleString()} عملة)!`, ephemeral: true });

      userData.balance -= bailCost;
      userData.jailUntil = 0;
      await saveData(data);
      return interaction.reply({ content: `🔓 **خرجت من السجن بنجاح!** تم دفع الكفالة (${bailCost.toLocaleString()} عملة).`, ephemeral: true });
    }

    if (interaction.customId === 'jail_btn_work') {
      const now = Date.now();
      if ((userData.jailUntil || 0) <= now) return interaction.reply({ content: '❌ أنت لست مسجوناً لتنفذ العمل الشاق!', ephemeral: true });

      userData.jailUntil = Math.max(now, userData.jailUntil - (120 * 1000));
      const earned = Math.floor(Math.random() * 50) + 10;
      userData.balance += earned;
      await saveData(data);
      return interaction.reply({ content: `⛏️ **قمت بكسر الأحجار في السجن!** تم تقليص عقوبتك بـ **120 ثانية** وكسبت **${earned}** عملة.`, ephemeral: true });
    }

    if (interaction.customId === 'jail_btn_breakout') {
      const now = Date.now();
      if (!userData.gang || !data.gangs[userData.gang]) return interaction.reply({ content: '❌ يجب أن تنتمي لعصابة لتنفذ عملية تهريب!', ephemeral: true });
      if ((userData.inventory.smg || 0) <= 0) return interaction.reply({ content: '❌ تحتاج إلى رشاش (`smg`) لتنفيذ الهجوم على السجن!', ephemeral: true });

      let gangJailedMembers = [];
      for (const [id, u] of Object.entries(data.users || {})) {
        if (u.gang === userData.gang && (u.jailUntil || 0) > now) gangJailedMembers.push(id);
      }
      if (gangJailedMembers.length === 0) return interaction.reply({ content: '❌ لا يوجد أعضاء مسجونين من عصابتك!', ephemeral: true });

      if (Math.random() < 0.60) {
        gangJailedMembers.forEach(id => { data.users[id].jailUntil = 0; });
        userData.escapes += 1;
        await saveData(data);
        return interaction.reply({ content: '🥷💥 **عملية تهريب ناجحة!** تم تحرير أعضاء العصابة بالكامل! 🔥', ephemeral: true });
      } else {
        userData.jailUntil = now + (15 * 60 * 1000);
        await saveData(data);
        return interaction.reply({ content: '🚨 **فشلت عملية التهريب واعتقلتك الشرطة لمدة 15 دقيقة!**', ephemeral: true });
      }
    }

    // 7. زر ألعاب الكازينو
    if (interaction.customId === 'main_btn_casino') {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_casino_dice').setLabel('🎲 رمي النرد').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('btn_casino_bank_heist').setLabel('🏦 سطو البنك').setStyle(ButtonStyle.Danger)
      );
      return interaction.reply({ content: '🎰 **ألعاب الكازينو والفعاليات السريعة:**', components: [row], ephemeral: true });
    }

    if (interaction.customId === 'btn_casino_dice') {
      const modal = new ModalBuilder().setCustomId('modal_dice_game').setTitle('🎲 رهان لعبة النرد');
      const diceInput = new TextInputBuilder().setCustomId('dice_bet_input').setLabel('المبلغ المراد الرهان عليه:').setStyle(TextInputStyle.Short).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(diceInput));
      return interaction.showModal(modal);
    }

    if (interaction.customId === 'btn_casino_bank_heist') {
      const now = Date.now();
      if ((userData.jailUntil || 0) > now) return interaction.reply({ content: '❌ أنت مسجون ولا يمكنك الاقتحام!', ephemeral: true });

      let chance = 0.40;
      if (userData.inventory.smg > 0) chance += 0.20;
      if (userData.inventory.car > 0) chance += 0.15;

      if (Math.random() < chance) {
        const loot = Math.floor(Math.random() * 5000) + 3000;
        userData.balance += loot;
        await saveData(data);
        return interaction.reply({ content: `🏦💥 **نجح اقتحام البنك!** كسبت **${loot.toLocaleString()}** عملة! 🔥`, ephemeral: true });
      } else {
        userData.jailUntil = now + (10 * 60 * 1000);
        await saveData(data);
        return interaction.reply({ content: '🚨 **فشل سطو البنك وسجنتك الشرطة 10 دقائق!**', ephemeral: true });
      }
    }

    // 8. زر حرب العصابات والاحتلال الشامل
    if (interaction.customId === 'main_btn_gang_wars') {
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('select_capture_territory')
        .setPlaceholder('🗺️ اختر المنطقة لاحتلالها لصالح عصابتك...')
        .addOptions([
          { label: '🏦 البنك المركزي', description: 'أرباح الخزينة: 2,000 عملة', value: 'bank' },
          { label: '🚢 الميناء المحصن', description: 'أرباح الخزينة: 1,500 عملة', value: 'port' },
          { label: '🍸 الملهى الليلي', description: 'أرباح الخزينة: 1,000 عملة', value: 'club' }
        ]);

      const row1 = new ActionRowBuilder().addComponents(selectMenu);
      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_declare_gang_war').setLabel('⚔️ إعلان حرب عصابات مسلحة').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('btn_ambush_convoy').setLabel('🚛 مهاجمة شاحنة الأسلحة المهربة').setStyle(ButtonStyle.Success)
      );

      return interaction.reply({ content: '⚔️ **لوحة حرب العصابات والسيطرة على الأحياء:**', components: [row1, row2], ephemeral: true });
    }

    if (interaction.customId === 'btn_declare_gang_war') {
      const modal = new ModalBuilder().setCustomId('modal_declare_gang_war').setTitle('⚔️ إعلان حرب بين العصابات');
      const targetInput = new TextInputBuilder().setCustomId('war_target_gang').setLabel('اسم العصابة المستهدفة:').setStyle(TextInputStyle.Short).setRequired(true);
      const betInput = new TextInputBuilder().setCustomId('war_bet_amount').setLabel('مبلغ الرهان من خزينة العصابة:').setStyle(TextInputStyle.Short).setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(targetInput),
        new ActionRowBuilder().addComponents(betInput)
      );
      return interaction.showModal(modal);
    }

    if (interaction.customId === 'btn_ambush_convoy') {
      if (!userData.gang) return interaction.reply({ content: '❌ يجب أن تنتمي لعصابة للاستيلاء على شاحنة الأسلحة!', ephemeral: true });

      const lootMoney = Math.floor(Math.random() * 4000) + 2000;
      data.gangs[userData.gang].bank = (data.gangs[userData.gang].bank || 0) + lootMoney;
      await saveData(data);

      return interaction.reply({ content: `🚛💥 **هجوم ناجح على الشاحنة!** استولت عصابتك [ ${userData.gang} ] على شحنة أسلحة وغنائم بقيمة **${lootMoney.toLocaleString()}** عملة تم إيداعها بخزينة العصابة!`, ephemeral: true });
    }

    // 9. المهن والتنقل
    if (interaction.customId === 'main_btn_jobs') {
      const currentJobText = userData.job ? JOBS[userData.job].name : 'بدون مهنة ❌';
      const embed = new EmbedBuilder()
        .setColor('#9b59b6')
        .setTitle('🎭 اختر مهنتك الإجرامية التفاعلية')
        .setDescription(`مهنتك الحالية: **${currentJobText}**\nاختر مهنتك من الأزرار أدناه:`);

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('set_job_driver').setLabel('السائق').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('set_job_hacker').setLabel('الهكر').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('set_job_hitman').setLabel('المسلح').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('set_job_boss').setLabel('العراب').setStyle(ButtonStyle.Primary)
      );

      return interaction.reply({ embeds: [embed], components: [row1], ephemeral: true });
    }

    if (interaction.customId.startsWith('set_job_')) {
      const selectedJobKey = interaction.customId.replace('set_job_', '');
      const cost = userData.job ? 3000 : 2000;
      if (userData.balance < cost) return interaction.reply({ content: `❌ تحتاج إلى ${cost} عملة!`, ephemeral: true });

      userData.balance -= cost;
      userData.job = selectedJobKey;
      await saveData(data);
      return interaction.reply({ content: `🎉 **تعينت رسمياً بمهنة ${JOBS[selectedJobKey].name}!**`, ephemeral: true });
    }

    // 10. قائمة المطلوبات والعصابات واللوحات
    if (interaction.customId === 'main_btn_wanted') {
      let bountyText = '';
      for (const [targetId, amount] of Object.entries(data.bounties || {})) {
        if (amount > 0) bountyText += `• المطلوب: <@${targetId}> ➔ **${amount.toLocaleString()}** عملة\n`;
      }
      const embed = new EmbedBuilder().setColor('#e74c3c').setTitle('🎯 قائمة العقود والمطلوبين').setDescription(bountyText || 'لا يوجد عقود حالياً!');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.customId === 'main_btn_leaderboard') {
      const sortedUsers = Object.entries(data.users)
        .map(([id, u]) => ({ id, balance: (u.balance || 0) + (u.cleanBalance || 0), level: u.level || 1 }))
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 5);

      let topUsersText = sortedUsers.map((u, i) => `${i + 1}. <@${u.id}> — **${u.balance.toLocaleString()}** عملة`).join('\n');
      const embed = new EmbedBuilder().setColor('#f1c40f').setTitle('🏆 أثرى أثرياء عالم الجريمة').setDescription(topUsersText || 'لا يوجد مسجلين');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    return;
  }

  // D. معالجة Slash Commands المباشرة
  if (!interaction.isChatInputCommand()) return;
  const { commandName, user } = interaction;

  await interaction.deferReply({ ephemeral: commandName === 'انضمام' });
  initUser(data, user.id);

  switch (commandName) {
    case 'قائمة': {
      const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('🏛️ لوحة التحكم التفاعلية الشاملة لعالم العصابات')
        .setDescription('انقر على الأزرار بالأسفل لتشغيل كافة الأوامر والأنظمة وحروب العصابات بضغطة زر واحدة: 🔥');

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('main_btn_account').setLabel('💳 حسابي').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('main_btn_daily').setLabel('💰 اليومية').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('main_btn_box').setLabel('🎁 الصندوق').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('main_btn_rob').setLabel('🥷 سرقة').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('main_btn_wash').setLabel('🧼 غسيل أموال').setStyle(ButtonStyle.Primary)
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('main_btn_market').setLabel('🛒 السوق والترقيات').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('main_btn_jail').setLabel('🚔 السجن والتهريب').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('main_btn_casino').setLabel('🎲 الكازينو والسطو').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('main_btn_gang_wars').setLabel('⚔️ حرب العصابات والأحياء').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('main_btn_jobs').setLabel('🎭 المهن').setStyle(ButtonStyle.Primary)
      );

      const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('main_btn_wanted').setLabel('🎯 المطلوبين').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('main_btn_leaderboard').setLabel('🏆 الصدارة').setStyle(ButtonStyle.Secondary)
      );

      return interaction.editReply({ embeds: [embed], components: [row1, row2, row3] });
    }

    case 'انضمام': {
      await saveData(data);
      return interaction.editReply({ content: '✅ تم تفعيل حسابك وحفظ بياناتك سحابياً بنجاح!' });
    }

    default:
      return interaction.editReply({ content: '✅ جميع الخصائص متوفرة عبر لوحة الأزرار التفاعلية باستعمال `/قائمة`!' });
  }
});

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('❌ DISCORD_TOKEN غير موجود!');
  process.exit(1);
}

client.login(token);
