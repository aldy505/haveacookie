import type { Message } from "discord.js";

export function mentionsFirstUserId(msg: Message, userId: string): boolean {
    const firstMention = msg.mentions.users.first();

    return Boolean(firstMention && firstMention.id === userId);
}
