import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const feedbackMessagesTable = pgTable("feedback_messages", {
  id: text("id").primaryKey(),
  name: text("name"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFeedbackMessageSchema = createInsertSchema(feedbackMessagesTable).omit({ createdAt: true });
export type InsertFeedbackMessage = z.infer<typeof insertFeedbackMessageSchema>;
export type FeedbackMessage = typeof feedbackMessagesTable.$inferSelect;