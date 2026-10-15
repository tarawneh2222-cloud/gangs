
require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require("discord.js");

const { Pool } = require("pg");

if (!process.env.DISCORD_TOKEN) {
  throw new Error("أضف DISCORD_TOKEN إلى ملف .env");
}

if (!process.env.DATABASE_URL) {
  throw new Error("أضف DATABASE_URL إلى ملف .env");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === "false"
    ? false
    : { rejectUnauthorized: false }
});

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const STARTING_CASH = 1000;
const COOLDOWN_MS = 60_000;

// إنشاء جداول قاعدة البيانات
async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS players (
      user_id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      cash BIGINT NOT NULL DEFAULT 1000
        CHECK (cash >= 0),
      xp INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 1,
      wanted INTEGER NOT NULL DEFAULT 0,
      jail_until TIMESTAMPTZ,
      last_action TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS gangs (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      name TEXT NOT NULL,
      name_key TEXT NOT NULL,
      leader_id TEXT NOT NULL,
      bank BIGINT NOT NULL DEFAULT 0,
      reputation INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(guild_id, name_key)
    );

    CREATE TABLE IF NOT EXISTS gang_members (
      gang_id BIGINT REFERENCES gangs(id)
        ON DELETE CASCADE,
      user_id TEXT UNIQUE NOT NULL
        REFERENCES players(user_id)
        ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY(gang_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS game_logs (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      result TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  console.log("تم تجهيز قاعدة البيانات.");
}

// جلب شخصية اللاعب
async function getPlayer(user) {
  const result = await pool.query(
    `INSERT INTO players(user_id, username)
     VALUES($1, $2)
     ON CONFLICT(user_id)
     DO UPDATE SET username = EXCLUDED.username
     RETURNING *`,
    [user.id, user.username]
  );

  return result.rows[0];
}

// إنشاء شخصية
async function startPlayer(interaction) {
  const result = await pool.query(
    `INSERT INTO players(user_id, username)
     VALUES($1, $2)
     ON CONFLICT(user_id) DO NOTHING`,
    [interaction.user.id, interaction.user.username]
  );

  const player = await getPlayer(interaction.user);

  await interaction.reply({
    content:
      `🌒 أهلاً بك في NEBULA GANGS\n\n` +
      `💰 رصيدك: ${Number(player.cash).toLocaleString()} CR\n` +
      `⭐ مستواك: ${player.level}\n\n` +
      `استخدم /panel لبدء اللعب.`,
    flags: MessageFlags.Ephemeral
  });
}

// الملف الشخصي
async function showProfile(interaction) {
  const p = await pool.query(
    "SELECT * FROM players WHERE user_id = $1",
    [interaction.user.id]
  );

  if (!p.rowCount) {
    return interaction.reply({
      content: "أنشئ شخصيتك أولاً باستخدام /start",
      flags: MessageFlags.Ephemeral
    });
  }

  const player = p.rows[0];

  const jailed = player.jail_until &&
    new Date(player.jail_until).getTime() > Date.now();

  const embed = new EmbedBuilder()
    .setColor(0x71368a)
    .setTitle(`ملف ${interaction.user.username}`)
    .addFields(
      {
        name: "💰 الرصيد",
        value: `${Number(player.cash).toLocaleString()} CR`,
        inline: true
      },
      {
        name: "⭐ المستوى",
        value: String(player.level),
        inline: true
      },
      {
        name: "✨ الخبرة",
        value: String(player.xp),
        inline: true
      },
      {
        name: "🚔 المطلوبية",
        value: `${player.wanted}/100`,
        inline: true
      },
      {
        name: "📍 الحالة",
        value: jailed ? "في السجن الافتراضي" : "حر",
        inline: true
      }
    );

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral
  });
}

// إنشاء عصابة
async function createGang(interaction) {
  const name = interaction.options
    .getString("name", true)
    .trim();

  if (name.length < 3 || name.length > 24) {
    throw new Error("اسم العصابة يجب أن يكون من 3 إلى 24 حرفاً.");
  }

  const clientDb = await pool.connect();

  try {
    await clientDb.query("BEGIN");

    await clientDb.query(
      `INSERT INTO players(user_id, username)
       VALUES($1, $2) ON CONFLICT(user_id) DO NOTHING`,
      [interaction.user.id, interaction.user.username]
    );

    const member = await clientDb.query(
      "SELECT 1 FROM gang_members WHERE user_id = $1",
      [interaction.user.id]
    );

    if (member.rowCount) {
      throw new Error("أنت عضو في عصابة بالفعل.");
    }

    const gang = await clientDb.query(
      `INSERT INTO gangs(guild_id, name, name_key, leader_id)
       VALUES($1, $2, $3, $4)
       RETURNING id`,
      [
        interaction.guildId,
        name,
        name.toLocaleLowerCase(),
        interaction.user.id
      ]
    );

    await clientDb.query(
      `INSERT INTO gang_members(gang_id, user_id, role)
       VALUES($1, $2, 'leader')`,
      [gang.rows[0].id, interaction.user.id]
    );

    await clientDb.query("COMMIT");

    await interaction.reply({
      content: `🏴 تم تأسيس عصابة **${name}**!\nأنت الزعيم.`,
      flags: MessageFlags.Ephemeral
    });
  } catch (error) {
    await clientDb.query("ROLLBACK");

    if (error.code === "23505") {
      throw new Error(
        "اسم العصابة مستخدم، أو أنك عضو في عصابة أخرى."
      );
    }

    throw error;
  } finally {
    clientDb.release();
  }
}

// الانضمام إلى عصابة
async function joinGang(interaction) {
  const name = interaction.options
    .getString("name", true)
    .trim();

  const clientDb = await pool.connect();

  try {
    await clientDb.query("BEGIN");

    await clientDb.query(
      `INSERT INTO players(user_id, username)
       VALUES($1, $2) ON CONFLICT(user_id) DO NOTHING`,
      [interaction.user.id, interaction.user.username]
    );

    const member = await clientDb.query(
      "SELECT 1 FROM gang_members WHERE user_id = $1",
      [interaction.user.id]
    );

    if (member.rowCount) {
      throw new Error("أنت عضو في عصابة بالفعل.");
    }

    const gang = await clientDb.query(
      `SELECT id FROM gangs
       WHERE guild_id = $1 AND name_key = $2`,
      [interaction.guildId, name.toLocaleLowerCase()]
    );

    if (!gang.rowCount) {
      throw new Error("لم أجد عصابة بهذا الاسم.");
    }

    await clientDb.query(
      `INSERT INTO gang_members(gang_id, user_id)
       VALUES($1, $2)`,
      [gang.rows[0].id, interaction.user.id]
    );

    await clientDb.query("COMMIT");

    await interaction.reply({
      content: `🤝 انضممت إلى عصابة **${name}**!`,
      flags: MessageFlags.Ephemeral
    });
  } catch (error) {
    await clientDb.query("ROLLBACK");
    throw error;
  } finally {
    clientDb.release();
  }
}

// معلومات العصابة
async function gangInfo(interaction) {
  const result = await pool.query(
    `SELECT g.*, gm.role,
      (SELECT COUNT(*) FROM gang_members m
       WHERE m.gang_id = g.id) AS members
     FROM gang_members gm
     JOIN gangs g ON g.id = gm.gang_id
     WHERE gm.user_id = $1 AND g.guild_id = $2`,
    [interaction.user.id, interaction.guildId]
  );

  if (!result.rowCount) {
    return interaction.reply({
      content: "أنت لست عضواً في عصابة.",
      flags: MessageFlags.Ephemeral
    });
  }

  const g = result.rows[0];

  const embed = new EmbedBuilder()
    .setColor(0x8e44ad)
    .setTitle(`🏴 ${g.name}`)
    .addFields(
      {
        name: "👥 الأعضاء",
        value: String(g.members),
        inline: true
      },
      {
        name: "🏦 الخزينة",
        value: `${Number(g.bank).toLocaleString()} CR`,
        inline: true
      },
      {
        name: "⭐ السمعة",
        value: String(g.reputation),
        inline: true
      },
      {
        name: "🎖️ رتبتك",
        value: g.role,
        inline: true
      }
    );

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral
  });
}

