import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const leaderboardEntriesTable = pgTable("leaderboard_entries", {
  id: text("id").primaryKey(),
  playerName: text("player_name").notNull(),
  score: integer("score").notNull(),
  accuracy: integer("accuracy").notNull(),
  difficulty: integer("difficulty").notNull(),
  tableFrom: integer("table_from").notNull(),
  tableTo: integer("table_to").notNull(),
  playedAt: timestamp("played_at", { withTimezone: true }).notNull().defaultNow(),
  correctCount: integer("correct_count").notNull(),
  totalQuestions: integer("total_questions").notNull(),
});

export const insertLeaderboardEntrySchema = createInsertSchema(leaderboardEntriesTable).omit({ playedAt: true });
export type InsertLeaderboardEntry = z.infer<typeof insertLeaderboardEntrySchema>;
export type LeaderboardEntry = typeof leaderboardEntriesTable.$inferSelect;