import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { InferSelectModel, InferInsertModel } from "drizzle-orm";

export const users = sqliteTable("user", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  user_discord_id: text("user_discord_id", { length: 25 }).notNull().unique(),
  in_game_name: text("in_game_name", { length: 64 }).notNull(),
  server: text("server", { length: 64 }).notNull(),
  rank: text("rank", { enum: ["R1", "R2", "R3", "R4", "R5"] }).notNull(),
  alliance: text("alliance", { length: 64 }).notNull(),
  status: text("status", {
    enum: ["onboarding", "pending", "approved", "denied"],
  })
    .notNull()
    .default("pending"),
  created_at: text("created_at").default("CURRENT_TIMESTAMP").notNull(),
  updated_at: text("updated_at").default("CURRENT_TIMESTAMP").notNull(),
});

export type User = InferSelectModel<typeof users>;

export type NewUser = InferInsertModel<typeof users>;