// لوحة العمليات
function createPanel() {
  const embed = new EmbedBuilder()
    .setColor(0x6c3483)
    .setTitle("🌒 NEBULA GANGS")
    .setDescription(
      "اختر عملية لشخصيتك الافتراضية.\n" +
      "كل الأموال والنتائج خيالية داخل اللعبة."
    )
    .addFields(
      {
        name: "💰 السرقة",
        value: "مهمة افتراضية ذات مكافأة ومخاطرة.",
        inline: true
      },
      {
        name: "🗣️ التهديد",
        value: "مهمة تمثيلية لرفع السمعة.",
        inline: true
      },
      {
        name: "🔒 الاختطاف",
        value: "سيناريو خيالي بنتيجة آلية.",
        inline: true
      },
      {
        name: "🎭 الاغتيال",
        value: "مهمة خيالية عالية المخاطر.",
        inline: true
      },
      {
        name: "🚔 الشرطة",
        value: "عرض مستوى المطلوبية.",
        inline: true
      },
      {
        name: "📊 ملفي",
        value: "عرض الرصيد والخبرة.",
        inline: true
      }
    )
    .setFooter({
      text: "العب بذكاء — كل قرار له عواقب افتراضية"
    });

  const row1 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId("crime:rob")
        .setLabel("سرقة")
        .setEmoji("💰")
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId("crime:threat")
        .setLabel("تهديد")
        .setEmoji("🗣️")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("crime:kidnap")
        .setLabel("اختطاف خيالي")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Secondary)
    );

  const row2 = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId("crime:assassination")
        .setLabel("اغتيال خيالي")
        .setEmoji("🎭")
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId("player:police")
        .setLabel("الشرطة")
        .setEmoji("🚔")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("player:profile")
        .setLabel("ملفي")
        .setEmoji("📊")
        .setStyle(ButtonStyle.Primary)
    );

  return { embeds: [embed], components: [row1, row2] };
}

