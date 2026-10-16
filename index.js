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

function ensureDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    const initialData = { users: {}, gangs: {}, auctions: [], settings: {} };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
    console.log('✅ تم إنشاء ملف البيانات');
  }
}

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

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error('❌ خطأ في حفظ البيانات:', err.message);
    return false;
  }
}

// === عناصر السوق السوداء والأسلحة ===
const WEAPONS = {
  knife: { name: 'سكين حاد 🔪', price: 500, successBonus: 0.1, desc: 'سلاح خفيف يزيد نسبة نجاح السرقة قليلاً' },
  pistol: { name: 'مسدس 9mm 🔫', price: 2000, successBonus: 0.25, desc: 'مسدس أساسي لفرض السيطرة' },
  smg: { name: 'رشاش قصير 🪖', price: 7000, successBonus: 0.4, desc: 'رشاش سريع للعمليات الكبرى' },
  armor: { name: 'درع واقي 🛡️', price: 4000, successBonus: 0, desc: 'يحميك من الغرامات عند فشل الجريمة' }
};

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

// === تعريف الأوامر (شاملة الأوامر الجديدة) ===
const commands = [
  new SlashCommandBuilder()
    .setName('انضمام')
    .setDescription('إنشاء حساب جديد في عالم العصابات'),

  new SlashCommandBuilder()
    .setName('حساب')
    .setDescription('عرض معلومات حسابك، أسلحتك، ورصيدك'),

  new SlashCommandBuilder()
    .setName('يومي')
    .setDescription('الحصول على مكافأتك اليومية'),

  new SlashCommandBuilder()
    .setName('سوق_سوداء')
    .setDescription('عرض السوق السوداء لشراء الأسلحة والدروع'),

  new SlashCommandBuilder()
    .setName('شراء')
    .setDescription('شراء سلاح أو معدات من السوق السوداء')
    .addStringOption(option =>
      option.setName('القطعة')
        .setDescription('اختر السلاح أو الدرع')
        .setRequired(true)
        .addChoices(
          { name: 'سكين (500 عملة)', value: 'knife' },
          { name: 'مسدس (2000 عملة)', value: 'pistol' },
          { name: 'رشاش (7000 عملة)', value: 'smg' },
          { name: 'درع واقي (4000 عملة)', value: 'armor' }
        )),

  new SlashCommandBuilder()
    .setName('سرقة')
    .setDescription('تنفيذ عملية سطو مسلح لجمع الأموال'),

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
    .setName('العاب')
    .setDescription('عرض قائمة الألعاب المتاحة')
];

commands.forEach(cmd => {
  client.commands.set(cmd.name, cmd);
});

