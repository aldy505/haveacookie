import pino from "pino";
import { formatInTimeZone } from "date-fns-tz";
import { ChannelType, Client, Events, GatewayIntentBits, Partials, type Message } from "discord.js";
import { config } from "./config";
import { mentionsFirstUserId } from "./helper";
import { CUserCookie, getBalance, queryLeaderboards } from "./model";
import {
  buildCookieCooldownEmbed,
  buildInsufficientCookieEmbed,
  buildInvalidItemEmbed,
  buildLeaderboardEmbed,
  buildPurchaseAlertEmbed,
  buildPurchaseEmbed,
  buildShopEmbed,
} from "./embeds";

const logger = pino({
  transport: {
    target: "pino-pretty",
  },
});

const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

const resetTz = "America/New_York";

bot.on(Events.ClientReady, () => {
  logger.info("Bot Online");
});

bot.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  if (interaction.commandName === "leaderboard") {
    const boardData = await queryLeaderboards(interaction.user.id);
    const embed = buildLeaderboardEmbed(interaction.user, config.emoji, boardData);

    await interaction.reply({ embeds: [embed] });
  }
});

bot.on(Events.MessageCreate, async (msg: Message) => {
  if (msg.author.bot) {
    return;
  }

  if (bot.user && mentionsFirstUserId(msg, bot.user.id)) {
    const boardData = await queryLeaderboards(msg.author.id);
    const embed = buildLeaderboardEmbed(msg.author, config.emoji, boardData);

    await msg.reply({ embeds: [embed] });
    return;
  }

  if (
    msg.mentions.users.first() &&
    msg.mentions.users.first()!.id !== msg.author.id &&
    msg.content.includes(config.emoji)
  ) {
    const todayOnTz = formatInTimeZone(new Date(), resetTz, "yyyy-MM-dd");

    const data = await CUserCookie.findAll({
      where: {
        given_by: msg.author.id,
        given_date: todayOnTz,
      },
    });

    if (data.length >= config.maxPerDay) {
      const embed = buildCookieCooldownEmbed(msg.author, config.emoji, config.maxPerDay);

      await msg.reply({ embeds: [embed] });
      return;
    }

    if (data.length + msg.mentions.users.size > config.maxPerDay) {
      const embed = buildCookieCooldownEmbed(
        msg.author,
        config.emoji,
        config.maxPerDay,
        msg.mentions.users.size,
      );

      await msg.reply({ embeds: [embed] });
      return;
    }

    await CUserCookie.bulkCreate(
      msg.mentions.users.map((user) => ({
        given_by: msg.author.id,
        given_date: todayOnTz,
        given_to: user.id,
        is_given: true,
        is_transaction: false,
      })),
    );

    await msg.react(config.emoji);
    return;
  }

  if (!msg.content.startsWith(config.prefix)) {
    return;
  }

  const splitContent = msg.content.split(" ");
  const cmd = splitContent[0].substring(config.prefix.length).toLowerCase();
  const args = splitContent.slice(1);

  if (cmd !== "prizes") {
    return;
  }

  if (args.length === 0) {
    await msg.reply({ embeds: [buildShopEmbed(config.prefix, config.emoji, config.prizes)] });
    return;
  }

  const chosenIdx = Number.parseInt(args[0], 10);

  if (Number.isNaN(chosenIdx)) {
    return;
  }

  if (chosenIdx < 1 || chosenIdx > config.prizes.length) {
    await msg.reply({ embeds: [buildInvalidItemEmbed(msg.author)] });
    return;
  }

  const chosenItem = config.prizes[chosenIdx - 1];
  const currentBalance = await getBalance(msg.author.id);

  if (chosenItem.price > currentBalance) {
    await msg.reply({ embeds: [buildInsufficientCookieEmbed(msg.author, config.emoji)] });
    return;
  }

  await CUserCookie.create({
    given_by: null,
    given_date: null,
    given_to: msg.author.id,
    value: chosenItem.price * -1,
    is_given: false,
    is_transaction: true,
    item_name: chosenItem.name,
  });

  await msg.reply({ embeds: [buildPurchaseEmbed(msg.author, chosenItem, config.emoji)] });

  if (!msg.guildId) {
    logger.warn("Skipping purchase alert because command was not sent from a guild channel");
    return;
  }

  const guild = bot.guilds.cache.get(msg.guildId);
  if (!guild) {
    logger.warn({ guildId: msg.guildId }, "Guild missing from cache while sending purchase alert");
    return;
  }

  const alertChannel = await guild.channels.fetch(config.prizePurchaseAlertChannel);
  if (
    !alertChannel ||
    alertChannel.type === ChannelType.GuildCategory ||
    !alertChannel.isSendable()
  ) {
    throw new Error("Configured prizePurchaseAlertChannel is not a text-based channel");
  }

  await alertChannel.send({
    embeds: [buildPurchaseAlertEmbed(msg.author, chosenItem, config.emoji)],
  });
});

async function start(): Promise<void> {
  await CUserCookie.sync();
  await bot.login(config.token);
}

void start();