// عمليات لعب خيالية للشخصية نفسها
async function runCrime(interaction, action) {
  const settings = {
    rob: {
      label: "السرقة الافتراضية",
      cost: 100,
      reward: 500,
      chance: 0.60,
      wanted: 15
    },
    threat: {
      label: "التهديد التمثيلي",
      cost: 50,
      reward: 180,
      chance: 0.70,
      wanted: 8
    },
    kidnap: {
      label: "الاختطاف الخيالي",
      cost: 150,
      reward: 450,
      chance: 0.48,
      wanted: 22
    },
    assassination: {
      label: "الاغتيال الخيالي",
      cost: 200,
      reward: 650,
      chance: 0.40,
      wanted: 28
    }
  };

  const config = settings[action];

  if (!config) {
    throw new Error("عملية غير معروفة.");
  }

  const clientDb = await pool.connect();

  try {
    await clientDb.query("BEGIN");

    const result = await clientDb.query(
      "SELECT * FROM players WHERE user_id=$1 FOR UPDATE",
      [interaction.user.id]
    );

    if (!result.rowCount) {
      throw new Error("استخدم /start أولاً.");
    }

    const p = result.rows[0];

    if (
      p.jail_until &&
      new Date(p.jail_until).getTime() > Date.now()
    ) {
      throw new Error(
        "شخصيتك في السجن الافتراضي. استخدم /bail إذا استطعت."
      );
    }

    if (
      p.last_action &&
      Date.now() - new Date(p.last_action).getTime()
        < COOLDOWN_MS
    ) {
      throw new Error(
        "انتظر دقيقة قبل تنفيذ عملية أخرى."
      );
    }

    const cash = Number(p.cash);

    if (cash < config.cost) {
      throw new Error(
        `تحتاج ${config.cost} CR لبدء العملية.`
      );
    }

    const success = Math.random() < config.chance;
    const newCash = success
      ? cash - config.cost + config.reward
      : cash - config.cost;

    const newWanted = Math.min(
      100,
      Number(p.wanted) + config.wanted
    );

    const xpGain = success ? 25 : 8;
    const newXp = Number(p.xp) + xpGain;
    const newLevel = Math.floor(newXp / 100) + 1;

    await clientDb.query(
      `UPDATE players
       SET cash=$2, wanted=$3, xp=$4, level=$5,
           last_action=NOW()
       WHERE user_id=$1`,
      [
        interaction.user.id,
        newCash,
        newWanted,
        newXp,
        newLevel
      ]
    );

    const message = success
      ? `✅ نجحت ${config.label}!\nربحت ${config.reward} CR افتراضية بعد احتساب رسوم العملية.`
      : `❌ فشلت ${config.label}.\nخسرت رسوم العملية البالغة ${config.cost} CR.`;

    await clientDb.query(
      `INSERT INTO game_logs(guild_id,user_id,action,result)
       VALUES($1,$2,$3,$4)`,
      [
        interaction.guildId,
        interaction.user.id,
        action,
        message
      ]
    );

    await clientDb.query("COMMIT");

    const embed = new EmbedBuilder()
      .setColor(success ? 0x27ae60 : 0xc0392b)
      .setTitle(success ? "نجاح العملية" : "فشل العملية")
      .setDescription(message)
      .addFields(
        {
          name: "💰 الرصيد",
          value: `${newCash.toLocaleString()} CR`,
          inline: true
        },
        {
          name: "🚔 المطلوبية",
          value: `${newWanted}/100`,
          inline: true
        },
        {
          name: "⭐ المستوى",
          value: String(newLevel),
          inline: true
        }
      )
      .setFooter({
        text: "محاكاة خيالية داخل Discord"
      });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await clientDb.query("ROLLBACK");
    throw error;
  } finally {
    clientDb.release();
  }
}

