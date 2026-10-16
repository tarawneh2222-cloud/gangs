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
web.get('/', (_req, res) => res.status(200).send('✅ البوت يعمل بنجاح وحافظ البيانات آمن'));
web.get('/health', (_req, res) => res.json({ ok: true }));
web.listen(Number(process.env.PORT) || 3000, '0.0.0.0');

// === نظام حفظ البيانات المطور والمؤمن ===
const DATA_FILE = path.join(__dirname, 'data.json');
const BACKUP_FILE = path.join(__dirname, 'data_backup.json');

function ensureDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    if (fs.existsSync(BACKUP_FILE)) {
      fs.copyFileSync(BACKUP_FILE, DATA_FILE);
      console.log('🔄 تم استعادة البيانات من النسخة الاحتياطية!');
    } else {
      const initialData = { users: {}, gangs: {}, auctions: [], settings: {} };
      fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
      console.log('✅ تم إنشاء ملف البيانات الرئيسي');
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
    return parsed;
  } catch (err) {
    console.error('❌ خطأ في قراءة البيانات، جاري المحاولة من النسخة الاحتياطية:', err.message);
    if (fs.existsSync(BACKUP_FILE)) {
      const rawBackup = fs.readFileSync(BACKUP_FILE, 'utf8');
      return JSON.parse(rawBackup);
    }
    return { users: {}, gangs: {}, auctions: [], settings: {} };
  }
}

function saveData(data) {
  try {
    const jsonString = JSON.stringify(data, null, 2);
    fs.writeFileSync(DATA_FILE, jsonString);
    // حفظ نسخة احتياطية فورية لضمان عدم ضياع أي ملف أثناء التحديثات
    fs.writeFileSync(BACKUP_FILE, jsonString);
    return true;
  } catch (err) {
    console.error('❌ خطأ في حفظ البيانات:', err.message);
    return false;
  }
}

// === قائمة الأسلحة والمعدات والمركبات ===
const WEAPONS = {
  knife: { name: 'سكين حاد 🔪', price: 500, desc: 'سلاح خفيف يزيد نسبة النجاح قليلاً' },
  pistol: { name: 'مسدس 9mm 🔫', price: 2000, desc: 'مسدس أساسي لفرض السيطرة' },
  smg: { name: 'رشاش قصير 🪖', price: 7000, desc: 'رشاش سريع للعمليات الكبرى' },
  armor: { name: 'درع واقي 🛡️', price: 4000, desc: 'يحميك من الغرامات والسجن عند فشل الجريمة' },
  car: { name: 'سيارة هرب سريعة 🏎️', price: 15000, desc: 'تضاعف نسبة نجاح الفرار والتهريب!' }
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

// === تعريف الأوامر التفاعلية ===
const commands = [
  new SlashCommandBuilder()
    .setName('قائمة')
    .setDescription('عرض المركز الرئيسي واللوحة التفاعلية لعالم العصابات'),

  new SlashCommandBuilder()
    .setName('انضمام')
    .setDescription('إنشاء حساب جديد في عالم العصابات'),

  new SlashCommandBuilder()
    .setName('حساب')
    .setDescription('عرض معلومات حسابك، مستواك، أسلحتك، ورصيدك'),

  new SlashCommandBuilder()
    .setName('يومي')
    .setDescription('الحصول على مكافأتك اليومية'),

  new SlashCommandBuilder()
    .setName('سوق_سوداء')
    .setDescription('عرض السوق السوداء لشراء الأسلحة والدروع والسيارات'),

  new SlashCommandBuilder()
    .setName('شراء')
    .setDescription('شراء سلاح، معدات، أو سيارة هرب')
    .addStringOption(option =>
      option.setName('القطعة')
        .setDescription('اختر العنصر المراد شراؤه')
        .setRequired(true)
        .addChoices(
          { name: 'سكين (500 عملة)', value: 'knife' },
          { name: 'مسدس (2000 عملة)', value: 'pistol' },
          { name: 'رشاش (7000 عملة)', value: 'smg' },
          { name: 'درع واقي (4000 عملة)', value: 'armor' },
          { name: 'سيارة هرب سريعة (15000 عملة)', value: 'car' }
        )),

  new SlashCommandBuilder()
    .setName('سرقة')
    .setDescription('تنفيذ عملية سطو مسلح لجمع الأموال واكتساب الخبرة'),

  new SlashCommandBuilder()
    .setName('السجن')
    .setDescription('عرض حالة السجن واللاعبين المسجونين حالياً'),

  new SlashCommandBuilder()
    .setName('كفالة')
    .setDescription('دفع مبلغ كفالة للخروج من السجن فوراً (التكلفة: 1,500 عملة)'),

  new SlashCommandBuilder()
    .setName('تهريب')
    .setDescription('تنفيذ عملية اقتحام لتهريب صديق أو عضو عصابة من السجن')
    .addUserOption(option =>
      option.setName('الشخص')
        .setDescription('اختر السجين المراد تهريبه')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('إنشاء_عصابة')
    .setDescription('تأسيس عصابة جديدة خاصة بك (التكلفة: 5,000 عملة)')
    .addStringOption(option =>
      option.setName('الاسم')
        .setDescription('اسم العصابة المراد تأسيسها')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('عصابتي')
    .setDescription('عرض تفاصيل عصابتك ورصيد الخزينة مع الأزرار التفاعلية'),

  new SlashCommandBuilder()
    .setName('انضمام_عصابة')
    .setDescription('الانضمام إلى عصابة موجودة')
    .addStringOption(option =>
      option.setName('الاسم')
        .setDescription('اسم العصابة')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('تغذية_الخزينة')
    .setDescription('التبرع بمبلغ مالي لصندوق عصابتك')
    .addIntegerOption(option =>
      option.setName('المبلغ')
        .setDescription('المبلغ المراد تبرعه')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('لوحة_الصدارة')
    .setDescription('عرض أثرى المجرمين وأقوى العصابات في السيرفر'),

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
        .setRequired(true))
];

commands.forEach(cmd => {
  client.commands.set(cmd.name, cmd);
});

// === عند جاهزية البوت ===
client.once(Events.ClientReady, async () => {
  console.log(`✅ تم تسجيل الدخول بنجاح كـ: ${client.user.tag}`);
  
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log('⏳ جاري تحديث تسجيل الأوامر...');
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    console.log('✅ تم تسجيل وتزامن جميع الأوامر بنجاح!');
  } catch (error) {
    console.error('❌ خطأ في تحميل الأوامر:', error);
  }
});

// === إعداد هيكل حساب المستخدم الشامل ===
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
      jailUntil: 0
    };
  }
  // التاكد من وجود جميع الخصائص المحدثة
  const u = data.users[userId];
  if (u.xp === undefined) u.xp = 0;
  if (u.level === undefined) u.level = 1;
  if (!u.inventory) u.inventory = { knife: 0, pistol: 0, smg: 0, armor: 0, car: 0 };
  if (u.inventory.car === undefined) u.inventory.car = 0;
}

