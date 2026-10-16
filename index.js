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
      return parsed;
    }
  } catch (err) {}
  return { users: {}, gangs: {}, bounties: {}, territories: {}, settings: {} };
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
  new SlashCommandBuilder().setName('حساب').setDescription('عرض بيانات حسابك ومستواك وترسانتك'),
  new SlashCommandBuilder().setName('يومي').setDescription('الحصول على المكافأة اليومية'),
  new SlashCommandBuilder().setName('صندوق_يومي').setDescription('فتح صندوق الهدايا والغنيمة اليومية العشوائية'),
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
  new SlashCommandBuilder().setName('المطلوبين').setDescription('عرض لائحة الأشخاص المطلوب اغتيالهم والمكافآت'),
  new SlashCommandBuilder().setName('عمل_شاق').setDescription('كسر الأحجار لتقليص مدة عقوبة السجن'),
  new SlashCommandBuilder().setName('تهريب').setDescription('تنفيذ عملية هجوم مسلح لتحرير أعضاء عصابتك من السجن'),
  // أوامر المهن التفاعلية
  new SlashCommandBuilder().setName('تجسس').setDescription('خاص للجاسوس: كشف رصيد ومعدات لاعب آخر').addUserOption(opt => opt.setName('الهدف').setDescription('الهدف').setRequired(true)),
  new SlashCommandBuilder().setName('اختراق').setDescription('خاص للهكر: محاولة سرقة إلكترونية من لاعب آخر').addUserOption(opt => opt.setName('الهدف').setDescription('الهدف').setRequired(true)),
  new SlashCommandBuilder().setName('إسعاف').setDescription('خاص للطبيب: تقليص سجن زميلك').addUserOption(opt => opt.setName('الهدف').setDescription('الهدف').setRequired(true)),
  new SlashCommandBuilder().setName('استثمار').setDescription('خاص للعراب: جني عوائد أرباح استثمارية سريعة'),
  // الألعاب والكازينو الجديدة
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
  new SlashCommandBuilder().setName('كفالة').setDescription('دفع كفالة الخروج من السجن (5000 عملة)'),
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
    console.log('✅ تم تسجيل كافة الأوامر والفعاليات والأزرار الشاملة بنجاح!');
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
  if (!u.inventory) u.inventory = { knife: 0, pistol: 0, smg: 0, armor: 0, car: 0 };
  if (!u.upgrades) u.upgrades = { silencer: false, thermal: false };
  if (u.boxLast === undefined) u.boxLast = 0;
  if (u.lastInvest === undefined) u.lastInvest = 0;
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

