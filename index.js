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
    const parsed = JSON.parse(raw);
    if (!parsed.gangs) parsed.gangs = {};
    if (!parsed.users) parsed.users = {};
    return parsed;
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
  knife: { name: 'سكين حاد 🔪', price: 500, desc: 'سلاح خفيف يزيد نسبة نجاح السرقة والتهريب قليلاً' },
  pistol: { name: 'مسدس 9mm 🔫', price: 2000, desc: 'مسدس أساسي لفرض السيطرة' },
  smg: { name: 'رشاش قصير 🪖', price: 7000, desc: 'رشاش سريع للعمليات الكبرى' },
  armor: { name: 'درع واقي 🛡️', price: 4000, desc: 'يحميك من الغرامات والسجن عند فشل الجريمة' }
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

// === تعريف الأوامر ===
const commands = [
  new SlashCommandBuilder()
    .setName('قائمة')
    .setDescription('عرض المركز الرئيسي واللوحة التفاعلية لعالم العصابات'),

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

// === معالجة الأوامر التفاعلية (Slash Commands & Buttons) ===
client.on(Events.InteractionCreate, async interaction => {
  const data = readData();

  // 1. معالجة الأزرار التفاعلية (Buttons)
  if (interaction.isButton()) {
    const userId = interaction.user.id;
    if (!data.users[userId]) {
      data.users[userId] = {
        balance: 1000,
        createdAt: new Date().toISOString(),
        dailyLast: null,
        gamesPlayed: 0,
        inventory: { knife: 0, pistol: 0, smg: 0, armor: 0 },
        gang: null,
        jailUntil: 0
      };
    }
    const userData = data.users[userId];

    // أزرار لوحة القائمة الرئيسية (/قائمة)
    if (interaction.customId === 'main_btn_account') {
      let invText = '';
      for (const [k, v] of Object.entries(userData.inventory || {})) {
        if (v > 0) invText += `• ${WEAPONS[k].name}: **${v}**\n`;
      }
      if (!invText) invText = 'لا توجد أسلحة أو دروع (تفقّد السوق السوداء)';
      const gangInfo = userData.gang ? userData.gang : 'أعزب / بدون عصابة ❌';

      const embed = new EmbedBuilder()
        .setColor('#2ECC71')
        .setTitle(`📊 ملف المجرم: ${interaction.user.username}`)
        .addFields(
          { name: '💰 الرصيد النقدي', value: `${userData.balance.toLocaleString()} عملة`, inline: true },
          { name: '🛡️ العصابة الحالية', value: gangInfo, inline: true },
          { name: '🎒 الترسانة والأدوات', value: invText, inline: false }
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.customId === 'main_btn_gang') {
      if (!userData.gang || !data.gangs[userData.gang]) {
        return interaction.reply({ content: '❌ أنت لا تنتمي لرباط أو عصابة حالياً! استعمل `/إنشاء_عصابة` أو `/انضمام_عصابة`.', ephemeral: true });
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
        .setTitle('🏴‍☠️ السوق السوداء للأسلحة')
        .setDescription('استخدم أمر `/شراء [القطعة]` لشراء الأسلحة وتجهيز نفسك.');

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
        return interaction.reply({ content: `🚨 **أنت محتجز داخل السجن!** ينتهي أسرُك بعد **${remSec} ثانية**.\nاستخدم \`/كفالة\` للخروج فوراً أو اطلب من صديق استخدام \`/تهريب\`.`, ephemeral: true });
      } else {
        return interaction.reply({ content: '🕊️ **أنت طليق وحر!** لست مسجوناً حالياً.', ephemeral: true });
      }
    }

    // أزرار لوحة العصابة
    if (interaction.customId === 'btn_gang_members') {
      const gang = data.gangs[userData.gang];
      if (!gang) return interaction.reply({ content: '❌ لم يتم العثور على بيانات العصابة!', ephemeral: true });
      const membersList = gang.members.map(mId => `<@${mId}>`).join('\n• ');
      const embed = new EmbedBuilder()
        .setColor('#8e44ad')
        .setTitle(`👥 أعضاء عصابة [ ${gang.name} ]`)
        .setDescription(`**الزعيم:** <@${gang.leader}>\n\n**الأعضاء (${gang.members.length}):**\n• ${membersList}`);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.customId === 'btn_gang_deposit') {
      return interaction.reply({
        content: `💡 لتغذية خزينة عصابتك بالأموال، اكتب الأمر:\n\`/تغذية_الخزينة [المبلغ]\`\nمثال: \`/تغذية_الخزينة 1000\``,
        ephemeral: true
      });
    }

    if (interaction.customId === 'btn_gang_leave') {
      const gang = data.gangs[userData.gang];
      if (!gang) return interaction.reply({ content: '❌ لم يتم العثور على العصابة!', ephemeral: true });
      if (gang.leader === userId) {
        return interaction.reply({ content: '❌ لا يمكنك مغادرة العصابة بصفتك الزعيم!', ephemeral: true });
      }
      gang.members = gang.members.filter(m => m !== userId);
      userData.gang = null;
      saveData(data);
      return interaction.reply({ content: `🚶‍♂️ لقد غادرت عصابة **${gang.name}** بنجاح.`, ephemeral: true });
    }
    return;
  }

  // 2. معالجة أوامر الشات
  if (!interaction.isChatInputCommand()) return;

  const { commandName, user, options } = interaction;
  
  if (!data.users[user.id]) {
    data.users[user.id] = {
      balance: 1000,
      createdAt: new Date().toISOString(),
      dailyLast: null,
      gamesPlayed: 0,
      inventory: { knife: 0, pistol: 0, smg: 0, armor: 0 },
      gang: null,
      jailUntil: 0
    };
  }

  const userData = data.users[user.id];
  if (!userData.inventory) userData.inventory = { knife: 0, pistol: 0, smg: 0, armor: 0 };

  switch (commandName) {
    case 'قائمة': {
      const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('🏛️ المركز الرئيسي لعالم الجريمة والعصابات')
        .setDescription('مرحباً بك في لوحة التحكم المركزية! اختر القسم الذي ترغب بالوصول إليه مباشرة من الأزرار التفاعلية أدناه: 🔥')
        .addFields(
          { name: '💳 حسابي', value: 'عرض الرصيد والترسانة الشخصية', inline: true },
          { name: '🏴‍☠️ عصابتي', value: 'إدارة العصابة والأعضاء', inline: true },
          { name: '🛒 السوق السوداء', value: 'شراء الأسلحة والتجهيزات', inline: true },
          { name: '🚔 السجن', value: 'معاينة وضع الأسر والسجناء', inline: true }
        );

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('main_btn_account').setLabel('💳 حسابي').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('main_btn_gang').setLabel('🏴‍☠️ عصابتي').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('main_btn_market').setLabel('🛒 السوق السوداء').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('main_btn_jail').setLabel('🚔 السجن').setStyle(ButtonStyle.Danger)
      );

      return interaction.reply({ embeds: [embed], components: [row1] });
    }

    case 'انضمام': {
      return interaction.reply('✅ حسابك مفعل وجاهز بالفعل! استخدم `/قائمة` أو `/حساب`.');
    }

    case 'حساب': {
      let invText = '';
      for (const [k, v] of Object.entries(userData.inventory)) {
        if (v > 0) invText += `• ${WEAPONS[k].name}: **${v}**\n`;
      }
      if (!invText) invText = 'لا توجد أسلحة أو دروع (تفقّد `/سوق_سوداء`)';

      const gangInfo = userData.gang ? userData.gang : 'أعزب / بدون عصابة ❌';

      const embed = new EmbedBuilder()
        .setColor('#2ECC71')
        .setTitle(`📊 ملف المجرم: ${user.username}`)
        .addFields(
          { name: '💰 الرصيد النقدي', value: `${userData.balance.toLocaleString()} عملة`, inline: true },
          { name: '🛡️ العصابة الحالية', value: gangInfo, inline: true },
          { name: '🎒 الترسانة والأدوات', value: invText, inline: false },
          { name: '📅 تاريخ الانضمام', value: `<t:${Math.floor(new Date(userData.createdAt).getTime() / 1000)}:D>`, inline: false }
        );
      return interaction.reply({ embeds: [embed] });
    }

      case 'سرقة': {
      const now = Date.now();
      if ((userData.jailUntil || 0) > now) {
        const remMinutes = Math.ceil((userData.jailUntil - now) / (1000 * 60));
        return interaction.reply({ content: `🚨 **أنت محتجز خلف القضبان!** لا يمكنك السطو حتى خروجك من السجن (باقي: ${remMinutes} دقيقة).\nاستخدم \`/كفالة\` الخروج فوراً أو اطلب التهريب.`, ephemeral: true });
      }

      let baseChance = 0.4;
      if (userData.inventory.pistol > 0) baseChance += 0.15;
      if (userData.inventory.smg > 0) baseChance += 0.3;
      if (userData.inventory.knife > 0) baseChance += 0.05;

      const isSuccess = Math.random() < baseChance;

      if (isSuccess) {
        const loot = Math.floor(Math.random() * 800) + 200;
        userData.balance += loot;
        saveData(data);
        return interaction.reply(`🥷 **عملية سطو ناجحة!** هاجمت أحد المتاجر وهربت مع غنيمة بقيمة **${loot.toLocaleString()}** عملة! 💰✨`);
      } else {
        if (userData.inventory.armor > 0) {
          userData.inventory.armor -= 1;
          saveData(data);
          return interaction.reply(`🛡️ **فشلت عملية السطو وتدخلت الشرطة!** لكن **الدرع الواقي** الخاص بك امتص الهجوم وأنقذك من السجن والخراب!`);
        } else {
          // السجن لمدة 10 دقائق مع حفظ البيانات فوراً
          userData.jailUntil = now + (10 * 60 * 1000);
          const fine = Math.min(userData.balance, 300);
          userData.balance -= fine;
          
          saveData(data); // 

          return interaction.reply(`🚨 **قبضت عليك الشرطة أثناء السطو!** تم تغريمك **${fine.toLocaleString()}** عملة وإيداعك **السجن لمدة 10 دقائق**! 🚔 (استخدم \`/كفالة\` للخروج).`);
        }
      }
    }


    case 'السجن': {
      const now = Date.now();
      const prisoners = [];
      for (const [id, u] of Object.entries(data.users)) {
        if ((u.jailUntil || 0) > now) {
          const remSec = Math.ceil((u.jailUntil - now) / 1000);
          prisoners.push(`• <@${id}> (متبقي: **${remSec} ثانية**)`);
        }
      }

      if (prisoners.length === 0) {
        return interaction.reply('🕊️ **السجن فارغ تماماً حالياً!** لا يوجد أي مسجون خلف القضبان.');
      }

      const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('🚔 قائمة المحتجزين داخل السجن المركزى')
        .setDescription(prisoners.join('\n'));

      return interaction.reply({ embeds: [embed] });
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
      saveData(data);

      return interaction.reply(`🔓 **تمت الخروج بنجاح!** دفعت كفالة بقيمة **${BAIL_COST.toLocaleString()}** عملة وغادرت السجن فوراً! 🕊️`);
    }

    case 'تهريب': {
      const targetUser = options.getUser('الشخص');
      const now = Date.now();

      if (targetUser.id === user.id) {
        return interaction.reply({ content: '❌ لا يمكنك تهريب نفسك! استخدم `/كفالة` الخروج المباشر.', ephemeral: true });
      }

      const targetData = data.users[targetUser.id];
      if (!targetData || (targetData.jailUntil || 0) <= now) {
        return interaction.reply({ content: '❌ هذا الشخص ليس مسجوناً حالياً!', ephemeral: true });
      }

      // حساب احتمال نجاح التهريب
      let breakOutChance = 0.35;
      if (userData.inventory.smg > 0) breakOutChance += 0.3;
      if (userData.inventory.pistol > 0) breakOutChance += 0.15;

      if (Math.random() < breakOutChance) {
        targetData.jailUntil = 0;
        saveData(data);
        return interaction.reply(`💥 **عملية اقتحام وتهريب ناجحة!** اقتحمت السجن وحررت <@${targetUser.id}> بنجاح! 🔥🔓`);
      } else {
        // فشل عملية التهريب وسجن المهرب أيضاً لمدة 5 دقائق
        userData.jailUntil = now + (5 * 60 * 1000);
        saveData(data);
        return interaction.reply(`🚨 **فشلت عملية التهريب وتصدت الحراسة للمقتحم!** تم القبض على المهرب <@${user.id}> وحبسه لمدة **5 دقائق** أيضاً! 🚔`);
      }
    }

    case 'إنشاء_عصابة': {
      const name = options.getString('الاسم').trim();
      const GANG_COST = 5000;

      if (userData.gang) {
        return interaction.reply({ content: `❌ أنت تنتمي بالفعل إلى عصابة **${userData.gang}**!`, ephemeral: true });
      }

      if (userData.balance < GANG_COST) {
        return interaction.reply({ content: `❌ بحاجة إلى **${GANG_COST.toLocaleString()}** عملة لتأسيس عصابة!`, ephemeral: true });
      }

      if (data.gangs[name]) {
        return interaction.reply({ content: '❌ هذا الاسم مستخدم لعصابة أخرى!', ephemeral: true });
      }

      userData.balance -= GANG_COST;
      userData.gang = name;

      data.gangs[name] = {
        name: name,
        leader: user.id,
        bank: 0,
        members: [user.id],
        createdAt: new Date().toISOString()
      };

      saveData(data);

      const embed = new EmbedBuilder()
        .setColor('#9b59b6')
        .setTitle('👑 تم تأسيس العصابة بنجاح!')
        .setDescription(`مبارك! أصبحت الزعيم لعصابة **[ ${name} ]** 🔥`);

      return interaction.reply({ embeds: [embed] });
    }

    case 'عصابتي': {
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

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_gang_members').setLabel('👥 الأعضاء').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('btn_gang_deposit').setLabel('💰 إيداع بالخزينة').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('btn_gang_leave').setLabel('🚶‍♂️ مغادرة').setStyle(ButtonStyle.Danger)
      );

      return interaction.reply({ embeds: [embed], components: [row] });
    }

    case 'انضمام_عصابة': {
      const name = options.getString('الاسم').trim();

      if (userData.gang) {
        return interaction.reply({ content: '❌ أنت تنتمي لعصابة بالفعل!', ephemeral: true });
      }

      if (!data.gangs[name]) {
        return interaction.reply({ content: '❌ هذه العصابة غير موجودة!', ephemeral: true });
      }

      const gang = data.gangs[name];
      gang.members.push(user.id);
      userData.gang = name;

      saveData(data);

      return interaction.reply(`🎉 **مبروك!** انضممت رسمياً إلى صفوف عصابة **[ ${name} ]**!`);
    }

    case 'تغذية_الخزينة': {
      const amount = options.getInteger('المبلغ');

      if (!userData.gang || !data.gangs[userData.gang]) {
        return interaction.reply({ content: '❌ أنت لست عضواً في أي عصابة!', ephemeral: true });
      }

      if (amount <= 0 || userData.balance < amount) {
        return interaction.reply({ content: '❌ رصيدك لا يكفي لإيداع هذا المبلغ!', ephemeral: true });
      }

      const gang = data.gangs[userData.gang];
      userData.balance -= amount;
      gang.bank += amount;

      saveData(data);

      return interaction.reply(`💰 تم إيداع **${amount.toLocaleString()}** عملة في خزينة عصابة **${gang.name}** بنجاح!`);
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

    case 'تعويض': {
      if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({ content: '❌ غير مسموح لك بهذا الأمر!', ephemeral: true });
      }
      
      const targetUser = options.getUser('الشخص');
      const amount = options.getInteger('المبلغ');
      
      if (!data.users[targetUser.id]) {
        data.users[targetUser.id] = { balance: 0, createdAt: new Date().toISOString(), dailyLast: null, gamesPlayed: 0, inventory: { knife: 0, pistol: 0, smg: 0, armor: 0 }, gang: null, jailUntil: 0 };
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
> • \`/قائمة\` - اللوحة الرئيسية للتحكم بالأزرار
> • \`/عصابتي\` - إدارة عصابتك بالأزرار التفاعلية
> • \`/سرقة\` - تنفيذ عملية سطو مسلح لجمع الأموال
> • \`/السجن\` - عرض قائمة المسجونين
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
