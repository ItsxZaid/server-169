import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { InferSelectModel, InferInsertModel, relations } from "drizzle-orm";

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

export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title", { length: 255 }).notNull(),
  description: text("description").notNull(),

  type: text("type", { enum: ["server-wide", "alliance-specific"] }).notNull(),

  alliance_target: text("alliance_target", { length: 64 }),

  event_time: text("event_time").notNull(),

  created_by_discord_id: text("created_by_discord_id", { length: 25 })
    .notNull()
    .references(() => users.user_discord_id),

  imageUrl: text("image_url"),

  reminder_sent: integer("reminder_sent", { mode: "boolean" })
    .default(false)
    .notNull(),

  created_at: text("created_at").default("CURRENT_TIMESTAMP").notNull(),
  updated_at: text("updated_at").default("CURRENT_TIMESTAMP").notNull(),
});

export const eventsRelations = relations(events, ({ one }) => ({
  author: one(users, {
    fields: [events.created_by_discord_id],
    references: [users.user_discord_id],
  }),
}));

export type Event = InferSelectModel<typeof events>;
export type NewEvent = InferInsertModel<typeof events>;

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
