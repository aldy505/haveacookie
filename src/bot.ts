import pino from "pino";
import { formatInTimeZone } from "date-fns-tz";
import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  type EmbedBuilder,
  type Message,
  type User,
} from "discord.js";
import { config } from "./config";
import { mentionsFirstUserId } from "./helper";
import {
  backfillUserStatsFromTransactions,
  CUserCookie,
  getBalance,
  getTodayGivenCount,
  getUserRankState,
  incrementUserCookiesGiven,
  incrementUserCookiesReceived,
  queryLeaderboards,
  recalculateUserRank,
  releaseReactionAward,
  reserveReactionAward,
  syncModels,
} from "./model";
import {
  buildCookieCooldownEmbed,
  buildInsufficientCookieEmbed,
  buildInvalidItemEmbed,
  buildLeaderboardEmbed,
  buildProfileEmbed,
  buildPurchaseAlertEmbed,
  buildPurchaseEmbed,
  buildRankUpEmbed,
  buildShopEmbed,
} from "./embeds";
import { getRankById } from "./ranks";
import { registerApplicationCommands } from "./registerCommands";

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
  partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User],
});

const resetTz = "America/New_York";

type AwardSuccess = {
  kind: "success";
  recipients: User[];
  remainingToday: number;
  receiverTotalById: Map<string, number>;
  rankUpEmbeds: EmbedBuilder[];
};

type AwardFailure =
  | {
      kind: "cooldown";
      attemptedRecipients: number;
    }
  | {
      kind: "duplicate-reaction";
    };

type AwardResult = AwardSuccess | AwardFailure;

type ReactionLock = {
  messageId: string;
  emoji: string;
  receiverId: string;
};

function getTodayOnResetTimezone(): string {
  return formatInTimeZone(new Date(), resetTz, "yyyy-MM-dd");
}

function getDedupedRecipients(giverId: string, users: Iterable<User>): User[] {
  const seen = new Set<string>();
  const recipients: User[] = [];

  for (const user of users) {
    if (user.id === giverId || user.bot || seen.has(user.id)) {
      continue;
    }

    seen.add(user.id);
    recipients.push(user);
  }

  return recipients;
}

function matchesConfiguredReactionEmoji(emoji: {
  toString: () => string;
  name: string | null;
  id: string | null;
  animated?: boolean | null;
}): boolean {
  const direct = emoji.toString();
  if (config.emoji === direct) {
    return true;
  }

  if (emoji.name && config.emoji === emoji.name) {
    return true;
  }

  if (!emoji.id || !emoji.name) {
    return false;
  }

  const customStatic = `<:${emoji.name}:${emoji.id}>`;
  const customAnimated = `<a:${emoji.name}:${emoji.id}>`;

  return config.emoji === customStatic || config.emoji === customAnimated;
}

async function sendCookieAwardDm(
  giver: User,
  recipients: User[],
  sourceUrl: string,
  remainingToday: number,
  receiverTotalById: Map<string, number>,
): Promise<void> {
  const recipientList = recipients.map((user) => `@${user.username}`).join(", ");
  const giverMsg = [
    `You gave ${recipients.length} ${config.emoji} to ${recipientList}.`,
    `Message: ${sourceUrl}`,
    `Remaining today: ${remainingToday} ${config.emoji}`,
  ].join("\n");

  const dmTasks: Array<Promise<unknown>> = [giver.send(giverMsg)];
  for (const recipient of recipients) {
    const totalReceived = receiverTotalById.get(recipient.id) ?? 0;
    const receiverMsg = [
      `You received 1 ${config.emoji} from @${giver.username}.`,
      `Message: ${sourceUrl}`,
      `Total received: ${totalReceived} ${config.emoji}`,
    ].join("\n");

    dmTasks.push(recipient.send(receiverMsg));
  }

  const dmResults = await Promise.allSettled(dmTasks);
  for (const [index, result] of dmResults.entries()) {
    if (result.status === "rejected") {
      const role = index === 0 ? "giver" : "receiver";
      logger.warn({ error: result.reason }, "Failed to send cookie award DM to %s", role);
    }
  }
}