// دفع الكفالة الافتراضية
async function bail(interaction) {
  const clientDb = await pool.connect();

  try {
    await clientDb.query("BEGIN");

    const result = await clientDb.query(
      "SELECT * FROM players WHERE user_id=$1 FOR UPDATE",
      [interaction.user.id]
    );

    if (!result.rowCount) {
      throw new Error("استخدم /start أولاً.");
    }

    const p = result.rows[0];

    if (
      !p.jail_until ||
      new Date(p.jail_until).getTime() <= Date.now()
    ) {
      throw new Error("شخصيتك ليست في السجن حالياً.");
    }

    const amount = Math.max(250, Number(p.wanted) * 20);

    if (Number(p.cash) < amount) {
      throw new Error(`تحتاج ${amount} CR لدفع الكفالة.`);
    }

    await clientDb.query(
      `UPDATE players
       SET cash=cash-$2, jail_until=NULL,
           wanted=GREATEST(0,wanted-10)
       WHERE user_id=$1`,
      [interaction.user.id, amount]
    );

    await clientDb.query("COMMIT");

    await interaction.reply({
      content: `🚪 دفعت كفالة افتراضية قدرها ${amount} CR.`,
      flags: MessageFlags.Ephemeral
    });
  } catch (error) {
    await clientDb.query("ROLLBACK");
    throw error;
  } finally {
    clientDb.release();
  }
}

// معالجة أوامر Discord
client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (!interaction.guildId) {
        return interaction.reply({
          content: "استخدم البوت داخل سيرفر Discord.",
          flags: MessageFlags.Ephemeral
        });
      }

      switch (interaction.commandName) {
        case "start":
          return await startPlayer(interaction);

        case "profile":
          return await showProfile(interaction);

        case "panel":
          return await interaction.reply(createPanel());

        case "bail":
          return await bail(interaction);

        case "gang": {
          const sub = interaction.options.getSubcommand();

          if (sub === "create") {
            return await createGang(interaction);
          }

          if (sub === "join") {
            return await joinGang(interaction);
          }

          if (sub === "info") {
            return await gangInfo(interaction);
          }
          break;
        }
      }
    }

    if (interaction.isButton()) {
      if (!interaction.guildId) return;

      if (interaction.customId === "player:profile") {
        return await showProfile(interaction);
      }

      if (interaction.customId === "player:police") {
        const result = await pool.query(
          "SELECT * FROM players WHERE user_id=$1",
          [interaction.user.id]
        );

        if (!result.rowCount) {
          return interaction.reply({
            content: "استخدم /start أولاً.",
            flags: MessageFlags.Ephemeral
          });
        }

        const p = result.rows[0];
        const jailed = p.jail_until &&
          new Date(p.jail_until).getTime() > Date.now();

        return interaction.reply({
          content:
            `🚔 **ملف الشرطة الافتراضي**\n` +
            `المطلوبية: ${p.wanted}/100\n` +
            `الحالة: ${jailed ? "في السجن" : "حر"}\n` +
            `${jailed ? "استخدم /bail." : "يمكنك مواصلة اللعب."}`,
          flags: MessageFlags.Ephemeral
        });
      }

      if (interaction.customId.startsWith("crime:")) {
        const action = interaction.customId.split(":")[1];

        await interaction.deferReply({
          flags: MessageFlags.Ephemeral
        });

        return await runCrime(interaction, action);
      }
    }
  } catch (error) {
    console.error(error);

    const message = error instanceof Error
      ? error.message
      : "حدث خطأ غير متوقع.";

    if (interaction.isRepliable()) {
      const payload = {
        content: `⚠️ ${message}`,
        flags: MessageFlags.Ephemeral
      };

      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  }
});

client.once(Events.ClientReady, ready => {
  console.log(`NEBULA GANGS يعمل باسم ${ready.user.tag}`);
});

async function main() {
  await initDatabase();
  await client.login(process.env.DISCORD_TOKEN);
}

main().catch(error => {
  console.error("تعذر تشغيل البوت:", error);
  process.exit(1);
});

process.on("SIGTERM", async () => {
  client.destroy();
  await pool.end();
  process.exit(0);
});
