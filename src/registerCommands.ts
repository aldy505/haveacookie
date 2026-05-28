import { REST, Routes, SlashCommandBuilder } from "discord.js";
import { config } from "./config";

const commands = [
  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Show the cookie leaderboard.")
    .toJSON(),
];

async function registerCommands(): Promise<void> {
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

void registerCommands();
