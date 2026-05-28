import { REST, Routes, SlashCommandBuilder } from "discord.js";
import { config } from "./config";

export const commands = [
  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Show the cookie leaderboard.")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("profile")
    .setDescription("Show your cookie rank and progression profile.")
    .addUserOption((option) =>
      option.setName("user").setDescription("User to view").setRequired(false),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("give")
    .setDescription("Give a cookie to another user.")
    .addUserOption((option) =>
      option.setName("user").setDescription("User to give a cookie to").setRequired(true),
    )
    .toJSON(),
];

export async function registerApplicationCommands(): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(config.token);
  const route = config.guildId
    ? Routes.applicationGuildCommands(config.clientId, config.guildId)
    : Routes.applicationCommands(config.clientId);

  await rest.put(route, { body: commands });

  if (config.guildId) {
    console.log(`Registered guild slash commands for guild ${config.guildId}`);
    return;
  }

  console.log("Registered global slash commands");
}