// === عند جاهزية البوت ===
client.once(Events.ClientReady, async () => {
  console.log(`✅ تم تسجيل الدخول كـ: ${client.user.tag}`);
  
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
  
  // التأكد من وجود المستخدم في قاعدة البيانات
  if (!data.users[user.id]) {
    data.users[user.id] = {
      balance: 1000,
      createdAt: new Date().toISOString(),
      dailyLast: null,
      gamesPlayed: 0,
      inventory: { knife: 0, pistol: 0, smg: 0, armor: 0 }
    };
  }

  const userData = data.users[user.id];
  // ضمان وجود حقيبة الأرصدة للمستخدمين القدامى
  if (!userData.inventory) {
    userData.inventory = { knife: 0, pistol: 0, smg: 0, armor: 0 };
  }

  switch (commandName) {
    case 'انضمام': {
      if (userData.gamesPlayed > 0 || userData.balance !== 1000) {
        return interaction.reply({ content: '❌ لديك حساب مسجل بالفعل! استخدم `/حساب` لعرض بياناتك', ephemeral: true });
      }
      return interaction.reply('✅ حسابك مفعل وجاهز بالفعل! استخدم `/حساب` لعرض رصيدك.');
    }

    case 'حساب': {
      let invText = '';
      for (const [k, v] of Object.entries(userData.inventory)) {
        if (v > 0) invText += `• ${WEAPONS[k].name}: **${v}**\n`;
      }
      if (!invText) invText = 'لا توجد أسلحة أو دروع (تفقّد `/سوق_سوداء`)';

      const embed = new EmbedBuilder()
        .setColor('#2ECC71')
        .setTitle(`📊 ملف المجرم: ${user.username}`)
        .addFields(
          { name: '💰 الرصيد النقدي', value: `${userData.balance.toLocaleString()} عملة`, inline: true },
          { name: '🎒 الترسانة والأدوات', value: invText, inline: false },
          { name: '📅 تاريخ الانضمام', value: `<t:${Math.floor(new Date(userData.createdAt).getTime() / 1000)}:D>`, inline: false }
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
          content: `⏳ لقد حصلت على مكافأتك اليومية بالفعل! عُد لاحقاً: <t:${Math.floor(nextTime.getTime() / 1000)}:R>`,
          ephemeral: true 
        });
      }
      
      userData.balance += 300;
      userData.dailyLast = now.toISOString();
      saveData(data);
      return interaction.reply(`✅ تم إضافة **300** عملة دعم لعصابتك! رصيدك الحالي: **${userData.balance.toLocaleString()}** 🪙`);
    }

    case 'سوق_سوداء': {
      const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('🏴‍☠️ السوق السوداء للأسلحة')
        .setDescription('استخدم أمر `/شراء [القطعة]` لتجهيز نفسك لعمليات السطو والحروب.');

      for (const [key, item] of Object.entries(WEAPONS)) {
        embed.addFields({
          name: `${item.name} — السعر: ${item.price.toLocaleString()} عملة`,
          value: `${item.desc}\n*(أمر الشراء: \`/شراء ${key}\`)*`,
          inline: false
        });
      }
      return interaction.reply({ embeds: [embed] });
    }

    case 'شراء': {
      const itemKey = options.getString('القطعة');
      const item = WEAPONS[itemKey];

      if (!item) return interaction.reply({ content: '❌ هذه القطعة غير متوفرة في السوق السوداء!', ephemeral: true });

      if (userData.balance < item.price) {
        return interaction.reply({ content: `❌ رصيدك لا يكفي! تحتاج إلى **${item.price.toLocaleString()}** عملة لشراء ${item.name}.`, ephemeral: true });
      }

      userData.balance -= item.price;
      userData.inventory[itemKey] = (userData.inventory[itemKey] || 0) + 1;
      saveData(data);

      return interaction.reply(`✅ **تمت الصفقة بنجاح!** اشتريت **${item.name}** وأصبح في ترسانتك الآن. 🗡️🔥`);
    }

    case 'سرقة': {
      // حساب نسبة النجاح بناءً على الأسلحة المملوكة
      let baseChance = 0.4; // 40% نسبة نجاح أساسية
      if (userData.inventory.pistol > 0) baseChance += 0.15;
      if (userData.inventory.smg > 0) baseChance += 0.3;
      if (userData.inventory.knife > 0) baseChance += 0.05;

      const isSuccess = Math.random() < baseChance;

      if (isSuccess) {
        const loot = Math.floor(Math.random() * 800) + 200; // ربح بين 200 و 1000
        userData.balance += loot;
        saveData(data);
        return interaction.reply(`🥷 **عملية سطو ناجحة!** هاجمت أحد المتاجر وهربت مع غنيمة بقيمة **${loot.toLocaleString()}** عملة! 💰✨`);
      } else {
        // التحقق من وجود درع حماية
        if (userData.inventory.armor > 0) {
          userData.inventory.armor -= 1;
          saveData(data);
          return interaction.reply(`🛡️ **فشلت عملية السطو وتدخلت الشرطة!** لكن **الدرع الواقي** الخاص بك امتص الغرامة وأنقذك من الخسارة المالية!`);
        } else {
          const fine = Math.min(userData.balance, 300);
          userData.balance -= fine;
          saveData(data);
          return interaction.reply(`🚨 **فشلت العملية وتم القبض عليك!** قامت الشرطة بتغريمك مبلغ **${fine.toLocaleString()}** عملة. (نصيحة: اشترِ درعاً واقياً من `/سوق_سوداء` للحماية).`);
        }
      }
    }

    case 'تعويض': {
      if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({ content: '❌ غير مسموح لك بهذا الأمر!', ephemeral: true });
      }
      
      const targetUser = options.getUser('الشخص');
      const amount = options.getInteger('المبلغ');
      
      if (!data.users[targetUser.id]) {
        data.users[targetUser.id] = { balance: 0, createdAt: new Date().toISOString(), dailyLast: null, gamesPlayed: 0, inventory: { knife: 0, pistol: 0, smg: 0, armor: 0 } };
      }
      
      data.users[targetUser.id].balance += amount;
      saveData(data);
      return interaction.reply(`✅ تم تعويض <@${targetUser.id}> بمبلغ **${amount.toLocaleString()}** عملة!`);
    }

    case 'مزاد': {
      const activeAuctions = data.auctions.filter(a => a.active);
      if (activeAuctions.length === 0) {
        return interaction.reply('🏷️ لا توجد مزادات نشطة حالياً في السوق السوداء.');
      }
      let msg = '🏷️ **المزادات النشطة:**\n';
      activeAuctions.forEach((a, i) => {
        msg += `${i + 1}. **${a.name}** — السعر الحالي: ${a.currentPrice} عملة\n`;
      });
      return interaction.reply(msg);
    }

    case 'العاب': {
      return interaction.reply(`
🎮 **أنشطة العصابات المتاحة:**
> • \`/سرقة\` - تنفيذ عملية سطو مسلح لجمع الأموال
> • \`/سوق_سوداء\` - شراء الأسلحة والدروع
> • \`/يومي\` - استلام دعم العصابة اليومي
      `);
    }

    default:
      return interaction.reply({ content: '❌ الأمر غير معروف!', ephemeral: true });
  }
});

// === معالجة الأخطاء والتشغيل ===
client.on(Events.ShardError, error => console.error('⚠️ خطأ في الاتصال:', error));
client.on(Events.Error, error => console.error('❌ خطأ في البوت:', error));

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
