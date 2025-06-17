import { Client, GatewayIntentBits, Collection } from "discord.js";
import fs from "fs/promises";
import path from "path";
import "dotenv/config";
import {
  CustomClient,
  Command,
  Event,
  Button,
  Modal,
  SelectMenu,
} from "./types";
import { getDb } from "./db";

async function main() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildPresences,
      GatewayIntentBits.MessageContent,
    ],
  }) as CustomClient;

  const db = getDb();
  client.commands = new Collection<string, Command>();
  client.buttons = new Collection<string, Button>();
  client.modals = new Collection<string, Modal>();
  client.events = new Collection<string, Event>();
  client.selects = new Collection<string, SelectMenu>();

  const loadHandlers = async <T>(
    dir: string,
    collection: Collection<string, T>,
  ) => {
    const base = path.join(__dirname, dir);
    try {
      const files = (await fs.readdir(base)).filter(
        (f) => f.endsWith(".ts") || f.endsWith(".js"),
      );
      for (const file of files) {
        const mod = await import(path.join(base, file));
        const handler = mod.default || mod;
        if (handler?.execute) {
          collection.set(path.parse(file).name, handler);
          console.log(`[LOAD] Loaded ${dir}/${file}`);
        }
      }
    } catch (error) {
      console.error(`[ERROR] Failed to load handlers from ${dir}:`, error);
    }
  };

  const loadEvents = async (dir: string) => {
    const base = path.join(__dirname, dir);
    try {
      const files = (await fs.readdir(base)).filter(
        (f) => f.endsWith(".ts") || f.endsWith(".js"),
      );
      for (const file of files) {
        const mod = await import(path.join(base, file));
        if (mod.name && mod.execute) {
          const event: Event = {
            name: mod.name,
            once: mod.once || false,
            execute: mod.execute,
          };
          client.events.set(mod.name, event);
          console.log(`[LOAD] Loaded event: ${mod.name}`);
        }
      }
    } catch (error) {
      console.error(`[ERROR] Failed to load events from ${dir}:`, error);
    }
  };

  await loadHandlers<Command>("commands", client.commands);
  await loadEvents("events");
  await loadHandlers<Button>("buttons", client.buttons);
  await loadHandlers<Modal>("modals", client.modals);
  await loadHandlers<SelectMenu>("selects", client.selects);

  client.events.forEach((event) => {
    const fn = (...args: any[]) => event.execute(client, ...args, db);
    if (event.once) {
      client.once(event.name, fn);
    } else {
      client.on(event.name, fn);
    }
    console.log(
      `[EVENT] Registered ${event.once ? "once" : "on"} event: ${event.name}`,
    );
  });

  client.on("interactionCreate", async (interaction) => {
    try {
      if (interaction.isButton()) {
        const customId = interaction.customId ?? "";
        const [prefix, customCode] = customId.split(":");

        console.log(`[BUTTON] Button interaction: ${interaction.customId}`);
        const button = client.buttons.get(prefix);
        if (button) {
          await button.execute(interaction, db, client);
        } else {
          console.warn(`[BUTTON] No handler found for: ${customCode}`);
        }
      } else if (interaction.isModalSubmit()) {
        const customId = interaction.customId ?? "";
        const [prefix, customCode] = customId.split(":");

        console.log(`[MODAL] Modal submit: ${interaction.customId}`);
        const modal = client.modals.get(prefix);

        if (modal) {
          await modal.execute(interaction, db);
        } else {
          console.warn(`[MODAL] No handler found for: ${customCode}`);
        }
      } else if (interaction.isStringSelectMenu()) {
        const customId = interaction.customId ?? "";
        const [prefix, customCode] = customId.split(":");
        console.log(`[SELECT] Select menu: ${interaction.customId}`);
        const selectMenuHandler = client.selects.get(prefix);

        if (selectMenuHandler) {
          await selectMenuHandler.execute(interaction, db, client);
        } else {
          console.warn(`[SELECT] No handler found for: ${customId}`);
        }
      } else if (interaction.isChatInputCommand()) {
        console.log(`[COMMAND] Slash command: ${interaction.commandName}`);
        const command = client.commands.get(interaction.commandName);
        if (command) {
          await command.execute(interaction, client, db);
        }
      }
    } catch (error) {
      console.error(`[ERROR] Interaction error:`, error);
      const payload = {
        content: "There was an error while executing this interaction!",
        ephemeral: true,
      };

      try {
        if (interaction.isRepliable()) {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp(payload);
          } else {
            await interaction.reply(payload);
          }
        }
      } catch (replyError) {
        console.error(`[ERROR] Failed to send error message:`, replyError);
      }
    }
  });

  client.once("ready", () => {
    console.log(`[READY] Logged in as ${client.user?.tag}`);
    console.log(`[INFO] Commands loaded: ${client.commands.size}`);
    console.log(`[INFO] Events loaded: ${client.events.size}`);
    console.log(`[INFO] Buttons loaded: ${client.buttons.size}`);
    console.log(`[INFO] Modals loaded: ${client.modals.size}`);
    console.log(`[INFO] Selects loaded: ${client.selects.size}`);
  });

  await client.login(process.env.DISCORD_TOKEN);
}

main().catch(console.error);
