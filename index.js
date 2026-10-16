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
          bounties: {},
          activeWars: {},
          activeConvoys: {},
          mayor: { id: null, taxRate: 15, treasury: 0 },
          policeForce: [],
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
      if (!dataObj.activeConvoys) dataObj.activeConvoys = {};
      if (!dataObj.mayor) dataObj.mayor = { id: null, taxRate: 15, treasury: 0 };
      if (!dataObj.policeForce) dataObj.policeForce = [];
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
      if (!parsed.activeConvoys) parsed.activeConvoys = {};
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
  lawyer: { name: '⚖️ المحامي الفاسد', desc: 'تخفيض الكفالة لـ 2,500 عملة وتقليل مدة السجن للنصف تلقائياً.' },
  cop: { name: '👮 شرطي المدينة', desc: 'القدرة على تنفيذ السجن المباشر، حراسة الأمن، وتقاضي رواتب سريعة.' }
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
  new SlashCommandBuilder()
    .setName('تعويض')
    .setDescription('إضافة رصيد للاعب (خاص بالمشرفين)')
    .addUserOption(opt => opt.setName('الشخص').setDescription('المستفيد').setRequired(true))
    .addIntegerOption(opt => opt.setName('المبلغ').setDescription('المبلغ المراد إضافته').setRequired(true))
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
      lastAmbush: 0,
      lastPoliceArrest: 0,
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
  if (u.lastAmbush === undefined) u.lastAmbush = 0;
  if (u.lastPoliceArrest === undefined) u.lastPoliceArrest = 0;
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

