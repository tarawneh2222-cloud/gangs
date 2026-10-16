'use strict';

require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
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

// === إعداد خادم ويب لـ Render ===
const web = express();
web.get('/', (_req, res) => res.status(200).send('✅ البوت يعمل بنجاح بكامل الميزات الشاملة'));
web.get('/health', (_req, res) => res.json({ ok: true }));
web.listen(Number(process.env.PORT) || 3000, '0.0.0.0');

// === نظام حفظ البيانات المزدوج والمؤمن ===
const DATA_FILE = path.join(__dirname, 'data.json');
const BACKUP_FILE = path.join(__dirname, 'data_backup.json');

function ensureDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    if (fs.existsSync(BACKUP_FILE)) {
      fs.copyFileSync(BACKUP_FILE, DATA_FILE);
      console.log('🔄 تم استعادة البيانات من النسخة الاحتياطية!');
    } else {
      const initialData = { 
        users: {}, 
        gangs: {}, 
        territories: {
          bank: { name: '🏦 البنك المركزي', owner: null, tax: 2000 },
          port: { name: '🚢 الميناء المحصن', owner: null, tax: 1500 },
          club: { name: '🍸 الملهى الليلي', owner: null, tax: 1000 }
        },
        settings: {} 
      };
      fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
    }
  }
}

function readData() {
  try {
    ensureDataFile();
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.gangs) parsed.gangs = {};
    if (!parsed.users) parsed.users = {};
    if (!parsed.territories) {
      parsed.territories = {
        bank: { name: '🏦 البنك المركزي', owner: null, tax: 2000 },
        port: { name: '🚢 الميناء المحصن', owner: null, tax: 1500 },
        club: { name: '🍸 الملهى الليلي', owner: null, tax: 1000 }
      };
    }
    return parsed;
  } catch (err) {
    if (fs.existsSync(BACKUP_FILE)) {
      return JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf8'));
    }
    return { users: {}, gangs: {}, territories: {}, settings: {} };
  }
}

function saveData(data) {
  try {
    const jsonString = JSON.stringify(data, null, 2);
    fs.writeFileSync(DATA_FILE, jsonString);
    fs.writeFileSync(BACKUP_FILE, jsonString);
    return true;
  } catch (err) {
    console.error('❌ خطأ في حفظ البيانات:', err.message);
    return false;
  }
}

