export * from "./sql";

import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  Client,
  Collection,
  ModalSubmitInteraction,
  SlashCommandBuilder,
  StringSelectMenuInteraction,
} from "discord.js";
import type { getDb } from "../db/index";
export type DB = ReturnType<typeof getDb>;

export interface CustomClient extends Client {
  commands: Collection<string, Command>;
  buttons: Collection<string, Button>;
  modals: Collection<string, Modal>;
  events: Collection<string, Event>;
  selects: Collection<string, SelectMenu>;
}

export interface Command {
  data:
    | SlashCommandBuilder
    | Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">;
  execute: (
    interaction: ChatInputCommandInteraction,
    client: Client,
    db: DB,
  ) => Promise<void>;
}

export interface Event {
  name: string;
  once?: boolean;
  execute(client: CustomClient, ...args: any[]): void;
}

export interface Button {
  customId: string;
  execute: (interaction: ButtonInteraction, db: DB) => Promise<void>;
}

export interface Modal {
  customId: string;
  execute: (interaction: ModalSubmitInteraction, db: DB) => Promise<void>;
}

export interface SelectMenu {
  execute: (
    interaction: StringSelectMenuInteraction,
    db: DB,
    client: CustomClient,
  ) => Promise<void>;
}
