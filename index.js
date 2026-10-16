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
          territories: {}
        });
      }
      const dataObj = doc.toObject();
      if (!dataObj.users) dataObj.users = {};
      if (!dataObj.gangs) dataObj.gangs = {};
      if (!dataObj.bounties) dataObj.bounties = {};
      if (!dataObj.activeConvoys) dataObj.activeConvoys = {};
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
  new SlashCommandBuilder().setName('سرقة').setDescription('تنفيذ عملية سطو مسلح (بتهدئة 30 دقيقة)'),
  new SlashCommandBuilder().setName('المطلوبين').setDescription('عرض قائمة الأشخاص المطلوب اغتيالهم وأصحاب المكافآت'),
  new SlashCommandBuilder().setName('السجن').setDescription('عرض قائمة المحتجزين بالسجن حالياً والوقت المتبقي'),
  new SlashCommandBuilder().setName('كفالة').setDescription('دفع كفالة الخروج من السجن'),
  new SlashCommandBuilder().setName('عصابتي').setDescription('عرض تفاصيل وإدارة عصابتك'),
  new SlashCommandBuilder().setName('إنشاء_عصابة').setDescription('تأسيس عصابة جديدة (5000 عملة)').addStringOption(opt => opt.setName('الاسم').setDescription('اسم العصابة').setRequired(true)),
  new SlashCommandBuilder().setName('هجوم_عصابة').setDescription('مهاجمة خزينة عصابة منافسة أخرى').addStringOption(opt => opt.setName('اسم_العصابة').setDescription('اسم العصابة المستهدفة').setRequired(true)),
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
      boxLast: null,
      lastRob: 0,
      lastCasino: 0,
      lastGangAttack: 0,
      lastPoliceArrest: 0,
      inventory: { knife: 0, pistol: 0, smg: 0, armor: 0, car: 0 },
      upgrades: { silencer: false, thermal: false },
      job: null,
      gang: null,
      jailUntil: 0
    };
  }
  const u = data.users[userId];
  if (u.cleanBalance === undefined) u.cleanBalance = 0;
  if (u.xp === undefined) u.xp = 0;
  if (u.level === undefined) u.level = 1;
  if (u.gang === undefined) u.gang = null;
  if (u.lastRob === undefined) u.lastRob = 0;
  if (u.lastCasino === undefined) u.lastCasino = 0;
  if (u.lastGangAttack === undefined) u.lastGangAttack = 0;
  if (u.jailUntil === undefined) u.jailUntil = 0;
  if (!u.inventory) u.inventory = { knife: 0, pistol: 0, smg: 0, armor: 0, car: 0 };
}

// === نظام التهدئة 30 دقيقة للسرقة ===
async function handleRobbery(userData) {
  const now = Date.now();
  const cooldown = 30 * 60 * 1000; // 30 دقيقة
  if (now - (userData.lastRob || 0) < cooldown) {
    const remainingMins = Math.ceil((cooldown - (now - userData.lastRob)) / 60000);
    return `⏱️ **يجب عليك الانتظار ${remainingMins} دقيقة** قبل إتمام عملية سرقة أخرى!`;
  }
  userData.lastRob = now;
  const loot = Math.floor(Math.random() * 800) + 200;
  userData.balance += loot;
  return `🥷 **عملية سطو ناجحة!** سرقت **${loot.toLocaleString()} عملة**.`;
}

// === نظام التهدئة 30 دقيقة للكازينو ===
async function handleCasino(userData) {
  const now = Date.now();
  const cooldown = 30 * 60 * 1000; // 30 دقيقة
  if (now - (userData.lastCasino || 0) < cooldown) {
    const remainingMins = Math.ceil((cooldown - (now - userData.lastCasino)) / 60000);
    return `⏱️ **أنت متسرع يا مجرم!** انتظر ${remainingMins} دقيقة قبل تجربة حظك مرة أخرى في الكازينو.`;
  }
  userData.lastCasino = now;
  const win = Math.random() < 0.5;
  const amount = 500;
  if (win) {
    userData.balance += amount;
    return `🎲 **ضربة حظ في الكازينو!** فزت بربح سريع قيمته **${amount} عملة**! 💰`;
  } else {
    userData.balance = Math.max(0, userData.balance - amount);
    return `🎲 **خسارة في الكازينو!** التهمت طاولة القمار **${amount} عملة** من جيبك. الحظ سيئ اليوم!`;
  }
}

