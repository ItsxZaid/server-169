import { Client, GatewayIntentBits, Collection } from "discord.js";
import fs from "fs/promises";
import path from "path";
import "dotenv/config";
import { CustomClient, Command, Event, Button, Modal } from "./types";
import { getDb } from "./db";

async function main() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.MessageContent,
    ],
  }) as CustomClient;

  const db = getDb();

  client.commands = new Collection<string, Command>();
  client.buttons = new Collection<string, Button>();
  client.modals = new Collection<string, Modal>();
  client.events = new Collection<string, Event>();

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
        if (handler?.execute) collection.set(path.parse(file).name, handler);
      }
    } catch {}
  };

  const loadEvents = async (dir: string) => {
    const base = path.join(__dirname, dir);
    try {
      const files = (await fs.readdir(base)).filter(
        (f) => f.endsWith(".ts") || f.endsWith(".js"),
      );
      for (const file of files) {
        const mod = await import(path.join(base, file));
        if (mod?.name && mod?.execute) {
          client.events.set(mod.name, {
            name: mod.name,
            once: mod.once,
            execute: mod.execute,
          });
        }
      }
    } catch {}
  };

  await loadHandlers<Command>("commands", client.commands);
  await loadEvents("events");
  await loadHandlers<Button>("buttons", client.buttons);
  await loadHandlers<Modal>("modals", client.modals);

  client.events.forEach((event) => {
    const fn = (...args: any[]) => event.execute(client, ...args, db);
    event.once ? client.once(event.name, fn) : client.on(event.name, fn);
  });

  client.on("interactionCreate", async (interaction) => {
    try {
      if (interaction.isButton()) {
        const button = client.buttons.get(interaction.customId);
        if (button) await button.execute(interaction, db);
      } else if (interaction.isModalSubmit()) {
        const modal = client.modals.get(interaction.customId);
        if (modal) await modal.execute(interaction, db);
      }
    } catch (e) {
      const payload = {
        content: "There was an error while executing this interaction!",
        ephemeral: true,
      };
      if (interaction.isRepliable()) {
        interaction.replied || interaction.deferred
          ? await interaction.followUp(payload)
          : await interaction.reply(payload);
      }
    }
  });

  client.once("ready", () =>
    console.log(`[READY] Logged in as ${client.user?.tag}`),
  );
  await client.login(process.env.DISCORD_TOKEN);
}

main().catch(console.error);