async function awardCookies(
  giver: User,
  recipients: User[],
  reactionLock?: ReactionLock,
): Promise<AwardResult> {
  const todayOnTz = getTodayOnResetTimezone();
  let didReserveReaction = false;

  if (reactionLock) {
    const isReserved = await reserveReactionAward(
      reactionLock.messageId,
      giver.id,
      reactionLock.receiverId,
      reactionLock.emoji,
    );
    if (!isReserved) {
      return { kind: "duplicate-reaction" };
    }

    didReserveReaction = true;
  }

  const givenTodayCount = await getTodayGivenCount(giver.id, todayOnTz);
  if (
    givenTodayCount >= config.maxPerDay ||
    givenTodayCount + recipients.length > config.maxPerDay
  ) {
    if (didReserveReaction && reactionLock) {
      await releaseReactionAward(reactionLock.messageId, giver.id, reactionLock.emoji);
    }

    return { kind: "cooldown", attemptedRecipients: recipients.length };
  }

  try {
    await CUserCookie.bulkCreate(
      recipients.map((user) => ({
        given_by: giver.id,
        given_date: todayOnTz,
        given_to: user.id,
        is_given: true,
        is_transaction: false,
      })),
    );

    await incrementUserCookiesGiven(giver.id, recipients.length);

    for (const recipient of recipients) {
      await incrementUserCookiesReceived(recipient.id, 1);
    }
  } catch (error) {
    if (didReserveReaction && reactionLock) {
      await releaseReactionAward(reactionLock.messageId, giver.id, reactionLock.emoji);
    }

    throw error;
  }

  const rankUpEmbeds: EmbedBuilder[] = [];
  const giverRankUpdate = await recalculateUserRank(giver.id);
  if (
    giverRankUpdate.currentRankId !== null &&
    (giverRankUpdate.previousRankId ?? 0) < giverRankUpdate.currentRankId
  ) {
    const newRank = getRankById(giverRankUpdate.currentRankId);
    if (newRank) {
      rankUpEmbeds.push(buildRankUpEmbed(giver, newRank));
    }
  }

  for (const recipient of recipients) {
    const receiverRankUpdate = await recalculateUserRank(recipient.id);
    if (
      receiverRankUpdate.currentRankId !== null &&
      (receiverRankUpdate.previousRankId ?? 0) < receiverRankUpdate.currentRankId
    ) {
      const newRank = getRankById(receiverRankUpdate.currentRankId);
      if (newRank) {
        rankUpEmbeds.push(buildRankUpEmbed(recipient, newRank));
      }
    }
  }

  const receiverTotalById = new Map<string, number>();
  for (const recipient of recipients) {
    const rankState = await getUserRankState(recipient.id, todayOnTz);
    receiverTotalById.set(recipient.id, rankState.cookiesReceived);
  }

  return {
    kind: "success",
    recipients,
    remainingToday: Math.max(config.maxPerDay - (givenTodayCount + recipients.length), 0),
    receiverTotalById,
    rankUpEmbeds,
  };
}

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
    return;
  }

  if (interaction.commandName === "profile") {
    const targetUser = interaction.options.getUser("user") ?? interaction.user;
    const todayOnTz = getTodayOnResetTimezone();
    const rankState = await getUserRankState(targetUser.id, todayOnTz);
    const embed = buildProfileEmbed(interaction.user, targetUser, config.emoji, rankState);

    await interaction.reply({ embeds: [embed] });
    return;
  }

  if (interaction.commandName === "give") {
    const target = interaction.options.getUser("user", true);
    const recipients = getDedupedRecipients(interaction.user.id, [target]);

    if (recipients.length === 0) {
      await interaction.reply({
        content: "You cannot give cookies to yourself or bot accounts.",
        ephemeral: true,
      });
      return;
    }

    const awardResult = await awardCookies(interaction.user, recipients);
    if (awardResult.kind === "cooldown") {
      const embed = buildCookieCooldownEmbed(
        interaction.user,
        config.emoji,
        config.maxPerDay,
        awardResult.attemptedRecipients,
      );
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }
    if (awardResult.kind !== "success") {
      await interaction.reply({
        content: "Cookie award was already processed for this reaction.",
        ephemeral: true,
      });
      return;
    }

    const response = await interaction.reply({
      content: `${interaction.user} gave ${recipients.map((user) => user.toString()).join(", ")} ${config.emoji}`,
      fetchReply: true,
    });

    await sendCookieAwardDm(
      interaction.user,
      awardResult.recipients,
      response.url,
      awardResult.remainingToday,
      awardResult.receiverTotalById,
    );

    for (const rankUpEmbed of awardResult.rankUpEmbeds) {
      await interaction.followUp({ embeds: [rankUpEmbed] });
    }
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

  const mentionedRecipients = getDedupedRecipients(msg.author.id, msg.mentions.users.values());
  if (mentionedRecipients.length > 0 && msg.content.includes(config.emoji)) {
    const awardResult = await awardCookies(msg.author, mentionedRecipients);
    if (awardResult.kind === "cooldown") {
      const embed = buildCookieCooldownEmbed(
        msg.author,
        config.emoji,
        config.maxPerDay,
        awardResult.attemptedRecipients,
      );
      await msg.reply({ embeds: [embed] });
      return;
    }
    if (awardResult.kind !== "success") {
      return;
    }

    await sendCookieAwardDm(
      msg.author,
      awardResult.recipients,
      msg.url,
      awardResult.remainingToday,
      awardResult.receiverTotalById,
    );

    for (const rankUpEmbed of awardResult.rankUpEmbeds) {
      await msg.reply({ embeds: [rankUpEmbed] });
    }

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

bot.on(Events.MessageReactionAdd, async (reaction, rawUser) => {
  const giver = rawUser.partial ? await rawUser.fetch() : rawUser;
  if (giver.bot) {
    return;
  }

  if (reaction.partial) {
    await reaction.fetch();
  }

  if (reaction.message.partial) {
    await reaction.message.fetch();
  }

  if (!matchesConfiguredReactionEmoji(reaction.emoji)) {
    return;
  }

  const message = reaction.message;
  if (!message.author || message.author.bot || message.author.id === giver.id) {
    return;
  }

  const recipients = getDedupedRecipients(giver.id, [message.author]);
  if (recipients.length === 0) {
    return;
  }

  const reactionEmoji = reaction.emoji.id
    ? `<${reaction.emoji.animated ? "a" : ""}:${reaction.emoji.name}:${reaction.emoji.id}>`
    : (reaction.emoji.name ?? reaction.emoji.toString());

  const awardResult = await awardCookies(giver, recipients, {
    messageId: message.id,
    emoji: reactionEmoji,
    receiverId: message.author.id,
  });
  if (awardResult.kind !== "success") {
    return;
  }

  await sendCookieAwardDm(
    giver,
    awardResult.recipients,
    message.url,
    awardResult.remainingToday,
    awardResult.receiverTotalById,
  );

  for (const rankUpEmbed of awardResult.rankUpEmbeds) {
    await message.reply({ embeds: [rankUpEmbed] });
  }
});

async function start(): Promise<void> {
  await syncModels();
  await backfillUserStatsFromTransactions();
  await registerApplicationCommands();
  await bot.login(config.token);
}

void start();