// === 6. معالجة التفاعلات والأزرار الشاملة ===
client.on(Events.InteractionCreate, async interaction => {
  const data = await readData();

  if (interaction.isButton()) {
    const userId = interaction.user.id;
    initUser(data, userId);
    const userData = data.users[userId];

    if (interaction.customId === 'main_btn_jobs') {
      const currentJobText = userData.job ? JOBS[userData.job].name : 'بدون مهنة ❌';
      const costText = userData.job ? '3,000 عملة (تغيير)' : '2,000 عملة (اختيار لأول مرة)';

      const embed = new EmbedBuilder()
        .setColor('#9b59b6')
        .setTitle('🎭 دليل المهن الإجرامية التخصصية والأوامر الخاصة')
        .setDescription(`مهنتك الحالية: **${currentJobText}**\nرسوم الاختيار/التغيير: **${costText}**\n\n📌 **شرح الخصائص والميزات:**`)
        .addFields(
          { name: '🏎️ السائق الخبير', value: `• ${JOBS.driver.desc}`, inline: false },
          { name: '💻 الهكر الإجرامي', value: `• ${JOBS.hacker.desc}\n*(أمر خاص: \`/اختراق\`)*`, inline: false },
          { name: '🪖 المسلح العنيف', value: `• ${JOBS.hitman.desc}`, inline: false },
          { name: '🏭 العراب / رجل الأعمال', value: `• ${JOBS.boss.desc}\n*(أمر خاص: \`/استثمار\`)*`, inline: false },
          { name: '🕵️ الجاسوس', value: `• ${JOBS.spy.desc}\n*(أمر خاص: \`/تجسس\`)*`, inline: false },
          { name: '🩺 طبيب السوق السوداء', value: `• ${JOBS.medic.desc}\n*(أمر خاص: \`/إسعاف\`)*`, inline: false },
          { name: '💣 خبير المتفجرات', value: `• ${JOBS.demo.desc}`, inline: false },
          { name: '⚖️ المحامي الفاسد', value: `• ${JOBS.lawyer.desc}`, inline: false }
        );

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('set_job_driver').setLabel('السائق').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('set_job_hacker').setLabel('الهكر').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('set_job_hitman').setLabel('المسلح').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('set_job_boss').setLabel('العراب').setStyle(ButtonStyle.Primary)
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('set_job_spy').setLabel('الجاسوس').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('set_job_medic').setLabel('الطبيب').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('set_job_demo').setLabel('خبير متفجرات').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('set_job_lawyer').setLabel('المحامي').setStyle(ButtonStyle.Secondary)
      );

      return interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });
    }

    if (interaction.customId.startsWith('set_job_')) {
      const selectedJobKey = interaction.customId.replace('set_job_', '');
      const cost = userData.job ? 3000 : 2000;

      if (userData.balance < cost) {
        return interaction.reply({ content: `❌ رصيدك النقدي لا يكفي! تحتاج إلى **${cost.toLocaleString()} عملة**.`, ephemeral: true });
      }

      if (userData.job === selectedJobKey) {
        return interaction.reply({ content: '❌ أنت تملك هذه المهنة بالفعل!', ephemeral: true });
      }

      userData.balance -= cost;
      userData.job = selectedJobKey;
      await saveData(data);

      return interaction.reply({ content: `🎉 **مبروك!** تعينت رسمياً بمهنة **${JOBS[selectedJobKey].name}**!\n📌 **شرح ميزتك:** ${JOBS[selectedJobKey].desc}\nتم خصم ${cost.toLocaleString()} عملة وتفعيل ميزاتك.`, ephemeral: true });
    }

    if (interaction.customId === 'main_btn_account') {
      let invText = '';
      for (const [k, v] of Object.entries(userData.inventory)) {
        if (v > 0) invText += `• ${WEAPONS[k].name}: **${v}**\n`;
      }
      if (!invText) invText = 'لا توجد أسلحة أو سيارات';
      const statusText = userData.kidnappedBy ? `⚠️ مخطوف من قبل <@${userData.kidnappedBy}>` : 'طليق وحر 🕊️';
      const jobText = userData.job ? JOBS[userData.job].name : 'بدون مهنة ❌';

      const embed = new EmbedBuilder()
        .setColor('#2ECC71')
        .setTitle(`📊 ملف المجرم: ${interaction.user.username}`)
        .addFields(
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

    if (interaction.customId === 'main_btn_gang') {
      if (!userData.gang || !data.gangs[userData.gang]) {
        return interaction.reply({ content: '❌ أنت لا تنتمي لأي عصابة! أنشئ عصابة بـ `/إنشاء_عصابة`', ephemeral: true });
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
      const embed = new EmbedBuilder().setColor('#e74c3c').setTitle('🏴‍☠️ السوق السوداء والترقيات').setDescription('استخدم الأوامر لشراء الأسلحة والتعديلات.');
      for (const [key, item] of Object.entries(WEAPONS)) {
        embed.addFields({ name: `${item.name} — ${item.price.toLocaleString()} عملة`, value: `${item.desc}\n*(الأمر: \`/شراء ${key}\`)*` });
      }
      for (const [key, item] of Object.entries(UPGRADES)) {
        embed.addFields({ name: `🛠️ ${item.name} — ${item.price.toLocaleString()} عملة`, value: `${item.desc}\n*(الأمر: \`/ترقية ${key}\`)*` });
      }
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

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
        .setTitle('🚔 قائمة المحتجزين في السجن المركزي')
        .setDescription(jailList || 'السجن خالي تماماً من المساجين حالياً! 🕊️\n\n*(يمكنك استخدام `/عمل_شاق` أو `/تهريب` أو `/كفالة`)*');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.customId === 'main_btn_kidnap_status') {
      let kidnapList = '';
      for (const [id, u] of Object.entries(data.users || {})) {
        if (u.kidnappedBy) {
          kidnapList += `• الضحية: <@${id}> ➔ الخاطف: <@${u.kidnappedBy}> (الفدية: **${u.ransomPrice.toLocaleString()}** عملة)\n`;
        }
      }
      const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('🗡️ قائمة المخطوفين وفدياتهم')
        .setDescription(kidnapList || 'لا يوجد أي شخص مخطوف حالياً!');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.customId === 'main_btn_territories') {
      let text = '';
      for (const [key, t] of Object.entries(data.territories || {})) {
        const ownerText = t.owner ? `تسيطر عليها: **${t.owner}**` : 'حرة / غير محتلة 🔓';
        text += `• **${t.name}** — ${ownerText} (الأرباح: ${t.tax.toLocaleString()} عملة)\n`;
      }
      const embed = new EmbedBuilder().setColor('#e67e22').setTitle('🗺️ خارطة نفوذ المناطق والسطو').setDescription(text + '\n*(استخدم `/احتلال` أو `/سطو_بنك`)*');
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.customId === 'main_btn_casino') {
      return interaction.reply({ content: '🎲 **كازينو العصابات والألعاب الفعالة!**\n• `/نرد [المبلغ]`\n• `/عملة [المبلغ] [ملك/كتابة]`\n• `/سلوت [المبلغ]`\n• `/روليت [المبلغ] [اللون]`\n• `/سباق [المبلغ]`', ephemeral: true });
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
        .setTitle('🏛️ المركز الرئيسي واللوحة التفاعلية الشاملة لعالم العصابات')
        .setDescription('استخدم الأزرار أدناه للتحكم بجميع الأنظمة، الألعاب، السجن، والمهن: 🔥');

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('main_btn_account').setLabel('💳 حسابي').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('main_btn_jobs').setLabel('🎭 المهن').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('main_btn_gang').setLabel('🏴‍☠️ عصابتي').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('main_btn_market').setLabel('🛒 السوق').setStyle(ButtonStyle.Success)
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('main_btn_jail').setLabel('🚔 السجن').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('main_btn_kidnap_status').setLabel('🗡️ الخطف').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('main_btn_territories').setLabel('🗺️ المناطق').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('main_btn_casino').setLabel('🎲 الكازينو').setStyle(ButtonStyle.Secondary)
      );

      return interaction.editReply({ embeds: [embed], components: [row1, row2] });
    }

    case 'انضمام': {
      await saveData(data);
      return interaction.editReply({ content: '✅ تم تفعيل حسابك وحفظ بياناتك سحابياً بنجاح!' });
    }

    // --- الصندوق اليومي (فكرة 3) ---
    case 'صندوق_يومي': {
      const now = Date.now();
      if (now - (userData.boxLast || 0) < 24 * 60 * 60 * 1000) {
        return interaction.editReply({ content: '❌ لقد فتحت صندوقك اليومي بالفعل! يمكنك فتحه مرة كل 24 ساعة.' });
      }

      userData.boxLast = now;
      const prizes = [
        { type: 'money', val: 3000, text: '3,000 عملة نقدية 💰' },
        { type: 'item', key: 'smg', text: 'رشاش قصير 🪖' },
        { type: 'item', key: 'armor', text: 'درع واقي 🛡️' },
        { type: 'item', key: 'car', text: 'سيارة هرب سريعة 🏎️' }
      ];
      const won = prizes[Math.floor(Math.random() * prizes.length)];

      if (won.type === 'money') {
        userData.balance += won.val;
      } else {
        userData.inventory[won.key] = (userData.inventory[won.key] || 0) + 1;
      }
      await saveData(data);

      return interaction.editReply(`🎁 **فتحت الصندوق اليومي بنجاح!**\nحصلت على جائزة مميزة: **${won.text}** 🎉`);
    }

    // --- ترقية الأسلحة (فكرة 4) ---
    case 'ترقية': {
      const upKey = options.getString('ترقية');
      const up = UPGRADES[upKey];
      if (!up) return interaction.editReply({ content: '❌ ترقية غير صالحة!' });
      if (userData.upgrades[upKey]) return interaction.editReply({ content: '❌ أنت تملك هذه الترقية بالفعل!' });
      if (userData.balance < up.price) return interaction.editReply({ content: `❌ رصيدك لا يكفي! تحتاج إلى ${up.price.toLocaleString()} عملة.` });

      userData.balance -= up.price;
      userData.upgrades[upKey] = true;
      await saveData(data);

      return interaction.editReply(`🛠️ **تمت الترقية بنجاح!** حصلت على **${up.name}** وتم تفعيل ميزتها التكتيكية. 🔥`);
    }

    // --- الهروب الكبير من السجن (فكرة 2) ---
    case 'تهريب': {
      const now = Date.now();
      if (!userData.gang || !data.gangs[userData.gang]) {
        return interaction.editReply({ content: '❌ يجب أن تنتمي لعصابة لتنفذ عملية تهريب مسلحة من السجن!' });
      }
      if ((userData.inventory.smg || 0) <= 0) {
        return interaction.editReply({ content: '❌ تحتاج إلى رشاش (`smg`) لتنفيذ عملية الهجوم على السجن!' });
      }

      let gangJailedMembers = [];
      for (const [id, u] of Object.entries(data.users || {})) {
        if (u.gang === userData.gang && (u.jailUntil || 0) > now) {
          gangJailedMembers.push(id);
        }
      }

      if (gangJailedMembers.length === 0) {
        return interaction.editReply({ content: '❌ لا يوجد أي عضو مسجون من عصابتك حالياً ليتم تهريبه!' });
      }

      if (Math.random() < 0.60) {
        gangJailedMembers.forEach(id => {
          data.users[id].jailUntil = 0;
        });
        await saveData(data);
        return interaction.editReply(`🥷💥 **عملية تهريب بطولية ناجحة!** هاجمت العصابة السجن برشاشات ثقيلة وحررت جميع الأعضاء المسجونين دفعة واحدة! 🔥`);
      } else {
        userData.jailUntil = now + (15 * 60 * 1000);
        await saveData(data);
        return interaction.editReply(`🚨 **فشلت عملية التهريب!** تصدت قوات الأمن للهجوم واعتقلتك وسجنتك لمدة **15 دقيقة**! 🚔`);
      }
    }

    // --- أوامر المهن التفاعلية ---
    case 'تجسس': {
      if (userData.job !== 'spy') return interaction.editReply({ content: '❌ هذا الأمر مخصص حصرياً لمهنة **🕵️ الجاسوس**!' });
      const targetUser = options.getUser('الهدف');
      initUser(data, targetUser.id);
      const targetData = data.users[targetUser.id];

      let targetInv = '';
      for (const [k, v] of Object.entries(targetData.inventory)) {
        if (v > 0) targetInv += `• ${WEAPONS[k].name}: ${v}\n`;
      }
      if (!targetInv) targetInv = 'لا يملك أسلحة';

      const embed = new EmbedBuilder()
        .setColor('#34495e')
        .setTitle(`🕵️ تقرير تجسس على: ${targetUser.username}`)
        .addFields(
          { name: '💰 الرصيد النقدي', value: `${targetData.balance.toLocaleString()} عملة`, inline: true },
          { name: '🏦 الرصيد المبيض', value: `${targetData.cleanBalance.toLocaleString()} عملة`, inline: true },
          { name: '⭐ المستوى', value: `${targetData.level}`, inline: true },
          { name: '🎒 الترسانة', value: targetInv, inline: false }
        );
      return interaction.editReply({ embeds: [embed] });
    }

    case 'اختراق': {
      if (userData.job !== 'hacker') return interaction.editReply({ content: '❌ هذا الأمر مخصص حصرياً لمهنة **💻 الهكر الإجرامي**!' });
      const targetUser = options.getUser('الهدف');
      if (targetUser.id === user.id) return interaction.editReply({ content: '❌ لا يمكنك اختراق نفسك!' });
      initUser(data, targetUser.id);
      const targetData = data.users[targetUser.id];

      if (targetData.balance < 500) return interaction.editReply({ content: '❌ رصيد الهدف فقير جداً لا يستحق الاختراق!' });

      const stolen = Math.floor(Math.random() * 800) + 200;
      const actualStolen = Math.min(targetData.balance, stolen);

      targetData.balance -= actualStolen;
      userData.balance += actualStolen;
      await saveData(data);

      return interaction.editReply(`💻 **اختراق ناجح!** استطاعت اختراق حساب <@${targetUser.id}> وسرقة **${actualStolen.toLocaleString()}** عملة لحسابك! ⚡`);
    }

    case 'إسعاف': {
      if (userData.job !== 'medic') return interaction.editReply({ content: '❌ هذا الأمر مخصص حصرياً لمهنة **🩺 طبيب السوق السوداء**!' });
      const targetUser = options.getUser('الهدف');
      initUser(data, targetUser.id);
      const targetData = data.users[targetUser.id];

      const now = Date.now();
      if ((targetData.jailUntil || 0) <= now) return interaction.editReply({ content: '❌ هذا الشخص ليس مسجوناً!' });

      targetData.jailUntil = now + Math.floor((targetData.jailUntil - now) / 2);
      await saveData(data);

      return interaction.editReply(`🩺 **قمت بإسعاف وتخفيض عقوبة <@${targetUser.id}> في السجن للنصف!**`);
    }

    case 'استثمار': {
      if (userData.job !== 'boss') return interaction.editReply({ content: '❌ هذا الأمر مخصص حصرياً لمهنة **🏭 العراب / رجل الأعمال**!' });
      const now = Date.now();
      if (now - (userData.lastInvest || 0) < 60 * 60 * 1000) {
        return interaction.editReply({ content: '❌ يمكنك جني أرباح الاستثمار مرة كل ساعة واحدة فقط!' });
      }

      const profit = Math.floor(Math.random() * 2000) + 1000;
      userData.balance += profit;
      userData.lastInvest = now;
      await saveData(data);

      return interaction.editReply(`🏭 **استثمار ناجح!** جنى العراب أرباحاً تجارية بقيمة **${profit.toLocaleString()}** عملة إلى رصيدك! 💰`);
    }

    // --- ألعاب الكازينو (روليت وسباق) ---
    case 'روليت': {
      const bet = options.getInteger('المبلغ');
      const colorChoice = options.getString('اللون');
      if (bet <= 0 || userData.balance < bet) return interaction.editReply({ content: '❌ رصيدك لا يكفي!' });

      const rand = Math.random();
      let resultColor = 'red';
      if (rand < 0.45) resultColor = 'red';
      else if (rand < 0.90) resultColor = 'black';
      else resultColor = 'green';

      userData.balance -= bet;
      let win = 0;
      if (colorControl === resultColor) {
        if (resultColor === 'green') win = bet * 14;
        else win = bet * 2;
        userData.balance += win;
        await saveData(data);
        return interaction.editReply(`🎲 **روليت الكازينو!**\nالكرة استقرت على اللون: **${resultColor === 'red' ? '🔴 أحمر' : resultColor === 'black' ? '⚫ أسود' : '🟢 أخضر'}**\n🎉 **فزت بجائزة قدرها ${win.toLocaleString()} عملة!**`);
      } else {
        await saveData(data);
        return interaction.editReply(`🎲 **روليت الكازينو!**\nالكرة استقرت على اللون: **${resultColor === 'red' ? '🔴 أحمر' : resultColor === 'black' ? '⚫ أسود' : '🟢 أخضر'}**\n❌ **خسرت رهانك البالغ ${bet.toLocaleString()} عملة.**`);
      }
    }

    case 'سباق': {
      const bet = options.getInteger('المبلغ');
      if (bet <= 0 || userData.balance < bet) return interaction.editReply({ content: '❌ رصيدك لا يكفي!' });

      let winChance = 0.45;
      if (userData.inventory.car > 0) winChance += 0.25;
      if (userData.job === 'driver') winChance += 0.20;

      userData.balance -= bet;
      if (Math.random() < winChance) {
        const prize = bet * 2;
        userData.balance += prize;
        await saveData(data);
        return interaction.editReply(`🏎️ **سباق الشوارع الحماسي!**\nقمت بتجاوز المنافسين ببراعة وسياراتك السريعة!\n🏆 **فزت بالسباق وكسبت ${prize.toLocaleString()} عملة!**`);
      } else {
        await saveData(data);
        return interaction.editReply(`🏎️ **سباق الشوارع!**\nتعرضت لحادث مروري وتجاوزك المتسابقون!\n❌ **خسرت مبلغ الرهان (${bet.toLocaleString()} عملة).**`);
      }
    }

    // --- سطو البنك ---
    case 'سطو_بنك': {
      const now = Date.now();
      if ((userData.jailUntil || 0) > now) return interaction.editReply({ content: '❌ أنت مسجون ولا يمكنك المشاركة في سطو البنك!' });

      let chance = 0.40;
      if (userData.inventory.smg > 0) chance += 0.20;
      if (userData.inventory.car > 0) chance += 0.15;
      if (userData.job === 'demo') chance += 0.20;
      if (userData.upgrades.thermal) chance += 0.15;

      if (Math.random() < chance) {
        const loot = Math.floor(Math.random() * 5000) + 3000;
        userData.balance += loot;
        await saveData(data);
        return interaction.editReply(`🏦💥 **نجح اقتحام البنك المركزي بسلام!**\nاستطعت سرقة غنائم ضخمة بقيمة **${loot.toLocaleString()}** عملة وتوزيعه لحسابك! 🔥`);
      } else {
        userData.jailUntil = now + (10 * 60 * 1000);
        userData.balance = Math.max(0, userData.balance - 1000);
        await saveData(data);
        return interaction.editReply(`🚨 **فشل سطو البنك!** حاصر الأمن المكان، وتم تغريمك 1,000 عملة وسجنك لمدة **10 دقائق**! 🚔`);
      }
    }

    case 'عقد': {
      const targetUser = options.getUser('الهدف');
      const reward = options.getInteger('المكافأة');

      if (targetUser.id === user.id) return interaction.editReply({ content: '❌ لا يمكنك رصد مكافأة على رأس نفسك!' });
      if (reward < 5000) return interaction.editReply({ content: '❌ الحد الأدنى لرصد عقد اغتيال هو **5,000 عملة**!' });
      if (userData.balance < reward) return interaction.editReply({ content: '❌ رصيدك لا يكفي لرصد هذه المكافأة!' });

      userData.balance -= reward;
      data.bounties[targetUser.id] = (data.bounties[targetUser.id] || 0) + reward;

      await saveData(data);
      return interaction.editReply(`🎯 **تم رصد عقد اغتيال بنجاح!**\nتم رصد مبلغ **${reward.toLocaleString()}** عملة على رأس <@${targetUser.id}>! أصبح مجموع المكافأة: **${data.bounties[targetUser.id].toLocaleString()} عملة** 🔥`);
    }

    case 'المطلوبين': {
      let bountyText = '';
      for (const [targetId, amount] of Object.entries(data.bounties || {})) {
        if (amount > 0) {
          bountyText += `• المطلوب: <@${targetId}> ➔ المكافأة المرصودة: **${amount.toLocaleString()}** عملة 🔥\n`;
        }
      }
      const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('🎯 قائمة المطلوب اغتيالهم (Bounty Board)')
        .setDescription(bountyText || 'لا يوجد أي عقود اغتيال مرصودة حالياً!');
      return interaction.editReply({ embeds: [embed] });
    }

    case 'عمل_شاق': {
      const now = Date.now();
      if ((userData.jailUntil || 0) <= now) return interaction.editReply({ content: '❌ أنت لست مسجوناً لتنفذ العمل الشاق!' });

      userData.jailUntil = Math.max(now, userData.jailUntil - (120 * 1000));
      const earned = Math.floor(Math.random() * 50) + 10;
      userData.balance += earned;

      await saveData(data);
      const remSec = Math.ceil((userData.jailUntil - now) / 1000);
      return interaction.editReply(`⛏️ **قمت بكسر الأحجار في السجن!**\nتم تقليص مدة عقوبتك بـ **120 ثانية** وكسبت **${earned}** عملة. المتبقي: **${remSec} ثانية**.`);
    }

    case 'اغتيال': {
      const targetUser = options.getUser('الهدف');
      if (targetUser.id === user.id) return interaction.editReply({ content: '❌ لا يمكنك اغتيال نفسك!' });

      if ((userData.inventory.smg || 0) <= 0) {
        return interaction.editReply({ content: '❌ تحتاج إلى سلاح رشاش (`smg`) لتنفيذ اغتيال!' });
      }

      initUser(data, targetUser.id);
      const targetData = data.users[targetUser.id];

      let lootRate = userData.job === 'hitman' ? 0.35 : 0.25;
      if (userData.upgrades.thermal) lootRate += 0.10;
      const loot = Math.floor(targetData.balance * lootRate);

      targetData.balance -= loot;
      userData.balance += loot;
      targetData.jailUntil = Date.now() + (15 * 60 * 1000);

      let bountyBonus = 0;
      if (data.bounties[targetUser.id] && data.bounties[targetUser.id] > 0) {
        bountyBonus = data.bounties[targetUser.id];
        userData.balance += bountyBonus;
        delete data.bounties[targetUser.id];
      }

      await saveData(data);

      let msg = `🎯 **عملية اغتيال ناجحة!** أصبت <@${targetUser.id}> وسلبت **${loot.toLocaleString()}** عملة منه! 💥`;
      if (bountyBonus > 0) {
        msg += `\n🎉 **وحصلت أيضاً على قيمة عقد الاغتيال المرصود:** **${bountyBonus.toLocaleString()}** عملة إضافية! 💰`;
      }
      return interaction.editReply(msg);
    }

    case 'تحويل': {
      const targetUser = options.getUser('المستلم');
      const amount = options.getInteger('المبلغ');

      if (targetUser.id === user.id) return interaction.editReply({ content: '❌ لا يمكنك تحويل المال لنفسك!' });
      if (amount <= 0 || userData.balance < amount) return interaction.editReply({ content: '❌ رصيدك النقدي لا يكفي لهذا التحويل!' });

      initUser(data, targetUser.id);
      userData.balance -= amount;
      data.users[targetUser.id].balance += amount;

      await saveData(data);
      return interaction.editReply(`💸 **تم التحويل بنجاح!** حولت **${amount.toLocaleString()}** عملة إلى <@${targetUser.id}>.`);
    }

    case 'غسيل_أموال': {
      const amount = options.getInteger('المبلغ');
      if (amount <= 0 || userData.balance < amount) return interaction.editReply({ content: '❌ رصيدك النقدي لا يكفي!' });

      const feeRate = userData.job === 'hacker' ? 0.05 : 0.15;
      const fee = Math.floor(amount * feeRate);
      const cleanAmount = amount - fee;

      userData.balance -= amount;
      userData.cleanBalance += cleanAmount;
      await saveData(data);

      const hackerBonusText = userData.job === 'hacker' ? ' 💻 *(خصم مهنة الهكر: رسوم 5% فقط!)*' : '';
      return interaction.editReply(`🧼 **تم غسيل الأموال بنجاح!**\nتحويل **${cleanAmount.toLocaleString()}** عملة للبنك (خصم رسوم: ${fee.toLocaleString()} عملة)${hackerBonusText}.`);
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
      if (userData.job === 'driver') kidnapChance += 0.20;
      if (userData.upgrades.silencer) kidnapChance += 0.10;

      if (Math.random() < kidnapChance) {
        targetData.kidnappedBy = user.id;
        targetData.ransomPrice = ransom;
        await saveData(data);
        return interaction.editReply(`🗡️ **عملية خطف ناجحة!** احتجزت <@${targetUser.id}> باشتراط فدية **${ransom.toLocaleString()}** عملة! 🔥`);
      } else {
        return interaction.editReply(`💥 **فشلت عملية الخطف!** تمكن <@${targetUser.id}> من الفرار!`);
      }
    }

    case 'كفالة': {
      const now = Date.now();
      if ((userData.jailUntil || 0) <= now) return interaction.editReply({ content: '❌ أنت لست مسجوناً!' });

      const bailCost = userData.job === 'lawyer' ? 2500 : 5000;
      if (userData.balance < bailCost) return interaction.editReply({ content: `❌ رصيدك لا يكفي للكفالة (${bailCost.toLocaleString()} عملة)!` });

      userData.balance -= bailCost;
      userData.jailUntil = 0;
      await saveData(data);
      return interaction.editReply(`🔓 **خرجت من السجن بنجاح!** (الكفالة المدفوعة: ${bailCost.toLocaleString()} عملة).`);
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
      if (userData.job === 'hitman') captureChance += 0.20;
      if (userData.upgrades.thermal) captureChance += 0.15;

      if (Math.random() < captureChance) {
        territory.owner = userData.gang;
        data.gangs[userData.gang].bank = (data.gangs[userData.gang].bank || 0) + territory.tax;
        await saveData(data);
        return interaction.editReply(`⚔️ **اقتحام وسيطرة ناجحة!** سيطرت عصابة **[ ${userData.gang} ]** على **${territory.name}** وجنت **${territory.tax.toLocaleString()}** عملة لخزينتها! 🔥`);
      } else {
        return interaction.editReply(`💥 **فشلت عملية السيطرة على ${territory.name}!** تصدت الحراسات للهجوم!`);
      }
    }

    case 'المخطوفين': {
      let kidnapList = '';
      for (const [id, u] of Object.entries(data.users || {})) {
        if (u.kidnappedBy) {
          kidnapList += `• الضحية: <@${id}> ➔ الخاطف: <@${u.kidnappedBy}> (الفدية: **${u.ransomPrice.toLocaleString()}** عملة)\n`;
        }
      }
      const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('🗡️ قائمة المخطوفين وفدياتهم')
        .setDescription(kidnapList || 'لا يوجد أي شخص مخطوف حالياً في المدينة!');
      return interaction.editReply({ embeds: [embed] });
    }

    case 'السجن': {
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
        .setTitle('🚔 قائمة المحتجزين في السجن المركزي')
        .setDescription(jailList || 'السجن خالي تماماً من المساجين حالياً! 🕊️');
      return interaction.editReply({ embeds: [embed] });
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
      return interaction.editReply(`🎉 **تم تأسيس عصابة [ ${gangName} ] بنجاح!** أصبحت أنت الزعيم الرسمي 👑.`);
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

    case 'حساب': {
      let invText = '';
      for (const [k, v] of Object.entries(userData.inventory)) {
        if (v > 0) invText += `• ${WEAPONS[k].name}: **${v}**\n`;
      }
      if (!invText) invText = 'لا توجد أسلحة أو سيارات';
      const jobText = userData.job ? JOBS[userData.job].name : 'بدون مهنة ❌';

      const embed = new EmbedBuilder()
        .setColor('#2ECC71')
        .setTitle(`📊 ملف المجرم: ${user.username}`)
        .addFields(
          { name: '💰 الرصيد النقدي', value: `${userData.balance.toLocaleString()} عملة`, inline: true },
          { name: '🏦 الرصيد المبيض', value: `${userData.cleanBalance.toLocaleString()} عملة`, inline: true },
          { name: '⭐ المستوى', value: `مستوى **${userData.level}** (${userData.xp} XP)`, inline: true },
          { name: '🎭 المهنة الإجرامية', value: jobText, inline: true },
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
      if (userData.upgrades.silencer) baseChance += 0.10;

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
          const jailMinutes = userData.job === 'lawyer' ? 5 : 10;
          userData.jailUntil = now + (jailMinutes * 60 * 1000);

          let fineRate = userData.job === 'medic' ? 0.5 : 1.0;
          const fine = Math.floor(Math.min(userData.balance, 300) * fineRate);

          userData.balance -= fine;
          await saveData(data);
          return interaction.editReply(`🚨 **قبضت عليك الشرطة!** تم تغريمك **${fine.toLocaleString()}** عملة وسجنك **${jailMinutes} دقائق**! 🚔`);
        }
      }
    }

    case 'سوق_سوداء': {
      const embed = new EmbedBuilder().setColor('#e74c3c').setTitle('🏴‍☠️ السوق السوداء والترقيات').setDescription('استخدم الأوامر لشراء الأسلحة والتعديلات.');
      for (const [key, item] of Object.entries(WEAPONS)) {
        embed.addFields({ name: `${item.name} — ${item.price.toLocaleString()} عملة`, value: `${item.desc}\n*(الأمر: \`/شراء ${key}\`)*` });
      }
      for (const [key, item] of Object.entries(UPGRADES)) {
        embed.addFields({ name: `🛠️ ${item.name} — ${item.price.toLocaleString()} عملة`, value: `${item.desc}\n*(الأمر: \`/ترقية ${key}\`)*` });
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
