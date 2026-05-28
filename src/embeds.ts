import { EmbedBuilder, type User } from "discord.js";
import type { Prize } from "./config";

const noResultsMsg = "No results to display";

export function buildInsufficientCookieEmbed(author: User, emoji: string): EmbedBuilder {
  return new EmbedBuilder({
    color: 0x8b0000,
    author: {
      name: author.tag,
      icon_url: author.displayAvatarURL(),
    },
    description: `You do not have enough ${emoji} to purchase this prize!`,
  });
}

export function buildInvalidItemEmbed(author: User): EmbedBuilder {
  return new EmbedBuilder({
    color: 0x8b0000,
    author: {
      name: author.tag,
      icon_url: author.displayAvatarURL(),
    },
    description: "Invalid item number!",
  });
}

export function buildLeaderboardEmbed(
  author: User,
  emoji: string,
  boardData: {
    given: Array<{ id: string; given_count: number }>;
    received: Array<{ id: string; received_count: number }>;
    selfStat: { given_count: number; received_count: number };
  },
): EmbedBuilder {
  return new EmbedBuilder({
    footer: {
      text: `Gave ${boardData.selfStat.given_count} ${emoji} | Received ${boardData.selfStat.received_count} ${emoji}`,
    },
    title: "Leaderboard",
    color: 0x00008b,
    author: {
      name: author.tag,
      icon_url: author.displayAvatarURL(),
    },
  }).addFields([
    {
      name: "Received",
      value:
        boardData.received.length === 0
          ? noResultsMsg
          : boardData.received
              .map(
                (entry, index) => `${index + 1}. <@${entry.id}> - ${entry.received_count} ${emoji}`,
              )
              .join("\n"),
    },
    {
      name: "Given",
      value:
        boardData.given.length === 0
          ? noResultsMsg
          : boardData.given
              .map((entry, index) => `${index + 1}. <@${entry.id}> - ${entry.given_count} ${emoji}`)
              .join("\n"),
    },
  ]);
}

export function buildCookieCooldownEmbed(
  author: User,
  emoji: string,
  maxPerDay: number,
  sendAttemptSize: number | null = null,
): EmbedBuilder {
  let descString = `You can only send ${maxPerDay} ${emoji} per day!`;

  if (sendAttemptSize) {
    descString = `${descString} Sending an additional ${sendAttemptSize} ${emoji} would exceed this.`;
  }

  return new EmbedBuilder({
    color: 0x8b0000,
    author: {
      name: author.tag,
      icon_url: author.displayAvatarURL(),
    },
    description: descString,
  });
}

export function buildShopEmbed(prefix: string, emoji: string, prizes: Prize[]): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x00008b)
    .setTitle("Prizes")
    .setDescription(
      prizes
        .map(
          (prize, index) =>
            `${index + 1}. **${prize.name}** (${prize.price} ${emoji})\n${prize.description}`,
        )
        .join("\n\n"),
    )
    .setFooter({ text: `To purchase, type ${prefix}prizes <item number> (example: "!prizes 1")` });
}

export function buildPurchaseEmbed(author: User, item: Prize, emoji: string): EmbedBuilder {
  return new EmbedBuilder({
    color: 0x008000,
    description: `Your purchase of **${item.name}** for **${item.price} ${emoji}** has been successful.`,
    author: {
      name: author.tag,
      icon_url: author.displayAvatarURL(),
    },
    footer: { text: `**${item.redeemInstructions}**` },
  });
}

export function buildPurchaseAlertEmbed(author: User, item: Prize, emoji: string): EmbedBuilder {
  return new EmbedBuilder({
    color: 0x00008b,
    title: "Purchase Alert",
    fields: [
      { value: item.name, inline: true, name: "Item" },
      { value: `${item.price}${emoji}`, inline: true, name: "Price" },
    ],
    footer: { text: author.tag, icon_url: author.displayAvatarURL() },
  });
}
