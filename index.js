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
  Collection,
  Events
} = require('discord.js');

// === 1. خادم الويب لاستمرار التشغيل على Render ===
const web = express();
web.get('/', (_req, res) => res.status(200).send('✅ البوت يعمل بنجاح'));
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
  auctions: { type: Array, default: [] },
  territories: { type: Object, default: {} },
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
          auctions: [],
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
      return parsed;
    }
  } catch (err) {}
  return { users: {}, gangs: {}, auctions: [], territories: {}, settings: {} };
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
            auctions: data.auctions,
            territories: data.territories,
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

// === 4. المعدات ===
const WEAPONS = {
  knife: { name: 'سكين حاد 🔪', price: 500, desc: 'سلاح خفيف يزيد نسبة النجاح' },
  pistol: { name: 'مسدس 9mm 🔫', price: 2000, desc: 'يزيد نسبة الخطف بـ 15%' },
  smg: { name: 'رشاش قصير 🪖', price: 7000, desc: 'مخصص للاغتيالات والاحتلال' },
  armor: { name: 'درع واقي 🛡️', price: 4000, desc: 'يحميك من السجن والغرامة' },
  car: { name: 'سيارة هرب سريعة 🏎️', price: 15000, desc: 'تزيد نسبة النجاح والفرار بـ 15%' }
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

// === 5. الأوامر البرمجية الكاملة مع الألعاب الجديدة ===
const commands = [
  new SlashCommandBuilder().setName('قائمة').setDescription('عرض لوحة التحكم الرئيسية واللوحات التفاعلية بالأزرار'),
  new SlashCommandBuilder().setName('انضمام').setDescription('إنشاء وتفعيل حساب جديد'),
  new SlashCommandBuilder().setName('حساب').setDescription('عرض بيانات حسابك ومستواك وترسانتك'),
  new SlashCommandBuilder().setName('يومي').setDescription('الحصول على المكافأة اليومية'),
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
  new SlashCommandBuilder().setName('سرقة').setDescription('تنفيذ عملية سطو مسلح لجمع الأموال'),
  new SlashCommandBuilder()
    .setName('غسيل_أموال')
    .setDescription('تبييض الأموال (رسوم 15%)')
    .addIntegerOption(opt => opt.setName('المبلغ').setDescription('المبلغ').setRequired(true)),
  new SlashCommandBuilder()
    .setName('خطف')
    .setDescription('محاولة خطف لاعب باشتراط فدية مالية')
    .addUserOption(opt => opt.setName('الهدف').setDescription('الشخص المراد خطفه').setRequired(true))
    .addIntegerOption(opt => opt.setName('الفدية').setDescription('الفدية').setRequired(true)),
  new SlashCommandBuilder().setName('فدية').setDescription('دفع الفدية لإعادة حريتك'),
  new SlashCommandBuilder()
    .setName('اغتيال')
    .setDescription('تنفيذ اغتيال لتجريد الهدف من جزء من رصيده')
    .addUserOption(opt => opt.setName('الهدف').setDescription('الهدف').setRequired(true)),
  new SlashCommandBuilder()
    .setName('تحدي_عصابة')
    .setDescription('إعلان حرب وتحدي عصابة أخرى بمبلغ رهان')
    .addStringOption(opt => opt.setName('العصابة').setDescription('اسم العصابة').setRequired(true))
    .addIntegerOption(opt => opt.setName('الرهان').setDescription('الرهان').setRequired(true)),
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
  new SlashCommandBuilder()
    .setName('نرد')
    .setDescription('مراهنة على رمية النرد')
    .addIntegerOption(opt => opt.setName('المبلغ').setDescription('المبلغ').setRequired(true)),
  new SlashCommandBuilder()
    .setName('عملة')
    .setDescription('لعبة ملك أو كتابة (المضاعفة x2)')
    .addIntegerOption(opt => opt.setName('المبلغ').setDescription('المبلغ').setRequired(true))
    .addStringOption(opt => opt.setName('الوجه').setDescription('اختر').setRequired(true).addChoices({ name: 'ملك 👑', value: 'king' }, { name: 'كتابة 📜', value: 'tail' })),
  new SlashCommandBuilder()
    .setName('سلوت')
    .setDescription('ماكينة السلوت الكازينو')
    .addIntegerOption(opt => opt.setName('المبلغ').setDescription('المبلغ').setRequired(true)),
  new SlashCommandBuilder().setName('السجن').setDescription('عرض حالة السجن'),
  new SlashCommandBuilder().setName('كفالة').setDescription('دفع كفالة الخروج من السجن (1500)'),
  new SlashCommandBuilder()
    .setName('إنشاء_عصابة')
    .setDescription('تأسيس عصابة جديدة (5000 عملة)')
    .addStringOption(opt => opt.setName('الاسم').setDescription('اسم العصابة').setRequired(true)),
  new SlashCommandBuilder().setName('عصابتي').setDescription('لوحة تحكم عصابتك والأعضاء'),
  new SlashCommandBuilder().setName('لوحة_الصدارة').setDescription('عرض قائمة الأثرياء'),
  new SlashCommandBuilder()
    .setName('تعويض')
    .setDescription('إضافة رصيد (للمشرفين)')
    .addUserOption(opt => opt.setName('الشخص').setDescription('المستفيد').setRequired(true))
    .addIntegerOption(opt => opt.setName('المبلغ').setDescription('المبلغ').setRequired(true))
];

commands.forEach(cmd => client.commands.set(cmd.name, cmd));

client.once(Events.ClientReady, async () => {
  console.log(`✅ جاهز وتعمل كـ: ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ تم تسجيل وتحديث كافة الأوامر التفاعلية والألعاب بنجاح!');
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
      createdAt: new Date().toISOString(),
      dailyLast: null,
      inventory: { knife: 0, pistol: 0, smg: 0, armor: 0, car: 0 },
      gang: null,
      jailUntil: 0,
      kidnappedBy: null,
      ransomPrice: 0
    };
  }
  const u = data.users[userId];
  if (u.cleanBalance === undefined) u.cleanBalance = 0;
  if (u.xp === undefined) u.xp = 0;
  if (u.level === undefined) u.level = 1;
  if (!u.inventory) u.inventory = { knife: 0, pistol: 0, smg: 0, armor: 0, car: 0 };
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

// === 6. المعالج التفاعلي الكامل ===
client.on(Events.InteractionCreate, async interaction => {
  const data = await readData();

  if (interaction.isButton()) {
    const userId = interaction.user.id;
    initUser(data, userId);
    const userData = data.users[userId];

    if (interaction.customId === 'main_btn_account') {
      let invText = '';
      for (const [k, v] of Object.entries(userData.inventory)) {
        if (v > 0) invText += `• ${WEAPONS[k].name}: **${v}**\n`;
      }
      if (!invText) invText = 'لا توجد أسلحة أو سيارات';
      const statusText = userData.kidnappedBy ? `⚠️ مخطوف من قبل <@${userData.kidnappedBy}>` : 'طليق وحر 🕊️';

      const embed = new EmbedBuilder()
        .setColor('#2ECC71')
        .setTitle(`📊 ملف المجرم: ${interaction.user.username}`)
        .addFields(
          { name: '💰 الرصيد النقدي', value: `${(userData.balance || 0).toLocaleString()} عملة`, inline: true },
          { name: '🏦 الرصيد المبيض', value: `${(userData.cleanBalance || 0).toLocaleString()} عملة`, inline: true },
          { name: '⭐ المستوى', value: `مستوى **${userData.level || 1}** (${userData.xp || 0} XP)`, inline: true },
          { name: '📌 الحالة الحالية', value: statusText, inline: true },
          { name: '🛡️ العصابة', value: userData.gang || 'بدون عصابة ❌', inline: true },
          { name: '🎒 الترسانة والمركبات', value: invText, inline: false }
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.customId === 'main_btn_gang') {
      if (!userData.gang || !data.gangs[userData.gang]) {
        return interaction.reply({ content: '❌ أنت لا تنتمي إلى أي عصابة! أنشئ عصابة بـ `/إنشاء_عصابة`', ephemeral: true });
      }
      const gang = data.gangs[userData.gang];
      const embed = new EmbedBuilder()
        .setColor('#34495e')
        .setTitle(`🏴‍☠️ عصابة: ${gang.name}`)
        .addFields(
          { name: '👑 الزعيم', value: `<@${gang.leader}>`, inline: true },
          { name: '👥 عدد الأعضاء', value: `${gang.members ? gang.members.length : 1} عضو`, inline: true },
          { name: '💰 الخزينة', value: `${(gang.bank || 0).toLocaleString()} عملة`, inline: true }
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.customId === 'main_btn_market') {
      const embed = new EmbedBuilder().setColor('#e74c3c').setTitle('🏴‍☠️ السوق السوداء').setDescription('استخدم أمر `/شراء [القطعة]` للشراء.');
      for (const [key, item] of Object.entries(WEAPONS)) {
        embed.addFields({ name: `${item.name} — ${item.price.toLocaleString()} عملة`, value: `${item.desc}\n*(الأمر: \`/شراء ${key}\`)*` });
      }
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.customId === 'main_btn_jail') {
      const now = Date.now();
      if ((userData.jailUntil || 0) > now) {
        const remSec = Math.ceil((userData.jailUntil - now) / 1000);
        return interaction.reply({ content: `🚨 **أنت مسجون!** ينتهي الأسر بعد **${remSec} ثانية**.\nاستخدم \`/كفالة\` للخروج فوراً.`, ephemeral: true });
      }
      return interaction.reply({ content: '🕊️ **أنت حُر طليق!** لست مسجوناً.', ephemeral: true });
    }

    if (interaction.customId === 'main_btn_kidnap_status') {
      if (userData.kidnappedBy) {
        return interaction.reply({ content: `🚨 **أنت مخطوف!** الخاطف: <@${userData.kidnappedBy}>\nالفدية المطلوبة: **${userData.ransomPrice.toLocaleString()} عملة**.\nاستخدم \`/فدية\` لتحرير نفسك!`, ephemeral: true });
      }
      return interaction.reply({ content: '🛡️ **وضعك آمن!** لم يقم أحد بخطفك حالياً. استخدم `/خطف` لتهديد أعدائك!', ephemeral: true });
    }

    if (interaction.customId === 'main_btn_territories') {
      let text = '';
      for (const [key, t] of Object.entries(data.territories || {})) {
        const ownerText = t.owner ? `تسيطر عليها: **${t.owner}**` : 'حرة / غير محتلة 🔓';
        text += `• **${t.name}** — ${ownerText} (الأرباح: ${t.tax.toLocaleString()} عملة)\n`;
      }
      const embed = new EmbedBuilder().setColor('#e67e22').setTitle('🗺️ خارطة نفوذ المناطق').setDescription(text + '\n*(استخدم الأمر `/احتلال [المنطقة]` للسيطرة)*');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.customId === 'main_btn_casino') {
      return interaction.reply({ content: '🎲 **كازينو العصابات والألعاب!**\nجرب الألعاب التالية:\n• `/نرد [المبلغ]`\n• `/عملة [المبلغ] [ملك/كتابة]`\n• `/سلوت [المبلغ]`', ephemeral: true });
    }

    if (interaction.customId === 'main_btn_leaderboard') {
      const sortedUsers = Object.entries(data.users)
        .map(([id, u]) => ({ id, balance: (u.balance || 0) + (u.cleanBalance || 0), level: u.level || 1 }))
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 5);

      let topUsersText = sortedUsers.map((u, i) => `${i + 1}. <@${u.id}> — **${u.balance.toLocaleString()}** عملة (مستوى ${u.level})`).join('\n');
      const embed = new EmbedBuilder().setColor('#f1c40f').setTitle('🏆 أثرى أثرياء عالم الجريمة').setDescription(topUsersText || 'لا يوجد مسجلين');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;
  const { commandName, user, options } = interaction;

  await interaction.deferReply({ ephemeral: commandName === 'انضمام' });

  initUser(data, user.id);
  const userData = data.users[user.id];

  switch (commandName) {
    case 'قائمة': {
      const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('🏛️ المركز الرئيسي واللوحة التفاعلية لعالم العصابات')
        .setDescription('استخدم الأزرار التفاعلية أدناه للتحكم المباشر عبر جميع الأقسام: 🔥');

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('main_btn_account').setLabel('💳 حسابي').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('main_btn_gang').setLabel('🏴‍☠️ عصابتي').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('main_btn_market').setLabel('🛒 السوق السوداء').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('main_btn_jail').setLabel('🚔 السجن').setStyle(ButtonStyle.Danger)
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('main_btn_kidnap_status').setLabel('🗡️ الخطف والفدية').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('main_btn_territories').setLabel('🗺️ خريطة المناطق').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('main_btn_casino').setLabel('🎲 الكازينو والألعاب').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('main_btn_leaderboard').setLabel('🏆 الصدارة').setStyle(ButtonStyle.Success)
      );

      return interaction.editReply({ embeds: [embed], components: [row1, row2] });
    }

    case 'انضمام': {
      await saveData(data);
      return interaction.editReply({ content: '✅ تم تفعيل حسابك وحفظ بياناتك سحابياً بنجاح!' });
    }

    case 'إنشاء_عصابة': {
      const gangName = options.getString('الاسم').trim();
      if (userData.balance < 5000) return interaction.editReply({ content: '❌ تحتاج إلى **5,000 عملة** لتأسيس عصابة جديدة!' });
      if (userData.gang) return interaction.editReply({ content: '❌ أنت بالفعل عضو في عصابة أخرى!' });
      if (data.gangs[gangName]) return interaction.editReply({ content: '❌ هذا الاسم مستخدم لعصابة أخرى!' });

      userData.balance -= 5000;
      userData.gang = gangName;

      data.gangs[gangName] = {
        name: gangName,
        leader: user.id,
        members: [user.id],
        bank: 0,
        createdAt: new Date().toISOString()
      };

      await saveData(data);
      return interaction.editReply(`🎉 **تم تأسيس عصابة [ ${gangName} ] بنجاح!** أصبحت أنت الزعيم الرسمى 👑.`);
    }

    case 'عصابتي': {
      if (!userData.gang || !data.gangs[userData.gang]) {
        return interaction.editReply({ content: '❌ أنت لا تنتمي لأي عصابة! أنشئ عصابتك بـ `/إنشاء_عصابة`.' });
      }
      const gang = data.gangs[userData.gang];
      const embed = new EmbedBuilder()
        .setColor('#34495e')
        .setTitle(`🏴‍☠️ عصابة: ${gang.name}`)
        .addFields(
          { name: '👑 الزعيم', value: `<@${gang.leader}>`, inline: true },
          { name: '👥 عدد الأعضاء', value: `${gang.members ? gang.members.length : 1} عضو`, inline: true },
          { name: '💰 الخزينة', value: `${(gang.bank || 0).toLocaleString()} عملة`, inline: true }
        );
      return interaction.editReply({ embeds: [embed] });
    }

    case 'خطف': {
      const targetUser = options.getUser('الهدف');
      const ransom = options.getInteger('الفدية');

      if (targetUser.id === user.id) return interaction.editReply({ content: '❌ لا يمكنك خطف نفسك!' });
      if (ransom <= 0) return interaction.editReply({ content: '❌ يجب تحديد مبلغ فدية منطقي!' });

      initUser(data, targetUser.id);
      const targetData = data.users[targetUser.id];
      if (targetData.kidnappedBy) return interaction.editReply({ content: '❌ هذا الشخص مخطوف بالفعل!' });

      let kidnapChance = 0.65;
      if (userData.inventory.pistol > 0) kidnapChance += 0.15;
      if (userData.inventory.car > 0) kidnapChance += 0.15;

      if (Math.random() < kidnapChance) {
        targetData.kidnappedBy = user.id;
        targetData.ransomPrice = ransom;
        await saveData(data);
        return interaction.editReply(`🗡️ **عملية خطف ناجحة!** احتجزت <@${targetUser.id}> باشتراط فدية **${ransom.toLocaleString()}** عملة! 🔥`);
      } else {
        return interaction.editReply(`💥 **فشلت عملية الخطف!** تمكن <@${targetUser.id}> من الفرار!`);
      }
    }

    case 'احتلال': {
      const terrKey = options.getString('المنطقة');
      const territory = data.territories[terrKey];

      if (!userData.gang || !data.gangs[userData.gang]) {
        return interaction.editReply({ content: '❌ يجب أن تنتمي لعصابة لتستطيع السيطرة على المناطق!' });
      }

      let captureChance = 0.50;
      if (userData.inventory.smg > 0) captureChance += 0.25;
      if (userData.inventory.car > 0) captureChance += 0.15;

      if (Math.random() < captureChance) {
        territory.owner = userData.gang;
        data.gangs[userData.gang].bank = (data.gangs[userData.gang].bank || 0) + territory.tax;
        await saveData(data);
        return interaction.editReply(`⚔️ **اقتحام وسيطرة ناجحة!** سيطرت عصابة **[ ${userData.gang} ]** على **${territory.name}** وجنت **${territory.tax.toLocaleString()}** عملة لخزينتها! 🔥`);
      } else {
        return interaction.editReply(`💥 **فشلت عملية السيطرة على ${territory.name}!** تصدت الحراسات للهجوم!`);
      }
    }

    case 'نرد': {
      const bet = options.getInteger('المبلغ');
      if (bet <= 0 || userData.balance < bet) return interaction.editReply({ content: '❌ رصيدك لا يكفي للرهان!' });

      const playerRoll = Math.floor(Math.random() * 6) + 1;
      const botRoll = Math.floor(Math.random() * 6) + 1;

      if (playerRoll > botRoll) {
        userData.balance += bet;
        await saveData(data);
        return interaction.editReply(`🎲 **فوز ساحق!** رميت **${playerRoll}** مقابل **${botRoll}** للكازينو. كسبت **${bet.toLocaleString()}** عملة! 💰✨`);
      } else if (playerRoll < botRoll) {
        userData.balance -= bet;
        await saveData(data);
        return interaction.editReply(`🎲 **خسارة!** رميت **${playerRoll}** مقابل **${botRoll}** للكازينو. خسرت **${bet.toLocaleString()}** عملة.`);
      } else {
        return interaction.editReply(`🎲 **تعادل!** رميتما **${playerRoll}**، تم استرداد المبلغ.`);
      }
    }

    case 'عملة': {
      const bet = options.getInteger('المبلغ');
      const choice = options.getString('الوجه');
      if (bet <= 0 || userData.balance < bet) return interaction.editReply({ content: '❌ رصيدك لا يكفي!' });

      const outcome = Math.random() < 0.5 ? 'king' : 'tail';
      const outcomeText = outcome === 'king' ? 'ملك 👑' : 'كتابة 📜';

      if (choice === outcome) {
        userData.balance += bet;
        await saveData(data);
        return interaction.editReply(`🪙 **فوز!** النتيجة كانت **${outcomeText}**. كسبت **${bet.toLocaleString()}** عملة! 🔥`);
      } else {
        userData.balance -= bet;
        await saveData(data);
        return interaction.editReply(`🪙 **خسارة!** النتيجة كانت **${outcomeText}**. خسرت **${bet.toLocaleString()}** عملة.`);
      }
    }

    case 'سلوت': {
      const bet = options.getInteger('المبلغ');
      if (bet <= 0 || userData.balance < bet) return interaction.editReply({ content: '❌ رصيدك لا يكفي!' });

      const items = ['🎰', '💎', '👑', '💣', '7️⃣'];
      const slot1 = items[Math.floor(Math.random() * items.length)];
      const slot2 = items[Math.floor(Math.random() * items.length)];
      const slot3 = items[Math.floor(Math.random() * items.length)];

      const slotsResult = `[ ${slot1} | ${slot2} | ${slot3} ]`;

      if (slot1 === slot2 && slot2 === slot3) {
        const win = bet * 5;
        userData.balance += win;
        await saveData(data);
        return interaction.editReply(`🎰 **الجائزة الكبرى (JACKPOT)!**\n${slotsResult}\nربحت **${win.toLocaleString()}** عملة (x5)! 🎉💰`);
      } else if (slot1 === slot2 || slot2 === slot3 || slot1 === slot3) {
        const win = bet * 2;
        userData.balance += win;
        await saveData(data);
        return interaction.editReply(`🎰 **فوز مجزئ!**\n${slotsResult}\nربحت **${win.toLocaleString()}** عملة (x2)! ✨`);
      } else {
        userData.balance -= bet;
        await saveData(data);
        return interaction.editReply(`🎰 **خسارة!**\n${slotsResult}\nخسرت **${bet.toLocaleString()}** عملة.`);
      }
    }

    case 'فدية': {
      if (!userData.kidnappedBy) return interaction.editReply({ content: '❌ أنت لست مخطوفاً!' });

      const ransom = userData.ransomPrice;
      if (userData.balance < ransom) {
        return interaction.editReply({ content: `❌ لا تملك مبلغ الفدية المطلوبة (**${ransom.toLocaleString()}** عملة)!` });
      }

      const kidnapperId = userData.kidnappedBy;
      initUser(data, kidnapperId);

      userData.balance -= ransom;
      data.users[kidnapperId].balance += ransom;
      userData.kidnappedBy = null;
      userData.ransomPrice = 0;

      await saveData(data);
      return interaction.editReply(`🕊️ **تم دفع الفدية بنجاح!** دفعت **${ransom.toLocaleString()}** عملة واسترجعت حريتك!`);
    }

    case 'غسيل_أموال': {
      const amount = options.getInteger('المبلغ');
      if (amount <= 0 || userData.balance < amount) return interaction.editReply({ content: '❌ رصيدك لا يكفي!' });

      const fee = Math.floor(amount * 0.15);
      const cleanAmount = amount - fee;

      userData.balance -= amount;
      userData.cleanBalance += cleanAmount;
      await saveData(data);

      return interaction.editReply(`🧼 **تم غسيل الأموال بنجاح!**\nتحويل **${cleanAmount.toLocaleString()}** عملة للبنك (خصم رسوم: ${fee.toLocaleString()} عملة).`);
    }

    case 'حساب': {
      let invText = '';
      for (const [k, v] of Object.entries(userData.inventory)) {
        if (v > 0) invText += `• ${WEAPONS[k].name}: **${v}**\n`;
      }
      if (!invText) invText = 'لا توجد أسلحة أو سيارات';

      const embed = new EmbedBuilder()
        .setColor('#2ECC71')
        .setTitle(`📊 ملف المجرم: ${user.username}`)
        .addFields(
          { name: '💰 الرصيد النقدي', value: `${userData.balance.toLocaleString()} عملة`, inline: true },
          { name: '🏦 الرصيد المبيض', value: `${userData.cleanBalance.toLocaleString()} عملة`, inline: true },
          { name: '⭐ المستوى', value: `مستوى **${userData.level}** (${userData.xp} XP)`, inline: true },
          { name: '🛡️ العصابة الحالية', value: userData.gang || 'بدون عصابة ❌', inline: true },
          { name: '🎒 الترسانة والمركبات', value: invText, inline: false }
        );
      return interaction.editReply({ embeds: [embed] });
    }

    case 'سرقة': {
      const now = Date.now();
      if ((userData.jailUntil || 0) > now) return interaction.editReply({ content: `🚨 أنت مسجون! لا يمكنك القيام بالسطو.` });

      let baseChance = 0.40 + (userData.level * 0.02);
      if (userData.inventory.pistol > 0) baseChance += 0.15;
      if (userData.inventory.smg > 0) baseChance += 0.25;
      if (userData.inventory.car > 0) baseChance += 0.10;

      if (Math.random() < baseChance) {
        const loot = Math.floor(Math.random() * 800) + 200 + (userData.level * 50);
        userData.balance += loot;
        const lvlUp = addXp(userData, 40);
        await saveData(data);

        let msg = `🥷 **عملية سطو ناجحة!** حصلت على **${loot.toLocaleString()}** عملة و **40 XP**! 💰`;
        if (lvlUp) msg += `\n🎉 **مبروك! ارتفع مستواك إلى المستوى ${userData.level}!**`;
        return interaction.editReply(msg);
      } else {
        if (userData.inventory.armor > 0) {
          userData.inventory.armor -= 1;
          await saveData(data);
          return interaction.editReply(`🛡️ فشلت عملية السطو ولكن الدرع الواقي حماك من السجن!`);
        } else {
          userData.jailUntil = now + (10 * 60 * 1000);
          const fine = Math.min(userData.balance, 300);
          userData.balance -= fine;
          await saveData(data);
          return interaction.editReply(`🚨 **قبضت عليك الشرطة!** تم تغريمك **${fine.toLocaleString()}** عملة وسجنك **10 دقائق**! 🚔`);
        }
      }
    }

    case 'سوق_سوداء': {
      const embed = new EmbedBuilder().setColor('#e74c3c').setTitle('🏴‍☠️ السوق السوداء').setDescription('استخدم أمر `/شراء [القطعة]` للشراء.');
      for (const [key, item] of Object.entries(WEAPONS)) {
        embed.addFields({ name: `${item.name} — ${item.price.toLocaleString()} عملة`, value: `${item.desc}\n*(الأمر: \`/شراء ${key}\`)*` });
      }
      return interaction.editReply({ embeds: [embed] });
    }

    case 'شراء': {
      const itemKey = options.getString('القطعة');
      const item = WEAPONS[itemKey];
      if (!item) return interaction.editReply({ content: '❌ قطعة غير متوفرة!' });
      if (userData.balance < item.price) return interaction.editReply({ content: '❌ رصيدك لا يكفي!' });

      userData.balance -= item.price;
      userData.inventory[itemKey] = (userData.inventory[itemKey] || 0) + 1;
      await saveData(data);
      return interaction.editReply(`✅ **تم الشراء بنجاح!** حصلت على **${item.name}**.`);
    }

    case 'تعويض': {
      if (!interaction.member.permissions.has('Administrator')) return interaction.editReply({ content: '❌ غير مصرح لك!' });
      const targetUser = options.getUser('الشخص');
      const amount = options.getInteger('المبلغ');
      initUser(data, targetUser.id);
      data.users[targetUser.id].balance += amount;
      await saveData(data);
      return interaction.editReply(`✅ تم إضافة **${amount.toLocaleString()}** عملة لـ <@${targetUser.id}> وحفظها سحابياً.`);
    }

    default:
      return interaction.editReply({ content: '❌ أمر غير معروف!' });
  }
});

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('❌ DISCORD_TOKEN غير موجود!');
  process.exit(1);
}

client.login(token);