// === العناصر والمعدات ===
const WEAPONS = {
  knife: { name: 'سكين حاد 🔪', price: 500, desc: 'سلاح خفيف يزيد نسبة النجاح قليلاً' },
  pistol: { name: 'مسدس 9mm 🔫', price: 2000, desc: 'مسدس أساسي للعمليات والخطف' },
  smg: { name: 'رشاش قصير 🪖', price: 7000, desc: 'رشاش قوي مخصص للاغتيالات واقتحام المناطق' },
  armor: { name: 'درع واقي 🛡️', price: 4000, desc: 'يحميك من الغرامات والسجن عند الفشل' },
  car: { name: 'سيارة هرب سريعة 🏎️', price: 15000, desc: 'تزيد فرص الخطف والفرار من الشرطة بنجاح!' }
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

// === الأوامر التفاعلية ===
const commands = [
  new SlashCommandBuilder()
    .setName('قائمة')
    .setDescription('عرض لوحة التحكم الرئيسية واللوحات التفاعلية بالأزرار'),

  new SlashCommandBuilder()
    .setName('انضمام')
    .setDescription('إنشاء حساب جديد في عالم العصابات'),

  new SlashCommandBuilder()
    .setName('حساب')
    .setDescription('عرض بيانات حسابك ومستواك وترسانتك'),

  new SlashCommandBuilder()
    .setName('يومي')
    .setDescription('الحصول على المكافأة اليومية'),

  new SlashCommandBuilder()
    .setName('سوق_سوداء')
    .setDescription('شراء الأسلحة والسيارات والدروع'),

  new SlashCommandBuilder()
    .setName('شراء')
    .setDescription('شراء عنصر من السوق السوداء')
    .addStringOption(opt =>
      opt.setName('القطعة')
        .setDescription('اختر القطعة المراد شراؤها')
        .setRequired(true)
        .addChoices(
          { name: 'سكين (500)', value: 'knife' },
          { name: 'مسدس (2000)', value: 'pistol' },
          { name: 'رشاش (7000)', value: 'smg' },
          { name: 'درع واقي (4000)', value: 'armor' },
          { name: 'سيارة هرب (15000)', value: 'car' }
        )),

  new SlashCommandBuilder()
    .setName('سرقة')
    .setDescription('تنفيذ عملية سطو مسلح لجمع الأموال'),

  new SlashCommandBuilder()
    .setName('احتلال')
    .setDescription('محاولة السيطرة واحتلال إحدى مناطق المدينة لصالح عصابتك')
    .addStringOption(opt =>
      opt.setName('المنطقة')
        .setDescription('اختر المنطقة المراد احتلالها')
        .setRequired(true)
        .addChoices(
          { name: 'البنك المركزي (ضرائب: 2000)', value: 'bank' },
          { name: 'الميناء المحصن (ضرائب: 1500)', value: 'port' },
          { name: 'الملهى الليلي (ضرائب: 1000)', value: 'club' }
        )),

  new SlashCommandBuilder()
    .setName('نرد')
    .setDescription('مراهنة مالي في الكازينو على رمية النرد')
    .addIntegerOption(opt => opt.setName('المبلغ').setDescription('المبلغ المراد المراهنة به').setRequired(true)),

  new SlashCommandBuilder()
    .setName('خطف')
    .setDescription('محاولة خطف لاعب واشتراط فدية مالية لإطلاقه')
    .addUserOption(opt => opt.setName('الهدف').setDescription('الشخص المراد خطفه').setRequired(true))
    .addIntegerOption(opt => opt.setName('الفدية').setDescription('المبلغ المطلوب للإفراج عنه').setRequired(true)),

  new SlashCommandBuilder()
    .setName('فدية')
    .setDescription('دفع الفدية لإعادة حريتك أو حرية صديق مخطوف'),

  new SlashCommandBuilder()
    .setName('اغتيال')
    .setDescription('تنفيذ عملية اغتيال ضد هدف لتجريده من جزء من رصيده')
    .addUserOption(opt => opt.setName('الهدف').setDescription('الشخص المراد اغتياله').setRequired(true)),

  new SlashCommandBuilder()
    .setName('السجن')
    .setDescription('عرض المحتجزين بالسجن حالياً'),

  new SlashCommandBuilder()
    .setName('كفالة')
    .setDescription('دفع كفالة الخروج من السجن (1500 عملة)'),

  new SlashCommandBuilder()
    .setName('تهريب')
    .setDescription('تهريب سجين باقتحام مسلح')
    .addUserOption(opt => opt.setName('الشخص').setDescription('السجين المراد تهريبه').setRequired(true)),

  new SlashCommandBuilder()
    .setName('إنشاء_عصابة')
    .setDescription('تأسيس عصابة جديدة (5000 عملة)')
    .addStringOption(opt => opt.setName('الاسم').setDescription('اسم العصابة').setRequired(true)),

  new SlashCommandBuilder()
    .setName('عصابتي')
    .setDescription('لوحة تحكم عصابتك والأعضاء'),

  new SlashCommandBuilder()
    .setName('انضمام_عصابة')
    .setDescription('الانضمام إلى عصابة')
    .addStringOption(opt => opt.setName('الاسم').setDescription('اسم العصابة').setRequired(true)),

  new SlashCommandBuilder()
    .setName('تغذية_الخزينة')
    .setDescription('التبرع لخزينة العصابة')
    .addIntegerOption(opt => opt.setName('المبلغ').setDescription('المبلغ').setRequired(true)),

  new SlashCommandBuilder()
    .setName('لوحة_الصدارة')
    .setDescription('عرض القائمة الذهبية لأثرى أثرياء السيرفر'),

  new SlashCommandBuilder()
    .setName('تعويض')
    .setDescription('إضافة رصيد لمستخدم (للمشرفين فقط)')
    .addUserOption(opt => opt.setName('الشخص').setDescription('المستفيد').setRequired(true))
    .addIntegerOption(opt => opt.setName('المبلغ').setDescription('المبلغ').setRequired(true))
];

commands.forEach(cmd => client.commands.set(cmd.name, cmd));

client.once(Events.ClientReady, async () => {
  console.log(`✅ جاهز وتعمل كـ: ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ تم تسجيل وتحديث الأوامر والأزرار التفاعلية بنجاح!');
  } catch (error) {
    console.error('❌ خطأ في تحميل الأوامر:', error);
  }
});

// === تجهيز حساب المستخدم ===
function initUser(data, userId) {
  if (!data.users[userId]) {
    data.users[userId] = {
      balance: 1000,
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

// === التعامل مع التفاعلات والأزرار ===
client.on(Events.InteractionCreate, async interaction => {
  const data = readData();

  if (interaction.isButton()) {
    const userId = interaction.user.id;
    initUser(data, userId);
    const userData = data.users[userId];

    if (interaction.customId === 'main_btn_account') {
      let invText = '';
      for (const [k, v] of Object.entries(userData.inventory)) {
        if (v > 0) invText += `• ${WEAPONS[k].name}: **${v}**\n`;
      }
      if (!invText) invText = 'لا توجد أسلحة أو مركبات';
      const statusText = userData.kidnappedBy ? `⚠️ مخطوف من قبل <@${userData.kidnappedBy}>` : 'طليق وحر 🕊️';

      const embed = new EmbedBuilder()
        .setColor('#2ECC71')
        .setTitle(`📊 ملف المجرم: ${interaction.user.username}`)
        .addFields(
          { name: '💰 الرصيد', value: `${userData.balance.toLocaleString()} عملة`, inline: true },
          { name: '⭐ المستوى', value: `مستوى **${userData.level}** (${userData.xp} XP)`, inline: true },
          { name: '📌 الحالة الحالية', value: statusText, inline: true },
          { name: '🛡️ العصابة', value: userData.gang || 'بدون عصابة ❌', inline: true },
          { name: '🎒 الترسانة والمركبات', value: invText, inline: false }
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.customId === 'main_btn_gang') {
      if (!userData.gang || !data.gangs[userData.gang]) {
        return interaction.reply({ content: '❌ أنت لا تنتمي إلى أي عصابة حالياً!', ephemeral: true });
      }
      const gang = data.gangs[userData.gang];
      const embed = new EmbedBuilder()
        .setColor('#34495e')
        .setTitle(`🏴‍☠️ عصابة: ${gang.name}`)
        .addFields(
          { name: '👑 الزعيم', value: `<@${gang.leader}>`, inline: true },
          { name: '👥 عدد الأعضاء', value: `${gang.members.length} عضو`, inline: true },
          { name: '💰 الخزينة', value: `${gang.bank.toLocaleString()} عملة`, inline: true }
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.customId === 'main_btn_market') {
      const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('🏴‍☠️ السوق السوداء')
        .setDescription('استخدم أمر `/شراء [القطعة]` لشراء المعدات.');
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

    if (interaction.customId === 'main_btn_territories') {
      let text = '';
      for (const [key, t] of Object.entries(data.territories)) {
        const ownerText = t.owner ? `تسيطر عليها عصابة: **${t.owner}**` : 'حرة / غير محتلة 🔓';
        text += `• **${t.name}** — ${ownerText} (الأرباح: ${t.tax.toLocaleString()} عملة)\n`;
      }
      const embed = new EmbedBuilder()
        .setColor('#e67e22')
        .setTitle('🗺️ خارطة نفوذ المناطق')
        .setDescription(text + '\n*(استخدم الأمر `/احتلال [المنطقة]` للسيطرة مع عصابتك)*');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.customId === 'main_btn_casino') {
      return interaction.reply({ content: '🎲 **أهلاً بك في كازينو العصابات!**\nاستخدم الأمر `/نرد [المبلغ]` للمراهنة على رمية النرد ومضاعفة أموالك!', ephemeral: true });
    }

    if (interaction.customId === 'main_btn_leaderboard') {
      const sortedUsers = Object.entries(data.users)
        .map(([id, u]) => ({ id, balance: u.balance || 0, level: u.level || 1 }))
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 5);

      let topUsersText = sortedUsers.map((u, i) => `${i + 1}. <@${u.id}> — **${u.balance.toLocaleString()}** عملة (مستوى ${u.level})`).join('\n');
      const embed = new EmbedBuilder().setColor('#f1c40f').setTitle('🏆 أثرى أثرياء عالم الجريمة').setDescription(topUsersText || 'لا يوجد مسجلين');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    return;
  }

  // === أوامر الشات ===
  if (!interaction.isChatInputCommand()) return;
  const { commandName, user, options } = interaction;
  initUser(data, user.id);
  const userData = data.users[user.id];

  switch (commandName) {
    case 'قائمة': {
      const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('🏛️ المركز الرئيسي واللوحة التفاعلية لعالم العصابات')
        .setDescription('استخدم الأزرار التفاعلية أدناه للتحكم المباشر عبر جميع الأقسام والخدمات: 🔥');

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('main_btn_account').setLabel('💳 حسابي').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('main_btn_gang').setLabel('🏴‍☠️ عصابتي').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('main_btn_market').setLabel('🛒 السوق السوداء').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('main_btn_jail').setLabel('🚔 السجن').setStyle(ButtonStyle.Danger)
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('main_btn_territories').setLabel('🗺️ خريطة المناطق').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('main_btn_casino').setLabel('🎲 الكازينو والنرد').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('main_btn_leaderboard').setLabel('🏆 الصدارة').setStyle(ButtonStyle.Success)
      );

      return interaction.reply({ embeds: [embed], components: [row1, row2] });
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
          { name: '⭐ المستوى', value: `مستوى **${userData.level}** (${userData.xp} XP)`, inline: true },
          { name: '🛡️ العصابة الحالية', value: userData.gang || 'بدون عصابة ❌', inline: true },
          { name: '🎒 الترسانة والمركبات', value: invText, inline: false }
        );
      return interaction.reply({ embeds: [embed] });
    }

    case 'سرقة': {
      const now = Date.now();
      if ((userData.jailUntil || 0) > now) {
        return interaction.reply({ content: `🚨 أنت مسجون! لا يمكنك القيام بالسطو حالياً.`, ephemeral: true });
      }
      if (userData.kidnappedBy) {
        return interaction.reply({ content: `🚨 أنت مخطوف ومقيد! اطلب دفع الفدية للحرية.`, ephemeral: true });
      }

      let baseChance = 0.40 + (userData.level * 0.02);
      if (userData.inventory.pistol > 0) baseChance += 0.15;
      if (userData.inventory.smg > 0) baseChance += 0.25;
      if (userData.inventory.car > 0) baseChance += 0.10;

      if (Math.random() < baseChance) {
        const loot = Math.floor(Math.random() * 800) + 200 + (userData.level * 50);
        userData.balance += loot;
        const lvlUp = addXp(userData, 40);
        saveData(data);

        let msg = `🥷 **عملية سطو ناجحة!** حصلت على **${loot.toLocaleString()}** عملة و **40 XP**! 💰`;
        if (lvlUp) msg += `\n🎉 **مبروك! ارتفع مستواك إلى المستوى ${userData.level}!**`;
        return interaction.reply(msg);
      } else {
        if (userData.inventory.armor > 0) {
          userData.inventory.armor -= 1;
          saveData(data);
          return interaction.reply(`🛡️ فشلت عملية السطو ولكن الدرع الواقي حماك من السجن!`);
        } else {
          userData.jailUntil = now + (10 * 60 * 1000);
          const fine = Math.min(userData.balance, 300);
          userData.balance -= fine;
          saveData(data);
          return interaction.reply(`🚨 **قبضت عليك الشرطة!** تم تغريمك **${fine.toLocaleString()}** عملة وسجنك **10 دقائق**! 🚔`);
        }
      }
    }

    case 'احتلال': {
      const terrKey = options.getString('المنطقة');
      const territory = data.territories[terrKey];

      if (!userData.gang || !data.gangs[userData.gang]) {
        return interaction.reply({ content: '❌ يجب أن تنتمي لعصابة لتستطيع السيطرة على المناطق!', ephemeral: true });
      }

      if (territory.owner === userData.gang) {
        return interaction.reply({ content: `❌ عصابتك تتسيد وتسيطر بالفعل على **${territory.name}**!`, ephemeral: true });
      }

      // حساب قوة السيطرة بناءً على أسلحة اللاعب والمستوى
      let captureChance = 0.40;
      if (userData.inventory.smg > 0) captureChance += 0.30;
      if (userData.inventory.car > 0) captureChance += 0.15;

      if (Math.random() < captureChance) {
        territory.owner = userData.gang;
        data.gangs[userData.gang].bank += territory.tax;
        saveData(data);
        return interaction.reply(`⚔️ **اقتحام وسيطرة ناجحة!** سيطرت عصابة **[ ${userData.gang} ]** على **${territory.name}** وجنت **${territory.tax.toLocaleString()}** عملة لخزينتها! 🔥`);
      } else {
        return interaction.reply(`💥 **فشلت عملية السيطرة على ${territory.name}!** تصدت الحراسات والخصوم للهجوم!`);
      }
    }

    case 'نرد': {
      const bet = options.getInteger('المبلغ');
      if (bet <= 0 || userData.balance < bet) {
        return interaction.reply({ content: '❌ رصيدك النقدي لا يكفي لهذه المراهنة!', ephemeral: true });
      }

      const playerRoll = Math.floor(Math.random() * 6) + 1;
      const botRoll = Math.floor(Math.random() * 6) + 1;

      if (playerRoll > botRoll) {
        userData.balance += bet;
        saveData(data);
        return interaction.reply(`🎲 **فوز ساحق!** رميت **${playerRoll}** مقابل **${botRoll}** للكازينو. كسبت **${bet.toLocaleString()}** عملة! 💰✨`);
      } else if (playerRoll < botRoll) {
        userData.balance -= bet;
        saveData(data);
        return interaction.reply(`🎲 **خسارة!** رميت **${playerRoll}** مقابل **${botRoll}** للكازينو. خسرت **${bet.toLocaleString()}** عملة.`);
      } else {
        return interaction.reply(`🎲 **تعادل!** رميتما **${playerRoll}**، تم استرداد مبلغ المراهنة.`);
      }
    }

    case 'خطف': {
      const targetUser = options.getUser('الهدف');
      const ransom = options.getInteger('الفدية');

      if (targetUser.id === user.id) return interaction.reply({ content: '❌ لا يمكنك خطف نفسك!', ephemeral: true });
      if (ransom <= 0) return interaction.reply({ content: '❌ يجب تحديد مبلغ فدية منطقي!', ephemeral: true });

      initUser(data, targetUser.id);
      const targetData = data.users[targetUser.id];

      if (targetData.kidnappedBy) return interaction.reply({ content: '❌ هذا الشخص مخطوف بالفعل!', ephemeral: true });

      let kidnapChance = 0.35;
      if (userData.inventory.pistol > 0) kidnapChance += 0.20;
      if (userData.inventory.car > 0) kidnapChance += 0.25;

      if (Math.random() < kidnapChance) {
        targetData.kidnappedBy = user.id;
        targetData.ransomPrice = ransom;
        saveData(data);
        return interaction.reply(`🗡️ **عملية خطف ناجحة!** احتجزت <@${targetUser.id}> باشتراط فدية **${ransom.toLocaleString()}** عملة! 🔥`);
      } else {
        return interaction.reply(`💥 **فشلت عملية الخطف!** تمكن <@${targetUser.id}> من الفرار!`);
      }
    }

    case 'فدية': {
      if (!userData.kidnappedBy) return interaction.reply({ content: '❌ أنت لست مخطوفاً!', ephemeral: true });

      const ransom = userData.ransomPrice;
      if (userData.balance < ransom) {
        return interaction.reply({ content: `❌ لا تملك مبلغ الفدية المطلوبة (**${ransom.toLocaleString()}** عملة)!`, ephemeral: true });
      }

      const kidnapperId = userData.kidnappedBy;
      initUser(data, kidnapperId);

      userData.balance -= ransom;
      data.users[kidnapperId].balance += ransom;
      userData.kidnappedBy = null;
      userData.ransomPrice = 0;

      saveData(data);
      return interaction.reply(`🕊️ **تم دفع الفدية بنجاح!** دفعت **${ransom.toLocaleString()}** عملة واسترجعت حريتك!`);
    }

    case 'اغتيال': {
      const targetUser = options.getUser('الهدف');
      if (targetUser.id === user.id) return interaction.reply({ content: '❌ لا يمكنك اغتيال نفسك!', ephemeral: true });

      if ((userData.inventory.smg || 0) <= 0) {
        return interaction.reply({ content: '❌ تحتاج إلى سلاح رشاش (`smg`) لتنفيذ عملية اغتيال!', ephemeral: true });
      }

      initUser(data, targetUser.id);
      const targetData = data.users[targetUser.id];

      const loot = Math.floor(targetData.balance * 0.25);
      targetData.balance -= loot;
      userData.balance += loot;
      targetData.jailUntil = Date.now() + (15 * 60 * 1000);

      saveData(data);
      return interaction.reply(`🎯 **عملية اغتيال ناجحة!** أصبت <@${targetUser.id}> وسلبت **${loot.toLocaleString()}** عملة منه! 💥`);
    }

    case 'كفالة': {
      const now = Date.now();
      if ((userData.jailUntil || 0) <= now) return interaction.reply({ content: '❌ أنت لست مسجوناً!', ephemeral: true });
      if (userData.balance < 1500) return interaction.reply({ content: '❌ رصيدك لا يكفي (1,500 عملة)!', ephemeral: true });

      userData.balance -= 1500;
      userData.jailUntil = 0;
      saveData(data);
      return interaction.reply('🔓 **خرجت من السجن بنجاح بعد دفع الكفالة!**');
    }

    case 'سوق_سوداء': {
      const embed = new EmbedBuilder().setColor('#e74c3c').setTitle('🏴‍☠️ السوق السوداء').setDescription('استخدم أمر `/شراء [القطعة]` للشراء.');
      for (const [key, item] of Object.entries(WEAPONS)) {
        embed.addFields({ name: `${item.name} — ${item.price.toLocaleString()} عملة`, value: `${item.desc}\n*(الأمر: \`/شراء ${key}\`)*` });
      }
      return interaction.reply({ embeds: [embed] });
    }

    case 'شراء': {
      const itemKey = options.getString('القطعة');
      const item = WEAPONS[itemKey];
      if (!item) return interaction.reply({ content: '❌ قطعة غير متوفرة!', ephemeral: true });
      if (userData.balance < item.price) return interaction.reply({ content: '❌ رصيدك لا يكفي!', ephemeral: true });

      userData.balance -= item.price;
      userData.inventory[itemKey] = (userData.inventory[itemKey] || 0) + 1;
      saveData(data);
      return interaction.reply(`✅ **تم الشراء بنجاح!** حصلت على **${item.name}**.`);
    }

    case 'تعويض': {
      if (!interaction.member.permissions.has('Administrator')) return interaction.reply({ content: '❌ غير مصرح لك!', ephemeral: true });
      const targetUser = options.getUser('الشخص');
      const amount = options.getInteger('المبلغ');
      initUser(data, targetUser.id);
      data.users[targetUser.id].balance += amount;
      saveData(data);
      return interaction.reply(`✅ تم إضافة **${amount.toLocaleString()}** عملة لـ <@${targetUser.id}>.`);
    }

    default:
      return interaction.reply({ content: '❌ أمر غير معروف!', ephemeral: true });
  }
});

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('❌ DISCORD_TOKEN غير موجود!');
  process.exit(1);
}

client.login(token);