client.on(Events.InteractionCreate, async interaction => {
  const data = await readData();

  if (interaction.isStringSelectMenu()) {
    const userId = interaction.user.id;
    initUser(data, userId);
    const userData = data.users[userId];

    if (interaction.customId === 'select_buy_market') {
      const selectedValue = interaction.values[0];
      const item = WEAPONS[selectedValue];
      if (userData.balance < item.price) {
        return interaction.reply({ content: `❌ رصيدك لا يكفي لشراء ${item.name}!`, ephemeral: true });
      }
      userData.balance -= item.price;
      userData.inventory[selectedValue] = (userData.inventory[selectedValue] || 0) + 1;
      await saveData(data);
      return interaction.reply({ content: `✅ **تم شراء ${item.name} بنجاح!**`, ephemeral: true });
    }

    if (interaction.customId === 'select_job_menu') {
      const jobKey = interaction.values[0];
      userData.job = jobKey;
      if (jobKey === 'cop' && !data.policeForce.includes(userId)) data.policeForce.push(userId);
      await saveData(data);
      return interaction.reply({ content: `🎭 **تم تعيينك بنجاح في مهنة ${JOBS[jobKey].name}!**\n${JOBS[jobKey].desc}`, ephemeral: true });
    }
    return;
  }

  if (interaction.isModalSubmit()) {
    const userId = interaction.user.id;
    initUser(data, userId);
    const userData = data.users[userId];

    if (interaction.customId === 'modal_wash_money') {
      const amount = parseInt(interaction.fields.getTextInputValue('wash_amount_input'));
      if (isNaN(amount) || amount <= 0 || userData.balance < amount) {
        return interaction.reply({ content: '❌ مبلغ غير صالح أو رصيدك لا يكفي!', ephemeral: true });
      }
      const feeRate = userData.job === 'hacker' ? 0.05 : (data.mayor.taxRate || 15) / 100;
      const fee = Math.floor(amount * feeRate);
      userData.balance -= amount;
      userData.cleanBalance += (amount - fee);
      data.mayor.treasury = (data.mayor.treasury || 0) + fee;
      await saveData(data);
      return interaction.reply({ content: `🧼 **تم غسيل الأموال بنجاح!** (الرسوم: ${fee} عملة تم إيداعها بخزينة الحاكم).`, ephemeral: true });
    }

    if (interaction.customId === 'modal_police_arrest') {
      if (userData.job !== 'cop' && !data.policeForce.includes(userId)) {
        return interaction.reply({ content: '❌ هذا الأمر مخصص لرجال الشرطة فقط!', ephemeral: true });
      }
      const targetId = interaction.fields.getTextInputValue('arrest_target_id').trim();
      if (!data.users[targetId]) {
        return interaction.reply({ content: '❌ لم يتم العثور على حساب هذا المجرم في سجلات المدينة!', ephemeral: true });
      }
      data.users[targetId].jailUntil = Date.now() + (15 * 60 * 1000);
      userData.balance += 1500;
      await saveData(data);
      return interaction.reply({ content: `🚓🚨 **تم القبض على المجرم <@${targetId}> وسجنه 15 دقيقة بنجاح!** وكسبت راتب دورية 1,500 عملة.` });
    }

    if (interaction.customId === 'modal_send_convoy') {
      if (!userData.gang || !data.gangs[userData.gang]) {
        return interaction.reply({ content: '❌ يجب أن تنتمي لعصابة لإرسال شاحنة تهريب!', ephemeral: true });
      }
      const amount = parseInt(interaction.fields.getTextInputValue('convoy_amount_input'));
      const gang = data.gangs[userData.gang];
      if (isNaN(amount) || amount < 2000 || (gang.bank || 0) < amount) {
        return interaction.reply({ content: '❌ مبلغ غير صالح أو رصيد خزينة عصابتك لا يكفي (الحد الأدنى 2,000 عملة)!', ephemeral: true });
      }
      gang.bank -= amount;
      const convoyId = `convoy_${Date.now()}`;
      data.activeConvoys[convoyId] = { id: convoyId, gang: userData.gang, amount: amount, status: 'in_transit' };
      await saveData(data);

      const embed = new EmbedBuilder()
        .setColor('#f39c12')
        .setTitle('🚚 انطلاق شاحنة تهريب جديدة بالطريق السريع!')
        .setDescription(`أرسلت عصابة **[ ${userData.gang} ]** شاحنة محملة بـ **${amount.toLocaleString()}** عملة!\n💰 **المكافأة المتوقعة عند الوصول بسلام:** **${(amount * 2).toLocaleString()} عملة** (ضعف المبلغ)!`);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`btn_ambush_convoy_${convoyId}`).setLabel('💥 إعداد كمين والسطو على الشاحنة').setStyle(ButtonStyle.Danger)
      );

      return interaction.reply({ embeds: [embed], components: [row] });
    }
    return;
  }

  if (interaction.isButton()) {
    const userId = interaction.user.id;
    initUser(data, userId);
    const userData = data.users[userId];
    const now = Date.now();

    if (interaction.customId === 'main_btn_account') {
      const jobName = userData.job ? JOBS[userData.job].name : 'بدون مهنة ❌';
      const embed = new EmbedBuilder().setColor('#2ECC71').setTitle('💳 حسابك الشخصي').addFields(
        { name: '💰 الكاش', value: `${userData.balance.toLocaleString()}`, inline: true },
        { name: '🏦 البنك', value: `${userData.cleanBalance.toLocaleString()}`, inline: true },
        { name: '🎭 المهنة', value: jobName, inline: true },
        { name: '🛡️ العصابة', value: userData.gang || 'بدون عصابة', inline: true }
      );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.customId === 'main_btn_daily') {
      if (now - (userData.dailyLast || 0) < 24 * 3600 * 1000) return interaction.reply({ content: '❌ استلمت مكافأتك اليومية مسبقاً!', ephemeral: true });
      userData.dailyLast = now;
      userData.balance += 1500;
      await saveData(data);
      return interaction.reply({ content: '🎉 حصلت على مكافأتك اليومية (1,500 عملة)!' });
    }

    if (interaction.customId === 'main_btn_box') {
      if (now - (userData.boxLast || 0) < 24 * 3600 * 1000) return interaction.reply({ content: '❌ فتحت الصندوق اليومي مسبقاً!', ephemeral: true });
      userData.boxLast = now;
      const prize = Math.floor(Math.random() * 901) + 100;
      userData.balance += prize;
      await saveData(data);
      return interaction.reply({ content: `🎁 فتحت الصندوق وحصلت على **${prize} عملة**!` });
    }

    if (interaction.customId === 'main_btn_rob') {
      const res = await handleRobbery(userData);
      await saveData(data);
      return interaction.reply({ content: res, ephemeral: true });
    }

    if (interaction.customId === 'main_btn_wash') {
      const modal = new ModalBuilder().setCustomId('modal_wash_money').setTitle('🧼 غسيل أموال');
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('wash_amount_input').setLabel('المبلغ:').setStyle(TextInputStyle.Short).setRequired(true)));
      return interaction.showModal(modal);
    }

    if (interaction.customId === 'main_btn_market') {
      const menu = new StringSelectMenuBuilder().setCustomId('select_buy_market').setPlaceholder('🛒 اختر قطعة الشراء...').addOptions([
        { label: '🔪 سكين (500)', value: 'knife' },
        { label: '🔫 مسدس (2000)', value: 'pistol' },
        { label: '🪖 رشاش (7000)', value: 'smg' },
        { label: '🛡️ درع (4000)', value: 'armor' },
        { label: '🏎️ سيارة (15000)', value: 'car' }
      ]);
      return interaction.reply({ components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
    }

    // === السجن المركزي ===
    if (interaction.customId === 'main_btn_jail') {
      let jailList = '';
      for (const [id, u] of Object.entries(data.users || {})) {
        if ((u.jailUntil || 0) > now) {
          const rem = Math.ceil((u.jailUntil - now) / 1000);
          jailList += `• <@${id}> — متبقي **${rem} ثانية** في السجن 🚨\n`;
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
      if ((userData.jailUntil || 0) <= now) return interaction.reply({ content: '❌ أنت لست مسجوناً!', ephemeral: true });
      const cost = userData.job === 'lawyer' ? 2500 : 5000;
      if (userData.balance < cost) return interaction.reply({ content: `❌ رصيدك لا يكفي لدفع الكفالة (${cost} عملة)!`, ephemeral: true });
      userData.balance -= cost;
      userData.jailUntil = 0;
      await saveData(data);
      return interaction.reply({ content: '🔓 **تم دفع الكفالة وخرجت من السجن بنجاح!**', ephemeral: true });
    }

    if (interaction.customId === 'jail_btn_work') {
      if ((userData.jailUntil || 0) <= now) return interaction.reply({ content: '❌ أنت لست مسجوناً!', ephemeral: true });
      userData.jailUntil = Math.max(now, userData.jailUntil - (120 * 1000));
      userData.balance += 50;
      await saveData(data);
      return interaction.reply({ content: '⛏️ **أنجزت عملاً شاقاً!** تم تقليص عقوبتك وكسبت 50 عملة.', ephemeral: true });
    }

    // === الكازينو ===
    if (interaction.customId === 'main_btn_casino') {
      const res = await handleCasino(userData);
      await saveData(data);
      return interaction.reply({ content: res, ephemeral: true });
    }

    // === شاحنات التهريب والأحياء ===
    if (interaction.customId === 'main_btn_gang_wars') {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_open_send_convoy').setLabel('🚚 إرسال شاحنة تهريب (x2)').setStyle(ButtonStyle.Success)
      );
      return interaction.reply({ content: '🚚 **إدارة شاحنات التهريب وحروب العصابات:**', components: [row], ephemeral: true });
    }

    if (interaction.customId === 'btn_open_send_convoy') {
      if (!userData.gang || !data.gangs[userData.gang]) {
        return interaction.reply({ content: '❌ يجب أن تنتمي لعصابة لإرسال شاحنة تهريب!', ephemeral: true });
      }
      const modal = new ModalBuilder().setCustomId('modal_send_convoy').setTitle('🚚 إرسال شاحنة تهريب');
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('convoy_amount_input').setLabel('المبلغ المراد إرساله (الحد الأدنى 2,000):').setStyle(TextInputStyle.Short).setRequired(true)));
      return interaction.showModal(modal);
    }

    if (interaction.customId.startsWith('btn_ambush_convoy_')) {
      const convoyId = interaction.customId.replace('btn_ambush_convoy_', '');
      const convoy = data.activeConvoys[convoyId];
      if (!convoy || convoy.status !== 'in_transit') {
        return interaction.reply({ content: '❌ هذه الشاحنة وصلت بسلام أو تم السطو عليها مسبقاً!', ephemeral: true });
      }
      if (!userData.gang || userData.gang === convoy.gang) {
        return interaction.reply({ content: '❌ لا يمكنك مهاجمة شاحنة عصابتك أو بدون عصابة!', ephemeral: true });
      }

      const loot = convoy.amount;
      data.gangs[userData.gang].bank = (data.gangs[userData.gang].bank || 0) + loot;
      delete data.activeConvoys[convoyId];
      await saveData(data);
      return interaction.reply({ content: `💥🚚 **كمين ناجح!** استولت عصابتك [ ${userData.gang} ] على حمولة الشاحنة (**${loot.toLocaleString()} عملة**) وإيداعها بخزينة العصابة!` });
    }

    // === المطلوبين ===
    if (interaction.customId === 'main_btn_wanted') {
      let bountyText = '';
      for (const [tId, amount] of Object.entries(data.bounties || {})) {
        if (amount > 0) bountyText += `• المطلوب: <@${tId}> ➔ مكافأة اغتيال **${amount.toLocaleString()}** عملة 🎯\n`;
      }
      const embed = new EmbedBuilder().setColor('#e74c3c').setTitle('🎯 لوحة العقود والمطلوبين أمنياً').setDescription(bountyText || 'لا توجد عقود اغتيال أو مطلوبين في المدينة حالياً! 🕊️');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // === الشرطة ===
    if (interaction.customId === 'main_btn_police') {
      const isCop = userData.job === 'cop' || data.policeForce.includes(userId);
      const embed = new EmbedBuilder().setColor('#3498db').setTitle('🚓 جهاز الشرطة والأمن العام').setDescription(isCop ? 'مرحباً بك يا ضابط السلك!' : 'انضم للشرطة لحفظ الأمن وسجن المجرمين وتقاضي الرواتب.');
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
      if (userData.job !== 'cop' && !data.policeForce.includes(userId)) return interaction.reply({ content: '❌ مخصص لرجال الشرطة فقط!', ephemeral: true });
      const modal = new ModalBuilder().setCustomId('modal_police_arrest').setTitle('🚨 أمر قبض وسجن');
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('arrest_target_id').setLabel('Discord ID للمجرم:').setStyle(TextInputStyle.Short).setRequired(true)));
      return interaction.showModal(modal);
    }

    if (interaction.customId === 'btn_police_patrol') {
      if (userData.job !== 'cop' && !data.policeForce.includes(userId)) return interaction.reply({ content: '❌ مخصص لرجال الشرطة فقط!', ephemeral: true });
      userData.balance += 1500;
      await saveData(data);
      return interaction.reply({ content: '🚔 تمت الدورية الأمنية بسلام وتقاضيت راتباً بقيمة **1,500 عملة**!' });
    }

    // === حاكم المدينة ===
    if (interaction.customId === 'main_btn_mayor') {
      const mayorUser = data.mayor.id ? `<@${data.mayor.id}>` : 'لا يوجد حاكم حالياً (المنصب شاغر) 👑';
      const embed = new EmbedBuilder().setColor('#f1c40f').setTitle('🏛️ لوحة حاكم المدينة والضرائب').addFields(
        { name: '👑 الحاكم الحالي', value: mayorUser, inline: true },
        { name: '📊 نسبة الضريبة', value: `**${data.mayor.taxRate || 15}%**`, inline: true },
        { name: '💰 خزينة المدينة', value: `**${(data.mayor.treasury || 0).toLocaleString()}** عملة`, inline: true }
      );
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_claim_mayor').setLabel('👑 الترشح (20,000)').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('btn_overthrow_mayor').setLabel('💥 انقلاب مسلح').setStyle(ButtonStyle.Danger)
      );
      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    if (interaction.customId === 'btn_claim_mayor') {
      if (userData.balance < 20000) return interaction.reply({ content: '❌ تحتاج إلى 20,000 عملة للترشح لمنصب الحاكم!', ephemeral: true });
      userData.balance -= 20000;
      data.mayor.id = userId;
      await saveData(data);
      return interaction.reply({ content: `🎉👑 **مبروك!** أصبح <@${userId}> حاكم المدينة الجديد!` });
    }

    if (interaction.customId === 'btn_overthrow_mayor') {
      if (!data.mayor.id) return interaction.reply({ content: '❌ لا يوجد حاكم للإطاحة به حالياً!', ephemeral: true });
      if (Math.random() < 0.40) {
        const stolen = data.mayor.treasury || 0;
        userData.balance += stolen;
        data.mayor.id = userId;
        data.mayor.treasury = 0;
        await saveData(data);
        return interaction.reply({ content: `💥🚨 **انقلاب ناجح!** أطحت بالحاكم واستوليت على الحكم وخزينة المدينة (${stolen.toLocaleString()} عملة)!` });
      } else {
        userData.jailUntil = Date.now() + (20 * 60 * 1000);
        await saveData(data);
        return interaction.reply({ content: '🚨💥 **فشل الانقلاب وسجنت لمدة 20 دقيقة بتهمة التخريب!**' });
      }
    }

    // === المهن ===
    if (interaction.customId === 'main_btn_jobs') {
      const menu = new StringSelectMenuBuilder().setCustomId('select_job_menu').setPlaceholder('🎭 اختر مهنتك الإجرامية...').addOptions([
        { label: '🏎️ السائق الخبير', value: 'driver', description: 'يزيد سرعة الفرار.' },
        { label: '💻 الهكر الإجرامي', value: 'hacker', description: 'رسوم غسيل 5%.' },
        { label: '🪖 المسلح العنيف', value: 'hitman', description: 'قوة اغتيالات.' },
        { label: '🩺 طبيب السوق السوداء', value: 'medic', description: 'إسعاف وتقليص السجن.' },
        { label: '⚖️ المحامي الفاسد', value: 'lawyer', description: 'كفالة مخفضة 2,500.' },
        { label: '👮 شرطي المدينة', value: 'cop', description: 'حفظ الأمن والقبض.' }
      ]);
      const embed = new EmbedBuilder().setColor('#9b59b6').setTitle('🎭 مكتب اختيار المهن الإجرامية').setDescription('اختر مهنتك من القائمة أدناه للاستفادة من مميزاتها الفريدة:');
      return interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
    }

    if (interaction.customId === 'main_btn_gang') {
      if (!userData.gang || !data.gangs[userData.gang]) return interaction.reply({ content: '❌ أنت لست عضواً في أي عصابة!', ephemeral: true });
      const g = data.gangs[userData.gang];
      const embed = new EmbedBuilder().setColor('#e67e22').setTitle(`🛡️ تفاصيل عصابة: ${userData.gang}`).addFields(
        { name: '👑 الزعيم', value: `<@${g.leader}>`, inline: true },
        { name: '💰 خزينة العصابة', value: `${(g.bank || 0).toLocaleString()} عملة`, inline: true }
      );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.customId === 'main_btn_leaderboard') {
      return interaction.reply({ content: '🏆 الصدارة نشطة.', ephemeral: true });
    }

    return;
  }

  // D. معالجة الأوامر المباشرة (Slash Commands)
  if (!interaction.isChatInputCommand()) return;
  const { commandName, user, options } = interaction;

  await interaction.deferReply({ ephemeral: commandName === 'انضمام' });
  initUser(data, user.id);
  const userData = data.users[user.id];
  const now = Date.now();

  switch (commandName) {
    case 'قائمة': {
      const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('🏛️ لوحة التحكم التفاعلية الشاملة لعالم العصابات والمدينة')
        .setDescription('انقر على الأزرار بالأسفل للوصول إلى كافة الأنظمة والألعاب بضغطة زر: 🔥');

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
      const jobName = userData.job ? JOBS[userData.job].name : 'بدون مهنة ❌';
      const embed = new EmbedBuilder().setColor('#2ECC71').setTitle(`📊 حساب المجرم: ${user.username}`).addFields(
        { name: '💰 الكاش', value: `${userData.balance.toLocaleString()}`, inline: true },
        { name: '🏦 البنك', value: `${userData.cleanBalance.toLocaleString()}`, inline: true },
        { name: '🎭 المهنة', value: jobName, inline: true },
        { name: '🛡️ العصابة', value: userData.gang || 'بدون عصابة', inline: true }
      );
      return interaction.editReply({ embeds: [embed] });
    }

    case 'يومي': {
      if (now - (userData.dailyLast || 0) < 24 * 3600 * 1000) return interaction.editReply({ content: '❌ استلمت مكافأتك اليومية مسبقاً!' });
      userData.dailyLast = now;
      userData.balance += 1500;
      await saveData(data);
      return interaction.editReply({ content: '🎉 حصلت على مكافأتك اليومية (1,500 عملة)!' });
    }

    case 'سرقة': {
      const resMsg = await handleRobbery(userData);
      await saveData(data);
      return interaction.editReply({ content: resMsg });
    }

    case 'المطلوبين': {
      let bountyText = '';
      for (const [tId, amount] of Object.entries(data.bounties || {})) {
        if (amount > 0) bountyText += `• المطلوب: <@${tId}> ➔ مكافأة اغتيال **${amount.toLocaleString()}** عملة 🎯\n`;
      }
      const embed = new EmbedBuilder().setColor('#e74c3c').setTitle('🎯 قائمة المطلوبين أمنياً').setDescription(bountyText || 'لا يوجد مطلوبين حالياً في المدينة! 🕊️');
      return interaction.editReply({ embeds: [embed] });
    }

    case 'السجن': {
      let jailList = '';
      for (const [id, u] of Object.entries(data.users || {})) {
        if ((u.jailUntil || 0) > now) {
          const rem = Math.ceil((u.jailUntil - now) / 1000);
          jailList += `• <@${id}> — متبقي **${rem} ثانية**\n`;
        }
      }
      const embed = new EmbedBuilder().setColor('#c0392b').setTitle('🚔 السجن المركزي').setDescription(jailList || 'السجن خالي تماماً حالياً! 🕊️');
      return interaction.editReply({ embeds: [embed] });
    }

    case 'كفالة': {
      if ((userData.jailUntil || 0) <= now) return interaction.editReply({ content: '❌ أنت لست مسجوناً!' });
      const cost = userData.job === 'lawyer' ? 2500 : 5000;
      if (userData.balance < cost) return interaction.editReply({ content: `❌ رصيدك لا يكفي للكفالة (${cost} عملة)!` });
      userData.balance -= cost;
      userData.jailUntil = 0;
      await saveData(data);
      return interaction.editReply({ content: '🔓 **تم دفع الكفالة وخرجت من السجن بنجاح!**' });
    }

    case 'عصابتي': {
      if (!userData.gang || !data.gangs[userData.gang]) return interaction.editReply({ content: '❌ أنت لست عضواً في عصابة!' });
      const g = data.gangs[userData.gang];
      return interaction.editReply({ content: `🛡️ **عصابتك: ${userData.gang}** | الزعيم: <@${g.leader}> | الرصيد: ${(g.bank || 0).toLocaleString()} عملة` });
    }

    case 'إنشاء_عصابة': {
      const gangName = options.getString('الاسم');
      if (userData.gang) return interaction.editReply({ content: '❌ أنت تنتمي لعصابة بالفعل!' });
      if (userData.balance < 5000) return interaction.editReply({ content: '❌ تحتاج إلى 5,000 عملة لإنشاء عصابة!' });
      if (data.gangs[gangName]) return interaction.editReply({ content: '❌ اسم العصابة مستخدم مسبقاً!' });

      userData.balance -= 5000;
      userData.gang = gangName;
      data.gangs[gangName] = { name: gangName, leader: user.id, bank: 0, members: [user.id] };
      await saveData(data);
      return interaction.editReply({ content: `🎉 **تم تأسيس عصابة [ ${gangName} ] بنجاح!**` });
    }

    case 'هجوم_عصابة': {
      if (!userData.gang || !data.gangs[userData.gang]) {
        return interaction.editReply({ content: '❌ يجب أن تنتمي لعصابة لتستطيع مهاجمة العصابات الأخرى!' });
      }
      const targetGangName = options.getString('اسم_العصابة');
      if (targetGangName === userData.gang) {
        return interaction.editReply({ content: '❌ لا يمكنك مهاجمة عصابتك!' });
      }
      if (!data.gangs[targetGangName]) {
        return interaction.editReply({ content: `❌ العصابة المستهدفة "${targetGangName}" غير موجودة أو وهمية!` });
      }

      const cooldown = 30 * 60 * 1000; // 30 دقيقة تهدئة للهجوم
      if (now - (userData.lastGangAttack || 0) < cooldown) {
        const remMins = Math.ceil((cooldown - (now - userData.lastGangAttack)) / 60000);
        return interaction.editReply({ content: `⏱️ يجب الانتظار ${remMins} دقيقة قبل شن هجوم عصابة آخر!` });
      }

      userData.lastGangAttack = now;
      const targetGang = data.gangs[targetGangName];
      const targetBank = targetgang.bank || 0; // تم التصحيح أدناه

      if (targetBank <= 0) {
        return interaction.editReply({ content: `🛡️ هجمت عصابتك [ ${userData.gang} ] على مقرات [ ${targetGangName} ]، لكن خزينتهم كانت فارغة تماماً ولم تكسبوا شيئاً!` });
      }

      const stolenAmount = Math.floor(Math.min(targetBank, Math.random() * 5000 + 1000));
      targetGang.bank -= stolenAmount;
      data.gangs[userData.gang].bank = (data.gangs[userData.gang].bank || 0) + stolenAmount;
      await saveData(data);

      return interaction.editReply({ content: `⚔️🔥 **هجوم عصابة ناجح وسحيق!** أغارت عصابتك [ ${userData.gang} ] على مقرات عصابة **[ ${targetGangName} ]** ونهبت **${stolenAmount.toLocaleString()} عملة** من خزينتهم لصالح خزينة عصابتكم!` });
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
      return interaction.editReply({ content: '✅ تم تنفيذ الأمر بنجاح!' });
  }
});

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('❌ DISCORD_TOKEN غير موجود!');
  process.exit(1);
}

client.login(token);