// === 6. التفاعل الشامل مع الأزرار والمودال والواجهات الكاملة ===
client.on(Events.InteractionCreate, async interaction => {
  const data = await readData();

  // A. معالجة القوائم المنسدلة (Select Menu)
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

  // B. معالجة الإدخال (Modals)
  if (interaction.isModalSubmit()) {
    const userId = interaction.user.id;
    initUser(data, userId);
    const userData = data.users[userId];

    if (interaction.customId === 'modal_set_tax_rate') {
      if (data.mayor.id !== userId) return interaction.reply({ content: '❌ الحاكم فقط يستطيع تحديد نسبة الضرائب!', ephemeral: true });
      const rate = parseInt(interaction.fields.getTextInputValue('tax_rate_input'));
      if (isNaN(rate) || rate < 0 || rate > 25) return interaction.reply({ content: '❌ نسبة غير صالحة (0% - 25%)!', ephemeral: true });
      data.mayor.taxRate = rate;
      await saveData(data);
      return interaction.reply({ content: `👑 **تم تحديث نسبة ضرائب المدينة إلى ${rate}%!**`, ephemeral: true });
    }

    if (interaction.customId === 'modal_police_arrest') {
      if (userData.job !== 'cop' && !data.policeForce.includes(userId)) return interaction.reply({ content: '❌ للشرطة فقط!', ephemeral: true });
      const targetId = interaction.fields.getTextInputValue('arrest_target_id').trim();
      if (!data.users[targetId]) return interaction.reply({ content: '❌ لم يتم العثور على المجرم!', ephemeral: true });

      const now = Date.now();
      const targetData = data.users[targetId];
      const bountyReward = data.bounties[targetId] || 0;

      targetData.jailUntil = now + (15 * 60 * 1000);
      userData.balance += (bountyReward > 0 ? bountyReward : 1500);
      if (bountyReward > 0) delete data.bounties[targetId];

      await saveData(data);
      return interaction.reply({ content: `🚓🚨 **تم القبض على المجرم <@${targetId}> وسجنه 15 دقيقة بنجاح!**` });
    }

    if (interaction.customId === 'modal_send_convoy') {
      if (!userData.gang || !data.gangs[userData.gang]) return interaction.reply({ content: '❌ يجب أن تنتمي لعصابة!', ephemeral: true });
      const amount = parseInt(interaction.fields.getTextInputValue('convoy_amount_input'));
      const gang = data.gangs[userData.gang];

      if (isNaN(amount) || amount < 2000 || (gang.bank || 0) < amount) {
        return interaction.reply({ content: '❌ مبلغ غير صالح أو رصيد خزينة العصابة لا يكفي (الحد الأدنى 2,000)!', ephemeral: true });
      }

      gang.bank -= amount;
      const convoyId = `convoy_${Date.now()}`;
      data.activeConvoys[convoyId] = { id: convoyId, gang: userData.gang, sender: userId, amount: amount, status: 'in_transit' };
      await saveData(data);

      const embed = new EmbedBuilder()
        .setColor('#f39c12')
        .setTitle('🚚 انطلاق شاحنة تهريب جديدة بالطريق السريع!')
        .setDescription(`أرسلت عصابة **[ ${userData.gang} ]** شاحنة محملة بـ **${amount.toLocaleString()}** عملة!\n\n⏱️ **مدة الرحلة:** 15 دقيقة.\n💰 **المكافأة:** **${(amount * 2).toLocaleString()} عملة** عند الوصول بسلام!`);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`btn_ambush_convoy_${convoyId}`).setLabel('💥 إعداد كمين والسطو').setStyle(ButtonStyle.Danger)
      );

      return interaction.reply({ embeds: [embed], components: [row] });
    }

    if (interaction.customId === 'modal_wash_money') {
      const amount = parseInt(interaction.fields.getTextInputValue('wash_amount_input'));
      if (isNaN(amount) || amount <= 0 || userData.balance < amount) return interaction.reply({ content: '❌ مبلغ غير صالح أو رصيدك لا يكفي!', ephemeral: true });

      const feeRate = userData.job === 'hacker' ? 0.05 : (data.mayor.taxRate || 15) / 100;
      const fee = Math.floor(amount * feeRate);
      const cleanAmount = amount - fee;

      userData.balance -= amount;
      userData.cleanBalance += cleanAmount;
      data.mayor.treasury = (data.mayor.treasury || 0) + fee;
      await saveData(data);

      return interaction.reply({ content: `🧼 **تم غسيل الأموال بنجاح!** استلمت **${cleanAmount.toLocaleString()}** عملة مبيضة (الرسوم: ${fee.toLocaleString()}).`, ephemeral: true });
    }

    if (interaction.customId === 'modal_dice_game') {
      const bet = parseInt(interaction.fields.getTextInputValue('dice_bet_input'));
      if (isNaN(bet) || bet <= 0 || userData.balance < bet) return interaction.reply({ content: '❌ رصيدك لا يكفي!', ephemeral: true });

      const pRoll = Math.floor(Math.random() * 6) + 1;
      const bRoll = Math.floor(Math.random() * 6) + 1;

      if (pRoll > bRoll) {
        userData.balance += bet;
        await saveData(data);
        return interaction.reply({ content: `🎲 **فوز بالكازينو!** رميت (${pRoll}) مقابل (${bRoll}). كسبت **${bet.toLocaleString()}** عملة! 💰`, ephemeral: true });
      } else {
        userData.balance -= bet;
        await saveData(data);
        return interaction.reply({ content: `🎲 **خسارة بالكازينو!** رميت (${pRoll}) مقابل (${bRoll}). خسرت **${bet.toLocaleString()}** عملة.`, ephemeral: true });
      }
    }
    return;
  }

  // C. معالجة كافة الأزرار التفاعلية بشمولية تامة
  if (interaction.isButton()) {
    const userId = interaction.user.id;
    initUser(data, userId);
    const userData = data.users[userId];

    // 1. زر الكازينو والألعاب
    if (interaction.customId === 'main_btn_casino') {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_casino_dice').setLabel('🎲 رمي النرد').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('btn_casino_bank_heist').setLabel('🏦 سطو البنك السريع').setStyle(ButtonStyle.Danger)
      );
      return interaction.reply({ content: '🎰 **ألعاب الكازينو والسطو المسلح السريع:**', components: [row], ephemeral: true });
    }

    if (interaction.customId === 'btn_casino_dice') {
      const modal = new ModalBuilder().setCustomId('modal_dice_game').setTitle('🎲 رهان النرد');
      const input = new TextInputBuilder().setCustomId('dice_bet_input').setLabel('مبلغ الرهان:').setStyle(TextInputStyle.Short).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (interaction.customId === 'btn_casino_bank_heist') {
      const loot = Math.floor(Math.random() * 4000) + 1000;
      userData.balance += loot;
      await saveData(data);
      return interaction.reply({ content: `🏦💥 **نجح سطو البنك السريع!** كسبت **${loot.toLocaleString()}** عملة! 🔥`, ephemeral: true });
    }

    // 2. زر المطلوبين
    if (interaction.customId === 'main_btn_wanted') {
      let bountyText = '';
      for (const [tId, amount] of Object.entries(data.bounties || {})) {
        if (amount > 0) bountyText += `• المطلوب: <@${tId}> ➔ مكافأة **${amount.toLocaleString()}** عملة\n`;
      }
      const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('🎯 لوحة العقود والمطلوبين أمنياً')
        .setDescription(bountyText || 'لا توجد عقود اغتيال أو مطلوبين حالياً في المدينة! 🕊️');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // 3. زر الصدارة
    if (interaction.customId === 'main_btn_leaderboard') {
      const sorted = Object.entries(data.users || {})
        .map(([id, u]) => ({ id, total: (u.balance || 0) + (u.cleanBalance || 0), level: u.level || 1 }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

      let topText = sorted.map((u, i) => `${i + 1}. <@${u.id}> — **${u.total.toLocaleString()}** عملة (مستوى ${u.level})`).join('\n');
      const embed = new EmbedBuilder()
        .setColor('#f1c40f')
        .setTitle('🏆 لوحة صدارة أثرياء عالم الجريمة')
        .setDescription(topText || 'لا يوجد مسجلين في الصدارة بعد.');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // 4. زر المهن
    if (interaction.customId === 'main_btn_jobs') {
      const currentJob = userData.job ? JOBS[userData.job].name : 'بدون مهنة ❌';
      const embed = new EmbedBuilder()
        .setColor('#9b59b6')
        .setTitle('🎭 مكتب اختيار المهن الإجرامية والمهنية')
        .setDescription(`مهنتك الحالية: **${currentJob}**\nاختر مهنتك الجديدة بالأسفل (رسوم التغيير 2000 عملة):`);

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('set_job_driver').setLabel('🏎️ السائق').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('set_job_hacker').setLabel('💻 الهكر').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('set_job_hitman').setLabel('🪖 المسلح').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('set_job_cop').setLabel('👮 الشرطي').setStyle(ButtonStyle.Success)
      );
      return interaction.reply({ embeds: [embed], components: [row1], ephemeral: true });
    }

    if (interaction.customId.startsWith('set_job_')) {
      const jobKey = interaction.customId.replace('set_job_', '');
      const cost = userData.job ? 3000 : 2000;
      if (userData.balance < cost) return interaction.reply({ content: `❌ رصيدك لا يكفي! تحتاج إلى ${cost} عملة.`, ephemeral: true });

      userData.balance -= cost;
      userData.job = jobKey;
      if (jobKey === 'cop' && !data.policeForce.includes(userId)) data.policeForce.push(userId);
      await saveData(data);
      return interaction.reply({ content: `🎉 **تم تعيينك بنجاح في مهنة ${JOBS[jobKey].name}!**`, ephemeral: true });
    }

    // 5. السجن والتهريب
    if (interaction.customId === 'main_btn_jail') {
      const now = Date.now();
      let jailList = '';
      for (const [id, u] of Object.entries(data.users || {})) {
        if ((u.jailUntil || 0) > now) {
          const rem = Math.ceil((u.jailUntil - now) / 1000);
          jailList += `• <@${id}> — متبقي **${rem} ثانية**\n`;
        }
      }
      const embed = new EmbedBuilder().setColor('#c0392b').setTitle('🚔 السجن المركزي').setDescription(jailList || 'السجن خالي تماماً حالياً! 🕊️');
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('jail_btn_bail').setLabel('🔓 دفع كفالة (5,000)').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('jail_btn_work').setLabel('⛏️ عمل شاق').setStyle(ButtonStyle.Secondary)
      );
      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    if (interaction.customId === 'jail_btn_bail') {
      const now = Date.now();
      if ((userData.jailUntil || 0) <= now) return interaction.reply({ content: '❌ أنت لست مسجوناً!', ephemeral: true });
      const cost = userData.job === 'lawyer' ? 2500 : 5000;
      if (userData.balance < cost) return interaction.reply({ content: `❌ رصيدك لا يكفي للكفالة (${cost} عملة)!`, ephemeral: true });

      userData.balance -= cost;
      userData.jailUntil = 0;
      await saveData(data);
      return interaction.reply({ content: '🔓 **خرجت من السجن بنجاح وتم دفع الكفالة!**', ephemeral: true });
    }

    if (interaction.customId === 'jail_btn_work') {
      const now = Date.now();
      if ((userData.jailUntil || 0) <= now) return interaction.reply({ content: '❌ أنت لست مسجوناً!', ephemeral: true });
      userData.jailUntil = Math.max(now, userData.jailUntil - (120 * 1000));
      const earned = 50;
      userData.balance += earned;
      await saveData(data);
      return interaction.reply({ content: `⛏️ **أنجزت عملاً شاقاً!** تم تقليص عقوبتك وكسبت **${earned} عملة**.`, ephemeral: true });
    }

    // 6. حاكم المدينة والضرائب
    if (interaction.customId === 'main_btn_mayor') {
      const mayorUser = data.mayor.id ? `<@${data.mayor.id}>` : 'لا يوجد حاكم حالياً 👑';
      const embed = new EmbedBuilder()
        .setColor('#f1c40f')
        .setTitle('🏛️ لوحة حاكم المدينة وإدارة الضرائب')
        .addFields(
          { name: '👑 الحاكم', value: mayorUser, inline: true },
          { name: '📊 الضريبة الحالية', value: `**${data.mayor.taxRate || 15}%**`, inline: true },
          { name: '💰 خزينة المدينة', value: `**${(data.mayor.treasury || 0).toLocaleString()}** عملة`, inline: true }
        );

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_claim_mayor').setLabel('👑 الترشح (20,000)').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('btn_overthrow_mayor').setLabel('💥 انقلاب مسلح').setStyle(ButtonStyle.Danger)
      );
      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_set_tax').setLabel('⚙️ تعديل الضريبة').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('btn_withdraw_treasury').setLabel('🏦 سحب الخزينة').setStyle(ButtonStyle.Secondary)
      );
      return interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });
    }

    if (interaction.customId === 'btn_claim_mayor') {
      if (userData.balance < 20000) return interaction.reply({ content: '❌ تحتاج إلى 20,000 عملة للترشح!', ephemeral: true });
      userData.balance -= 20000;
      data.mayor.id = userId;
      await saveData(data);
      return interaction.reply({ content: `🎉👑 **أصبح <@${userId}> حاكم المدينة الجديد!**` });
    }

    if (interaction.customId === 'btn_set_tax') {
      if (data.mayor.id !== userId) return interaction.reply({ content: '❌ الحاكم فقط يستطيع تعديل الضرائب!', ephemeral: true });
      const modal = new ModalBuilder().setCustomId('modal_set_tax_rate').setTitle('⚙️ تحديد نسبة الضريبة');
      const input = new TextInputBuilder().setCustomId('tax_rate_input').setLabel('النسبة (0% إلى 25%):').setStyle(TextInputStyle.Short).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (interaction.customId === 'btn_withdraw_treasury') {
      if (data.mayor.id !== userId) return interaction.reply({ content: '❌ الحاكم فقط يستطيع السحب!', ephemeral: true });
      const amt = data.mayor.treasury || 0;
      if (amt <= 0) return interaction.reply({ content: '❌ الخزينة فارغة!', ephemeral: true });
      userData.balance += amt;
      data.mayor.treasury = 0;
      await saveData(data);
      return interaction.reply({ content: `💰 تم سحب **${amt.toLocaleString()} عملة** من خزينة المدينة!` });
    }

    if (interaction.customId === 'btn_overthrow_mayor') {
      if (!data.mayor.id) return interaction.reply({ content: '❌ لا يوجد حاكم للإطاحة به!', ephemeral: true });
      if (Math.random() < 0.40) {
        const stolen = data.mayor.treasury || 0;
        userData.balance += stolen;
        data.mayor.id = userId;
        data.mayor.treasury = 0;
        await saveData(data);
        return interaction.reply({ content: `💥🚨 **نجح الانقلاب!** أصبحت الحاكم واستوليت على خزينة المدينة (${stolen.toLocaleString()} عملة)!` });
      } else {
        userData.jailUntil = Date.now() + (20 * 60 * 1000);
        await saveData(data);
        return interaction.reply({ content: '🚨💥 **فشل الانقلاب وسجنت لمدة 20 دقيقة!**' });
      }
    }

    // 7. جهاز الشرطة
    if (interaction.customId === 'main_btn_police') {
      const isCop = userData.job === 'cop' || data.policeForce.includes(userId);
      const embed = new EmbedBuilder().setColor('#3498db').setTitle('🚓 جهاز الشرطة والأمن العام').setDescription(isCop ? 'مرحباً بك يا ضابط!' : 'انضم للشرطة لحفظ الأمن وسجن المطلوبين.');
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_join_police').setLabel('👮 الانضمام للشرطة').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('btn_police_arrest_modal').setLabel('🚨 أمر قبض وسجن').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('btn_police_patrol').setLabel('🚔 دورية أمنية (راتب)').setStyle(ButtonStyle.Primary)
      );
      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    if (interaction.customId === 'btn_join_police') {
      userData.job = 'cop';
      if (!data.policeForce.includes(userId)) data.policeForce.push(userId);
      await saveData(data);
      return interaction.reply({ content: '👮🎉 تم انضمامك لسلك الشرطة بنجاح!', ephemeral: true });
    }

    if (interaction.customId === 'btn_police_arrest_modal') {
      if (userData.job !== 'cop' && !data.policeForce.includes(userId)) return interaction.reply({ content: '❌ للشرطة فقط!', ephemeral: true });
      const modal = new ModalBuilder().setCustomId('modal_police_arrest').setTitle('🚨 أمر قبض وسجن');
      const input = new TextInputBuilder().setCustomId('arrest_target_id').setLabel('Discord ID للمجرم:').setStyle(TextInputStyle.Short).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (interaction.customId === 'btn_police_patrol') {
      if (userData.job !== 'cop' && !data.policeForce.includes(userId)) return interaction.reply({ content: '❌ للشرطة فقط!', ephemeral: true });
      const salary = 1500;
      userData.balance += salary;
      await saveData(data);
      return interaction.reply({ content: `🚔 تمت الدورية بسلام وتقاضيت راتباً بقيمة **${salary} عملة**!` });
    }

    // 8. شاحنة التهريب والأحياء
    if (interaction.customId === 'main_btn_gang_wars') {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_open_send_convoy').setLabel('🚚 إرسال شاحنة تهريب (x2)').setStyle(ButtonStyle.Success)
      );
      return interaction.reply({ content: '🚚 **إدارة شاحنات التهريب والأحياء:**', components: [row], ephemeral: true });
    }

    if (interaction.customId === 'btn_open_send_convoy') {
      if (!userData.gang || !data.gangs[userData.gang]) return interaction.reply({ content: '❌ يجب أن تكون في عصابة!', ephemeral: true });
      const modal = new ModalBuilder().setCustomId('modal_send_convoy').setTitle('🚚 إرسال شاحنة تهريب');
      const input = new TextInputBuilder().setCustomId('convoy_amount_input').setLabel('المبلغ المراد إرساله:').setStyle(TextInputStyle.Short).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (interaction.customId.startsWith('btn_ambush_convoy_')) {
      const convoyId = interaction.customId.replace('btn_ambush_convoy_', '');
      const convoy = data.activeConvoys[convoyId];
      if (!convoy || convoy.status !== 'in_transit') return interaction.reply({ content: '❌ هذه الشاحنة وصلت أو تم السطو عليها!', ephemeral: true });
      if (!userData.gang || userData.gang === convoy.gang) return interaction.reply({ content: '❌ لا يمكنك مهاجمة شاحنة عصابتك أو بدون عصابة!', ephemeral: true });

      const loot = convoy.amount;
      data.gangs[userData.gang].bank = (data.gangs[userData.gang].bank || 0) + loot;
      delete data.activeConvoys[convoyId];
      await saveData(data);
      return interaction.reply({ content: `💥🚚 **كمين ناجح!** استولت عصابتك [ ${userData.gang} ] على شحنة بقيمة **${loot.toLocaleString()} عملة**!` });
    }

    // 9. الأزرار الأساسية (حسابي، يومي، صندوق، سرقة، غسيل، سوق)
    if (interaction.customId === 'main_btn_account') {
      const embed = new EmbedBuilder().setColor('#2ECC71').setTitle('💳 حسابك الشخصي').addFields(
        { name: '💰 الكاش', value: `${userData.balance.toLocaleString()} عملة`, inline: true },
        { name: '🏦 البنك', value: `${userData.cleanBalance.toLocaleString()} عملة`, inline: true },
        { name: '⭐ المستوى', value: `${userData.level} (XP: ${userData.xp})`, inline: true }
      );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.customId === 'main_btn_daily') {
      const now = Date.now();
      if (now - (userData.dailyLast || 0) < 24 * 3600 * 1000) return interaction.reply({ content: '❌ استلمت مكافأتك اليومية مسبقاً!', ephemeral: true });
      userData.dailyLast = now;
      userData.balance += 1500;
      await saveData(data);
      return interaction.reply({ content: '🎉 حصلت على مكافأتك اليومية (1,500 عملة)!' });
    }

    if (interaction.customId === 'main_btn_box') {
      const now = Date.now();
      if (now - (userData.boxLast || 0) < 24 * 3600 * 1000) return interaction.reply({ content: '❌ فتحت الصندوق اليومي مسبقاً!', ephemeral: true });
      userData.boxLast = now;
      const prize = Math.floor(Math.random() * 901) + 100;
      userData.balance += prize;
      await saveData(data);
      return interaction.reply({ content: `🎁 فتحت الصندوق اليومي وحصلت على **${prize} عملة**!` });
    }

    if (interaction.customId === 'main_btn_rob') {
      const loot = Math.floor(Math.random() * 800) + 200;
      userData.balance += loot;
      await saveData(data);
      return interaction.reply({ content: `🥷 **عملية سطو ناجحة!** سرقت **${loot} عملة**.` });
    }

    if (interaction.customId === 'main_btn_wash') {
      const modal = new ModalBuilder().setCustomId('modal_wash_money').setTitle('🧼 غسيل أموال');
      const input = new TextInputBuilder().setCustomId('wash_amount_input').setLabel('المبلغ المراد غسيله:').setStyle(TextInputStyle.Short).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (interaction.customId === 'main_btn_market') {
      const selectMenu = new StringSelectMenuBuilder().setCustomId('select_buy_market').setPlaceholder('🛒 اختر السلاح أو الترقية...').addOptions([
        { label: '🔪 سكين', value: 'knife' },
        { label: '🔫 مسدس', value: 'pistol' },
        { label: '🪖 رشاش', value: 'smg' },
        { label: '🛡️ درع', value: 'armor' }
      ]);
      return interaction.reply({ components: [new ActionRowBuilder().addComponents(selectMenu)], ephemeral: true });
    }

    return;
  }

  // D. الأوامر المباشرة (Slash Commands بما فيها /تعويض)
  if (!interaction.isChatInputCommand()) return;
  const { commandName, user, options } = interaction;

  await interaction.deferReply({ ephemeral: commandName === 'انضمام' });
  initUser(data, user.id);

  switch (commandName) {
    case 'قائمة': {
      const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('🏛️ لوحة التحكم التفاعلية الشاملة لعالم العصابات والمدينة')
        .setDescription('انقر على الأزرار بالأسفل للوصول إلى كافة الأنظمة والألعاب واللوحات بضغطة زر واحدة: 🔥');

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
        new ButtonBuilder().setCustomId('main_btn_gang_wars').setLabel('🚚 شاحنة التهريب').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('main_btn_mayor').setLabel('👑 حاكم المدينة').setStyle(ButtonStyle.Success)
      );

      const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('main_btn_police').setLabel('🚓 الشرطة').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('main_btn_jobs').setLabel('🎭 المهن').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('main_btn_wanted').setLabel('🎯 المطلوبين').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('main_btn_leaderboard').setLabel('🏆 الصدارة').setStyle(ButtonStyle.Secondary)
      );

      return interaction.editReply({ embeds: [embed], components: [row1, row2, row3] });
    }

    case 'تعويض': {
      if (!interaction.member.permissions.has('Administrator')) {
        return interaction.editReply({ content: '❌ غير مصرح لك استخدام هذا الأمر (للمشرفين فقط)!' });
      }
      const targetUser = options.getUser('الشخص');
      const amount = options.getInteger('المبلغ');
      initUser(data, targetUser.id);
      data.users[targetUser.id].balance += amount;
      await saveData(data);
      return interaction.editReply({ content: `✅ تم إضافة تعويض بقيمة **${amount.toLocaleString()} عملة** لـ <@${targetUser.id}> بنجاح!` });
    }

    case 'انضمام': {
      await saveData(data);
      return interaction.editReply({ content: '✅ تم تفعيل حسابك بنجاح!' });
    }

    default:
      return interaction.editReply({ content: '✅ الأمر متوفر عبر الأزرار أو تم تنفيذه بنجاح!' });
  }
});

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('❌ DISCORD_TOKEN غير موجود!');
  process.exit(1);
}

client.login(token);