// === إضافة خبرة وترقية المستوى ===
function addXp(userData, amount) {
  userData.xp += amount;
  const nextLevelXp = userData.level * 200;
  if (userData.xp >= nextLevelXp) {
    userData.level += 1;
    return true; // تمت الترقية
  }
  return false;
}

// === معالجة الأوامر التفاعلية ===
client.on(Events.InteractionCreate, async interaction => {
  const data = readData();

  // 1. الأزرار التفاعلية (Buttons)
  if (interaction.isButton()) {
    const userId = interaction.user.id;
    initUser(data, userId);
    const userData = data.users[userId];

    if (interaction.customId === 'main_btn_account') {
      let invText = '';
      for (const [k, v] of Object.entries(userData.inventory)) {
        if (v > 0) invText += `• ${WEAPONS[k].name}: **${v}**\n`;
      }
      if (!invText) invText = 'لا توجد أسلحة أو مركبات (تفقّد السوق السوداء)';
      const gangInfo = userData.gang ? userData.gang : 'بدون عصابة ❌';

      const embed = new EmbedBuilder()
        .setColor('#2ECC71')
        .setTitle(`📊 ملف المجرم: ${interaction.user.username}`)
        .addFields(
          { name: '💰 الرصيد النقدي', value: `${userData.balance.toLocaleString()} عملة`, inline: true },
          { name: '⭐ المستوى (Level)', value: `مستوى **${userData.level}** (${userData.xp} XP)`, inline: true },
          { name: '🛡️ العصابة', value: gangInfo, inline: true },
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
        .setTitle(`🏴‍☠️ لوحة تحكم عصابة: ${gang.name}`)
        .addFields(
          { name: '👑 الزعيم', value: `<@${gang.leader}>`, inline: true },
          { name: '👥 عدد الأعضاء', value: `${gang.members.length} عضو`, inline: true },
          { name: '💰 خزينة العصابة', value: `${gang.bank.toLocaleString()} عملة`, inline: true }
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.customId === 'main_btn_market') {
      const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('🏴‍☠️ السوق السوداء للأسلحة والسيارات')
        .setDescription('استخدم أمر `/شراء [القطعة]` لشراء المعدات وتطوير قوتك.');

      for (const [key, item] of Object.entries(WEAPONS)) {
        embed.addFields({
          name: `${item.name} — السعر: ${item.price.toLocaleString()} عملة`,
          value: `${item.desc}\n*(أمر الشراء: \`/شراء ${key}\`)*`,
          inline: false
        });
      }
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.customId === 'main_btn_jail') {
      const now = Date.now();
      const inJail = (userData.jailUntil || 0) > now;
      if (inJail) {
        const remSec = Math.ceil((userData.jailUntil - now) / 1000);
        return interaction.reply({ content: `🚨 **أنت محتجز داخل السجن!** ينتهي أسرُك بعد **${remSec} ثانية**.\nاستخدم \`/كفالة\` للخروج فوراً أو اطلب التهريب.`, ephemeral: true });
      } else {
        return interaction.reply({ content: '🕊️ **أنت طليق وحر!** لست مسجوناً حالياً.', ephemeral: true });
      }
    }
    return;
  }

  // 2. أوامر الشات (Slash Commands)
  if (!interaction.isChatInputCommand()) return;

  const { commandName, user, options } = interaction;
  initUser(data, user.id);
  const userData = data.users[user.id];

  switch (commandName) {
    case 'قائمة': {
      const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('🏛️ المركز الرئيسي لعالم الجريمة والعصابات')
        .setDescription('اختر القسم الذي ترغب بالوصول إليه مباشرة عبر الأزرار أدناه: 🔥')
        .addFields(
          { name: '💳 حسابي', value: 'عرض الرصيد والمستوى والترسانة', inline: true },
          { name: '🏴‍☠️ عصابتي', value: 'إدارة العصابة والتبرع', inline: true },
          { name: '🛒 السوق السوداء', value: 'شراء الأسلحة والسيارات', inline: true },
          { name: '🚔 السجن', value: 'معاينة حالة الأسر للسجناء', inline: true }
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('main_btn_account').setLabel('💳 حسابي').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('main_btn_gang').setLabel('🏴‍☠️ عصابتي').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('main_btn_market').setLabel('🛒 السوق السوداء').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('main_btn_jail').setLabel('🚔 السجن').setStyle(ButtonStyle.Danger)
      );

      return interaction.reply({ embeds: [embed], components: [row] });
    }

    case 'حساب': {
      let invText = '';
      for (const [k, v] of Object.entries(userData.inventory)) {
        if (v > 0) invText += `• ${WEAPONS[k].name}: **${v}**\n`;
      }
      if (!invText) invText = 'لا توجد أسلحة أو سيارات';

      const gangInfo = userData.gang ? userData.gang : 'أعزب / بدون عصابة ❌';

      const embed = new EmbedBuilder()
        .setColor('#2ECC71')
        .setTitle(`📊 ملف المجرم: ${user.username}`)
        .addFields(
          { name: '💰 الرصيد النقدي', value: `${userData.balance.toLocaleString()} عملة`, inline: true },
          { name: '⭐ المستوى (Level)', value: `مستوى **${userData.level}** (${userData.xp} XP)`, inline: true },
          { name: '🛡️ العصابة الحالية', value: gangInfo, inline: true },
          { name: '🎒 الترسانة والمركبات', value: invText, inline: false }
        );
      return interaction.reply({ embeds: [embed] });
    }

    case 'سرقة': {
      const now = Date.now();
      if ((userData.jailUntil || 0) > now) {
        const remSec = Math.ceil((userData.jailUntil - now) / 1000);
        return interaction.reply({ content: `🚨 **أنت محتجز خلف القضبان!** لا يمكنك السطو حتى خروجك من السجن (باقي: ${remSec} ثانية).\nاستخدم \`/كفالة\` للخروج فوراً.`, ephemeral: true });
      }

      // حساب نسب النجاح بناءً على المعدات والمستوى
      let baseChance = 0.40 + (userData.level * 0.02);
      if (userData.inventory.pistol > 0) baseChance += 0.15;
      if (userData.inventory.smg > 0) baseChance += 0.25;
      if (userData.inventory.car > 0) baseChance += 0.10; // سيارة الهرب تزيد النجاح

      const isSuccess = Math.random() < baseChance;

      if (isSuccess) {
        const loot = Math.floor(Math.random() * 800) + 200 + (userData.level * 50);
        userData.balance += loot;
        const leveledUp = addXp(userData, 40);
        
        saveData(data); // 🟢 حفظ فوري مع نسخة احتياطية

        let msg = `🥷 **عملية سطو ناجحة!** هربت بغنيمة بقيمة **${loot.toLocaleString()}** عملة و كسبت **40 XP**! 💰✨`;
        if (leveledUp) msg += `\n🎉 **مبروك! ارتفع مستواك إلى المستوى ${userData.level}!**`;
        
        return interaction.reply(msg);
      } else {
        if (userData.inventory.armor > 0) {
          userData.inventory.armor -= 1;
          saveData(data);
          return interaction.reply(`🛡️ **فشلت عملية السطو وتدخلت الشرطة!** لكن **الدرع الواقي** حماك وأنقذك من السجن!`);
        } else {
          // السجن لمدة 10 دقائق والحفظ الفوري المضمون
          userData.jailUntil = now + (10 * 60 * 1000);
          const fine = Math.min(userData.balance, 300);
          userData.balance -= fine;
          
          saveData(data); // 🟢 حفظ فوري يمنع خطأ السجن

          return interaction.reply(`🚨 **قبضت عليك الشرطة أثناء السطو!** تم تغريمك **${fine.toLocaleString()}** عملة وإيداعك **السجن لمدة 10 دقائق**! 🚔 (استخدم \`/كفالة\` للخروج).`);
        }
      }
    }

    case 'كفالة': {
      const now = Date.now();
      const BAIL_COST = 1500;

      if ((userData.jailUntil || 0) <= now) {
        return interaction.reply({ content: '❌ أنت لست مسجوناً لتشتر الكفالة!', ephemeral: true });
      }

      if (userData.balance < BAIL_COST) {
        return interaction.reply({ content: `❌ رصيدك النقدي لا يكفي لدفع الكفالة (**${BAIL_COST.toLocaleString()}** عملة)!`, ephemeral: true });
      }

      userData.balance -= BAIL_COST;
      userData.jailUntil = 0;
      saveData(data); // 🟢 حفظ فوري

      return interaction.reply(`🔓 **تم الخروج بنجاح!** دفعت كفالة بقيمة **${BAIL_COST.toLocaleString()}** عملة وغادرت السجن فوراً! 🕊️`);
    }

    case 'سوق_سوداء': {
      const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('🏴‍☠️ السوق السوداء للأسلحة والسيارات')
        .setDescription('استخدم أمر `/شراء [القطعة]` لتجهيز نفسك بأسلحة وسيارات هرب سريعة.');

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

      if (!item) return interaction.reply({ content: '❌ هذه القطعة غير متوفرة!', ephemeral: true });

      if (userData.balance < item.price) {
        return interaction.reply({ content: `❌ رصيدك لا يكفي! تحتاج إلى **${item.price.toLocaleString()}** عملة.`, ephemeral: true });
      }

      userData.balance -= item.price;
      userData.inventory[itemKey] = (userData.inventory[itemKey] || 0) + 1;
      saveData(data); // 🟢 حفظ فوري

      return interaction.reply(`✅ **تمت الصفقة بنجاح!** اشتريت **${item.name}** وتمت إضافتها إلى حسابك! 🏎️🔥`);
    }

    case 'لوحة_الصدارة': {
      const sortedUsers = Object.entries(data.users)
        .map(([id, u]) => ({ id, balance: u.balance || 0, level: u.level || 1 }))
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 5);

      let topUsersText = sortedUsers.map((u, i) => `${i + 1}. <@${u.id}> — **${u.balance.toLocaleString()}** عملة (مستوى ${u.level})`).join('\n');
      if (!topUsersText) topUsersText = 'لا يوجد مجرمون مسجلون بعد.';

      const embed = new EmbedBuilder()
        .setColor('#f1c40f')
        .setTitle('🏆 لوحة صدارة أثرى أثرياء عالم الجريمة')
        .setDescription(topUsersText);

      return interaction.reply({ embeds: [embed] });
    }

    case 'تعويض': {
      if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({ content: '❌ غير مسموح لك بهذا الأمر!', ephemeral: true });
      }
      const targetUser = options.getUser('الشخص');
      const amount = options.getInteger('المبلغ');
      
      initUser(data, targetUser.id);
      data.users[targetUser.id].balance += amount;
      saveData(data); // 🟢 حفظ فوري
      
      return interaction.reply(`✅ تم تعويض <@${targetUser.id}> بمبلغ **${amount.toLocaleString()}** عملة!`);
    }

    default:
      return interaction.reply({ content: '❌ الأمر غير معروف!', ephemeral: true });
  }
});

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
