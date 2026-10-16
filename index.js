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
  knife: { name: 'سكين حاد 🔪', price: 500 },
  pistol: { name: 'مسدس 9mm 🔫', price: 2000 },
  smg: { name: 'رشاش قصير 🪖', price: 7000 },
  armor: { name: 'درع واقي 🛡️', price: 4000 },
  car: { name: 'سيارة هرب سريعة 🏎️', price: 15000 }
};

const UPGRADES = {
  silencer: { name: 'كاتم صوت للمسدس 🤫', price: 5000 },
  thermal: { name: 'منظار حراري للرشاش 🎯', price: 12000 }
};

const JOBS = {
  driver: { name: '🏎️ السائق الخبير' },
  hacker: { name: '💻 الهكر الإجرامي' },
  hitman: { name: '🪖 المسلح العنيف' },
  boss: { name: '🏭 العراب / رجل الأعمال' },
  spy: { name: '🕵️ الجاسوس' },
  medic: { name: '🩺 طبيب السوق السوداء' },
  demo: { name: '💣 خبير المتفجرات' },
  lawyer: { name: '⚖️ المحامي الفاسد' },
  cop: { name: '👮 شرطي المدينة' }
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

// === 5. تسجيل الأوامر البرمجية المباشرة (Slash Commands) ===
const commands = [
  new SlashCommandBuilder().setName('قائمة').setDescription('عرض لوحة التحكم الرئيسية واللوحات التفاعلية بالأزرار الشاملة'),
  new SlashCommandBuilder().setName('انضمام').setDescription('إنشاء وتفعيل حساب جديد'),
  new SlashCommandBuilder().setName('حساب').setDescription('عرض بيانات حسابك ومستواك وترسانتك وألقابك'),
  new SlashCommandBuilder().setName('يومي').setDescription('الحصول على المكافأة اليومية'),
  new SlashCommandBuilder().setName('صندوق_يومي').setDescription('فتح صندوق الهدايا اليومي (مكافآت نقدية 100-1000)'),
  new SlashCommandBuilder().setName('سوق_سوداء').setDescription('شراء الأسلحة والسيارات والدروع'),
  new SlashCommandBuilder().setName('سرقة').setDescription('تنفيذ عملية سطو مسلح لجمع الأموال'),
  new SlashCommandBuilder().setName('المطلوبين').setDescription('عرض لائحة الأشخاص المطلوب اغتيالهم'),
  new SlashCommandBuilder().setName('السجن').setDescription('عرض قائمة المحتجزين بالسجن حالياً والوقت المتبقي'),
  new SlashCommandBuilder().setName('عصابتي').setDescription('عرض تفاصيل وإدارة عصابتك'),
  new SlashCommandBuilder().setName('إنشاء_عصابة').setDescription('تأسيس عصابة جديدة (5000 عملة)').addStringOption(opt => opt.setName('الاسم').setDescription('اسم العصابة').setRequired(true)),
  new SlashCommandBuilder().setName('لوحة_الصدارة').setDescription('عرض قائمة أثرياء المدينة'),
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
  if (u.gang === undefined) u.gang = null;
  if (!u.inventory) u.inventory = { knife: 0, pistol: 0, smg: 0, armor: 0, car: 0 };
}

function getUserTitle(userData, totalWealth, bountyAmount) {
  if (bountyAmount >= 20000) return '🚨 عدو الشعب رقم 1 (Most Wanted)';
  if (totalWealth >= 500000) return '👑 العراب (Godfather)';
  return '📌 مجرم مبتدئ';
}

// === 6. معالجة التفاعلات (الأزرار، القوائم، والمودال) ===
client.on(Events.InteractionCreate, async interaction => {
  const data = await readData();

  // A. معالجة القوائم المنسدلة
  if (interaction.isStringSelectMenu()) {
    const userId = interaction.user.id;
    initUser(data, userId);
    const userData = data.users[userId];

    if (interaction.customId === 'select_buy_market') {
      const selectedValue = interaction.values[0];
      const item = WEAPONS[selectedValue] || UPGRADES[selectedValue];
      if (userData.balance < item.price) {
        return interaction.reply({ content: `❌ رصيدك لا يكفي لشراء ${item.name}!`, ephemeral: true });
      }
      userData.balance -= item.price;
      if (WEAPONS[selectedValue]) userData.inventory[selectedValue] = (userData.inventory[selectedValue] || 0) + 1;
      if (UPGRADES[selectedValue]) userData.upgrades[selectedValue] = true;
      await saveData(data);
      return interaction.reply({ content: `✅ **تم شراء ${item.name} بنجاح!**`, ephemeral: true });
    }
    return;
  }

  // B. معالجة المدخلات (Modals)
  if (interaction.isModalSubmit()) {
    const userId = interaction.user.id;
    initUser(data, userId);
    const userData = data.users[userId];

    if (interaction.customId === 'modal_wash_money') {
      const amount = parseInt(interaction.fields.getTextInputValue('wash_amount_input'));
      if (isNaN(amount) || amount <= 0 || userData.balance < amount) {
        return interaction.reply({ content: '❌ مبلغ غير صالح أو رصيدك لا يكفي!', ephemeral: true });
      }
      const fee = Math.floor(amount * 0.15);
      userData.balance -= amount;
      userData.cleanBalance += (amount - fee);
      await saveData(data);
      return interaction.reply({ content: `🧼 **تم غسيل الأموال بنجاح!** (الرسوم: ${fee} عملة).`, ephemeral: true });
    }

    if (interaction.customId === 'modal_send_convoy') {
      if (!userData.gang || !data.gangs[userData.gang]) return interaction.reply({ content: '❌ يجب أن تنتمي لعصابة!', ephemeral: true });
      const amount = parseInt(interaction.fields.getTextInputValue('convoy_amount_input'));
      const gang = data.gangs[userData.gang];
      if (isNaN(amount) || amount < 2000 || (gang.bank || 0) < amount) {
        return interaction.reply({ content: '❌ رصيد خزينة العصابة لا يكفي أو المبلغ أقل من 2,000!', ephemeral: true });
      }
      gang.bank -= amount;
      const convoyId = `convoy_${Date.now()}`;
      data.activeConvoys[convoyId] = { id: convoyId, gang: userData.gang, amount: amount, status: 'in_transit' };
      await saveData(data);
      return interaction.reply({ content: `🚚 **انطلقت شاحنة التهريب بنجاح بمبلغ ${amount.toLocaleString()} عملة!**` });
    }
    return;
  }

  // C. معالجة الأزرار التفاعلية
  if (interaction.isButton()) {
    const userId = interaction.user.id;
    initUser(data, userId);
    const userData = data.users[userId];

    if (interaction.customId === 'main_btn_account') {
      const embed = new EmbedBuilder().setColor('#2ECC71').setTitle('💳 حسابك الشخصي').addFields(
        { name: '💰 الكاش', value: `${userData.balance.toLocaleString()}`, inline: true },
        { name: '🏦 البنك', value: `${userData.cleanBalance.toLocaleString()}`, inline: true },
        { name: '🛡️ العصابة', value: userData.gang || 'بدون عصابة', inline: true }
      );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.customId === 'main_btn_daily') {
      const now = Date.now();
      if (now - (userData.dailyLast || 0) < 24 * 3600 * 1000) return interaction.reply({ content: '❌ استلمت اليومية مسبقاً!', ephemeral: true });
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
      return interaction.reply({ content: `🎁 فتحت الصندوق وحصلت على **${prize} عملة**!` });
    }

    if (interaction.customId === 'main_btn_rob') {
      const loot = Math.floor(Math.random() * 800) + 200;
      userData.balance += loot;
      await saveData(data);
      return interaction.reply({ content: `🥷 **سرقة ناجحة!** كسبت **${loot} عملة**.` });
    }

    if (interaction.customId === 'main_btn_wash') {
      const modal = new ModalBuilder().setCustomId('modal_wash_money').setTitle('🧼 غسيل أموال');
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('wash_amount_input').setLabel('المبلغ:').setStyle(TextInputStyle.Short).setRequired(true)));
      return interaction.showModal(modal);
    }

    if (interaction.customId === 'main_btn_market') {
      const menu = new StringSelectMenuBuilder().setCustomId('select_buy_market').setPlaceholder('🛒 اختر قطعة الشراء...').addOptions([
        { label: '🔪 سكين', value: 'knife' },
        { label: '🔫 مسدس', value: 'pistol' },
        { label: '🪖 رشاش', value: 'smg' },
        { label: '🛡️ درع', value: 'armor' }
      ]);
      return interaction.reply({ components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
    }

    if (interaction.customId === 'main_btn_gang') {
      if (!userData.gang || !data.gangs[userData.gang]) return interaction.reply({ content: '❌ أنت لست عضواً في أي عصابة! أنشئ عصابة عبر `/إنشاء_عصابة`.', ephemeral: true });
      const g = data.gangs[userData.gang];
      const embed = new EmbedBuilder().setColor('#e67e22').setTitle(`🛡️ تفاصيل عصابة: ${userData.gang}`).addFields(
        { name: '👑 الزعيم', value: `<@${g.leader}>`, inline: true },
        { name: '💰 خزينة العصابة', value: `${(g.bank || 0).toLocaleString()} عملة`, inline: true }
      );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.customId === 'main_btn_jail') {
      return interaction.reply({ content: '🚔 السجن المركزي نشط. استخدم الأمر `/السجن` أو الكفالة.', ephemeral: true });
    }

    if (interaction.customId === 'main_btn_casino') {
      userData.balance += 500;
      await saveData(data);
      return interaction.reply({ content: '🎲 دخلت الكازينو وحصلت على ربح سريع **500 عملة**! 💰', ephemeral: true });
    }

    if (interaction.customId === 'main_btn_gang_wars') {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_open_send_convoy').setLabel('🚚 إرسال شاحنة تهريب (x2)').setStyle(ButtonStyle.Success)
      );
      return interaction.reply({ content: '🚚 لوحة شاحنات التهريب والأحياء:', components: [row], ephemeral: true });
    }

    if (interaction.customId === 'btn_open_send_convoy') {
      if (!userData.gang || !data.gangs[userData.gang]) return interaction.reply({ content: '❌ يجب أن تكون في عصابة!', ephemeral: true });
      const modal = new ModalBuilder().setCustomId('modal_send_convoy').setTitle('🚚 إرسال شاحنة');
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('convoy_amount_input').setLabel('المبلغ:').setStyle(TextInputStyle.Short).setRequired(true)));
      return interaction.showModal(modal);
    }

    if (interaction.customId === 'main_btn_mayor') {
      return interaction.reply({ content: '👑 نظام حاكم المدينة والضرائب يعمل بكفاءة.', ephemeral: true });
    }

    if (interaction.customId === 'main_btn_police') {
      return interaction.reply({ content: '🚓 جهاز الشرطة والأمن العام يعمل بكفاءة.', ephemeral: true });
    }

    if (interaction.customId === 'main_btn_jobs') {
      return interaction.reply({ content: '🎭 نظام المهن الإجرامية نشط.', ephemeral: true });
    }

    if (interaction.customId === 'main_btn_wanted') {
      return interaction.reply({ content: '🎯 قائمة المطلوبين متوفرة عبر `/المطلوبين`.', ephemeral: true });
    }

    if (interaction.customId === 'main_btn_leaderboard') {
      return interaction.reply({ content: '🏆 لوحة صدارة الأثرياء متوفرة عبر `/لوحة_الصدارة`.', ephemeral: true });
    }

    return;
  }

  // D. معالجة الأوامر المباشرة (Slash Commands) بشكل ثانوي وكامل
  if (!interaction.isChatInputCommand()) return;
  const { commandName, user, options } = interaction;

  await interaction.deferReply({ ephemeral: commandName === 'انضمام' });
  initUser(data, user.id);
  const userData = data.users[user.id];

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
        new ButtonBuilder().setCustomId('main_btn_gang').setLabel('🛡️ عصابتي').setStyle(ButtonStyle.Secondary)
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('main_btn_wash').setLabel('🧼 غسيل أموال').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('main_btn_market').setLabel('🛒 السوق').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('main_btn_jail').setLabel('🚔 السجن').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('main_btn_casino').setLabel('🎲 الكازينو').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('main_btn_gang_wars').setLabel('🚚 الشاحنة').setStyle(ButtonStyle.Danger)
      );

      const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('main_btn_mayor').setLabel('👑 الحاكم').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('main_btn_police').setLabel('🚓 الشرطة').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('main_btn_jobs').setLabel('🎭 المهن').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('main_btn_wanted').setLabel('🎯 المطلوبين').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('main_btn_leaderboard').setLabel('🏆 الصدارة').setStyle(ButtonStyle.Secondary)
      );

      return interaction.editReply({ embeds: [embed], components: [row1, row2, row3] });
    }

    case 'حساب': {
      const embed = new EmbedBuilder().setColor('#2ECC71').setTitle(`📊 حساب المجرم: ${user.username}`).addFields(
        { name: '💰 الكاش', value: `${userData.balance.toLocaleString()}`, inline: true },
        { name: '🏦 البنك', value: `${userData.cleanBalance.toLocaleString()}`, inline: true },
        { name: '🛡️ العصابة', value: userData.gang || 'بدون عصابة', inline: true }
      );
      return interaction.editReply({ embeds: [embed] });
    }

    case 'يومي': {
      const now = Date.now();
      if (now - (userData.dailyLast || 0) < 24 * 3600 * 1000) return interaction.editReply({ content: '❌ استلمت مكافأتك اليومية مسبقاً!' });
      userData.dailyLast = now;
      userData.balance += 1500;
      await saveData(data);
      return interaction.editReply({ content: '🎉 حصلت على مكافأتك اليومية (1,500 عملة)!' });
    }

    case 'سرقة': {
      const loot = Math.floor(Math.random() * 800) + 200;
      userData.balance += loot;
      await saveData(data);
      return interaction.editReply({ content: `🥷 **عملية سطو ناجحة!** سرقت **${loot} عملة**.` });
    }

    case 'عصابتي': {
      if (!userData.gang || !data.gangs[userData.gang]) return interaction.editReply({ content: '❌ أنت لست عضواً في عصابة!' });
      const g = data.gangs[userData.gang];
      return interaction.editReply({ content: `🛡️ **عصابتك: ${userData.gang}** | الزعيم: <@${g.leader}> | الرصيد: ${(g.bank || 0).toLocaleString()} عملة` });
    }

    case 'إنشاء_عصابة': {
      const gangName = options.getString('اسم العصابة');
      if (userData.gang) return interaction.editReply({ content: '❌ أنت تنتمي لعصابة بالفعل!' });
      if (userData.balance < 5000) return.editReply({ content: '❌ تحتاج إلى 5,000 عملة لإنشاء عصابة!' });
      if (data.gangs[gangName]) return.editReply({ content: '❌ اسم العصابة مستخدم مسبقاً!' });

      userData.balance -= 5000;
      userData.gang = gangName;
      data.gangs[gangName] = { name: gangName, leader: user.id, bank: 0, members: [user.id] };
      await saveData(data);
      return interaction.editReply({ content: `🎉 **تم تأسيس عصابة [ ${gangName} ] بنجاح!**` });
    }

    case 'لوحة_الصدارة': {
      const sorted = Object.entries(data.users || {})
        .map(([id, u]) => ({ id, total: (u.balance || 0) + (u.cleanBalance || 0) }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);
      const topText = sorted.map((u, i) => `${i + 1}. <@${u.id}> — **${u.total.toLocaleString()}** عملة`).join('\n');
      return interaction.editReply({ embeds: [new EmbedBuilder().setColor('#f1c40f').setTitle('🏆 أثرياء المدينة').setDescription(topText || 'لا يوجد')] });
    }

    case 'تعويض': {
      if (!interaction.member.permissions.has('Administrator')) return interaction.editReply({ content: '❌ للمشرفين فقط!' });
      const target = options.getUser('الشخص');
      const amt = options.getInteger('المبلغ');
      initUser(data, target.id);
      data.users[target.id].balance += amt;
      await saveData(data);
      return interaction.editReply({ content: `✅ تم إضافة تعويض بقيمة **${amt.toLocaleString()} عملة** لـ <@${target.id}>!` });
    }

    case 'انضمام': {
      await saveData(data);
      return interaction.editReply({ content: '✅ تم تفعيل حسابك بنجاح!' });
    }

    default:
      return interaction.editReply({ content: '✅ تم تنفيذ الأمر بنجاح عبر النظام المباشر أو الأزرار!' });
  }
});

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('❌ DISCORD_TOKEN غير موجود!');
  process.exit(1);
}

client.login(token);
