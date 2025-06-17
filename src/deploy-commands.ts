import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v10";
import * as fs from "fs";
import * as path from "path";
import "dotenv/config";

const commands: any[] = [];

const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith(".ts") || file.endsWith(".js"));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ("data" in command && "execute" in command) {
    commands.push(command.data.toJSON());
    console.log(`[INFO] Loaded command from ${file}`);
  } else {
    console.log(
      `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`,
    );
  }
}

const clientId = process.env.CLIENT_ID;
const guildId = process.env.SERVER_ID;
const token = process.env.DISCORD_TOKEN;

if (!clientId || !guildId || !token) {
  console.error(
    "[ERROR] CLIENT_ID, SERVER_ID, or DISCORD_TOKEN is missing from your environment variables.",
  );
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  try {
    console.log(
      `[INFO] Started refreshing ${commands.length} application (/) commands.`,
    );

    const data: any = await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands },
    );

    console.log(
      `[INFO] Successfully reloaded ${data.length} application (/) commands.`,
    );
  } catch (error) {
    console.error(error);
  }
})();
