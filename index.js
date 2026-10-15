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
  Collection,
  Events
} = require('discord.js');

// === إعداد خادم ويب لـ Render ===
const web = express();
web.get('/', (_req, res) => res.status(200).send('✅ البوت يعمل بنجاح'));
web.get('/health', (_req, res) => res.json({ ok: true }));
web.listen(Number(process.env.PORT) || 3000, '0.0.0.0');

// === نظام حفظ البيانات في ملف JSON ===
const DATA_FILE = path.join(__dirname, 'data.json');

// إنشاء الملف إذا لم يكن موجوداً
function ensureDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    const initialData = { users: {}, gangs: {}, auctions: [], settings: {} };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
    console.log('✅ تم إنشاء ملف البيانات');
  }
}

// قراءة البيانات
function readData() {
  try {
    ensureDataFile();
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('❌ خطأ في قراءة البيانات:', err.message);
    return { users: {}, gangs: {}, auctions: [], settings: {} };
  }
}

// حفظ البيانات
function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error('❌ خطأ في حفظ البيانات:', err.message);
    return false;
  }
}

// === إعداد البوت ===
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

client.commands = new Collection();

// === تعريف الأوامر ===
const commands = [
  new SlashCommandBuilder()
    .setName('حساب')
    .setDescription('عرض معلومات حسابك ورصيدك'),

  new SlashCommandBuilder()
    .setName('يومي')
    .setDescription('الحصول على مكافأتك اليومية'),

  new SlashCommandBuilder()
    .setName('تعويض')
    .setDescription('إضافة رصيد لمستخدم (للمشرف فقط)')
    .addUserOption(option =>
      option.setName('الشخص')
        .setDescription('الشخص الذي تريد تعويضه')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('المبلغ')
        .setDescription('المبلغ المراد إضافته')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('مزاد')
    .setDescription('عرض المزادات النشطة'),

  new SlashCommandBuilder()
    .setName('انضمام')
    .setDescription('إنشاء حساب جديد'),

  new SlashCommandBuilder()
    .setName('العاب')
    .setDescription('عرض قائمة الألعاب المتاحة')
];

// تسجيل الأوامر
commands.forEach(cmd => {
  client.commands.set(cmd.name, cmd);
});

// === عند جاهزية البوت ===
client.once(Events.ClientReady, async () => {
  console.log(`✅ تم تسجيل الدخول كـ: ${client.user.tag}`);
  
  // تسجيل الأوامر على الديسكورد
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  
  try {
    console.log('⏳ جاري تحميل الأوامر...');
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    console.log('✅ تم تحميل جميع الأوامر بنجاح');
  } catch (error) {
    console.error('❌ خطأ في تحميل الأوامر:', error);
  }
});

// === معالجة الأوامر ===
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, user, options } = interaction;
  const data = readData();
  
  // التأكد من وجود المستخدم
  if (!data.users[user.id]) {
    data.users[user.id] = {
      balance: 1000,
      createdAt: new Date().toISOString(),
      dailyLast: null,
      gamesPlayed: 0
    };
  }

  switch (commandName) {
    case 'انضمام': {
      if (data.users[user.id].createdAt) {
        return interaction.reply({ content: '❌ لديك حساب بالفعل! استخدم `/حساب` لعرض بياناتك', ephemeral: true });
      }
      data.users[user.id] = {
        balance: 1000,
        createdAt: new Date().toISOString(),
        dailyLast: null,
        gamesPlayed: 0
      };
      saveData(data);
      return interaction.reply(`✅ تم إنشاء حسابك بنجاح! رصيدك الأولي: **1,000** عملة 🪙`);
    }

    case 'حساب': {
      const userData = data.users[user.id];
      const embed = new EmbedBuilder()
        .setColor('#2ECC71')
        .setTitle(`📊 حساب ${user.username}`)
        .addFields(
          { name: '💰 الرصيد', value: `${userData.balance} عملة`, inline: true },
          { name: '🎮 الألعاب', value: `${userData.gamesPlayed || 0} لعبة`, inline: true },
          { name: '📅 تاريخ الإنشاء', value: `<t:${Math.floor(new Date(userData.createdAt).getTime() / 1000)}:D>`, inline: false }
        );
      return interaction.reply({ embeds: [embed] });
    }

    case 'يومي': {
      const lastClaim = userData.dailyLast ? new Date(userData.dailyLast) : null;
      const now = new Date();
      const canClaim = !lastClaim || (now - lastClaim) > 24 * 60 * 60 * 1000;
      
      if (!canClaim) {
        const nextTime = new Date(lastClaim.getTime() + 24 * 60 * 60 * 1000);
        return interaction.reply({ 
          content: `⏳ لقد حصلت على مكافأتك اليومية بالفعل! العودة غداً: <t:${Math.floor(nextTime.getTime() / 1000)}:R>`,
          ephemeral: true 
        });
      }
      
      userData.balance += 250;
      userData.dailyLast = now.toISOString();
      saveData(data);
      return interaction.reply(`✅ تم إضافة **250** عملة إلى رصيدك! رصيدك الحالي: **${userData.balance}** 🪙`);
    }

    case 'تعويض': {
      // تحقق من صلاحيات المشرف
      if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({ content: '❌ غير مسموح لك بهذا الأمر!', ephemeral: true });
      }
      
      const targetUser = options.getUser('الشخص');
      const amount = options.getInteger('المبلغ');
      
      if (!data.users[targetUser.id]) {
        data.users[targetUser.id] = { balance: 0, createdAt: new Date().toISOString(), dailyLast: null, gamesPlayed: 0 };
      }
      
      data.users[targetUser.id].balance += amount;
      saveData(data);
      return interaction.reply(`✅ تم تعويض <@${targetUser.id}> بمبلغ **${amount}** عملة! الرصيد الجديد: **${data.users[targetUser.id].balance}** 🪙`);
    }

    case 'العاب': {
      return interaction.reply(`
🎮 **قائمة الألعاب المتاحة:**
> • قريباً: حجر ورقة مقص
> • قريباً: روليت الحظ
> • قريباً: أرقام الحظ

تابع التحديثات! 🚀
      `);
    }

    case 'مزاد': {
      const activeAuctions = data.auctions.filter(a => a.active);
      if (activeAuctions.length === 0) {
        return interaction.reply('🏷️ لا توجد مزادات نشطة حالياً. انتظر بدء مزاد جديد قريباً!');
      }
      let msg = '🏷️ **المزادات النشطة:**\n';
      activeAuctions.forEach((a, i) => {
        msg += `${i + 1}. **${a.name}** — الحالي: ${a.currentPrice} عملة\n`;
      });
      return interaction.reply(msg);
    }

    default:
      return interaction.reply({ content: '❌ الأمر غير معروف!', ephemeral: true });
  }
});

// === معالجة الأخطاء ===
client.on(Events.ShardError, error => console.error('⚠️ خطأ في الاتصال:', error));
client.on(Events.Error, error => console.error('❌ خطأ في البوت:', error));

// === تشغيل البوت ===
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('❌ خطأ: متغير البيئة DISCORD_TOKEN غير موجود!');
  process.exit(1);
}

client.login(token)
  .then(() => console.log('⏳ جاري الاتصال بالديسكورد...'))
  .catch(err => {
    console.error('❌ فشل تسجيل الدخول:', err.message);
    process.exit(1);
  });
