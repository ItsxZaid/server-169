import {
  drizzle,
  type BetterSQLite3Database,
} from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";

let dbInstance: BetterSQLite3Database<typeof schema> | null = null;

/**
 * Creates and returns a single instance of the Drizzle ORM database connection.
 * @returns The Drizzle database instance.
 */
export function getDb() {
  if (!dbInstance) {
    console.log("✨ Creating a new database connection instance.");

    const sqlite = new Database("sqlite.db");
    dbInstance = drizzle(sqlite, { schema });
  }
  return dbInstance;
}
