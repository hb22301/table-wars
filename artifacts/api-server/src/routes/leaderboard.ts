import { and, desc, eq, gte } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  ListCreatorFeedbackResponse,
  SubmitLeaderboardEntryBody,
  SubmitLeaderboardEntryResponse,
  SubmitFeedbackBody,
  SubmitFeedbackResponse,
  ListLeaderboardResponse,
} from "@workspace/api-zod";
import { db, feedbackMessagesTable, leaderboardEntriesTable } from "@workspace/db";
import { requireCreator } from "../middlewares/creatorAuth";

const router: IRouter = Router();
const LEADERBOARD_RETENTION_DAYS = 7;
const LEADERBOARD_RETENTION_MS = LEADERBOARD_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const LEADERBOARD_MIN_ACCURACY = 70;

function toApiEntry(entry: typeof leaderboardEntriesTable.$inferSelect) {
  return {
    ...entry,
    playedAt: entry.playedAt.toISOString(),
  };
}

function toApiFeedback(feedback: typeof feedbackMessagesTable.$inferSelect) {
  return {
    ...feedback,
    createdAt: feedback.createdAt.toISOString(),
  };
}

async function loadLeaderboard(cutoff?: Date) {
  const query = db.select().from(leaderboardEntriesTable);
  const eligibleAccuracy = gte(leaderboardEntriesTable.accuracy, LEADERBOARD_MIN_ACCURACY);
  if (cutoff) {
    return query
      .where(and(eligibleAccuracy, gte(leaderboardEntriesTable.playedAt, cutoff)))
      .orderBy(desc(leaderboardEntriesTable.score), desc(leaderboardEntriesTable.playedAt), desc(leaderboardEntriesTable.accuracy))
      .limit(100);
  }
  return query
    .where(eligibleAccuracy)
    .orderBy(desc(leaderboardEntriesTable.score), desc(leaderboardEntriesTable.playedAt), desc(leaderboardEntriesTable.accuracy))
    .limit(100);
}

router.get("/leaderboard", async (req, res): Promise<void> => {
  try {
    const cutoff = new Date(Date.now() - LEADERBOARD_RETENTION_MS);
    const entries = await loadLeaderboard(cutoff);
    res.json(ListLeaderboardResponse.parse(entries.map(toApiEntry)));
  } catch (error) {
    req.log.error({ error }, "Failed to load shared leaderboard");
    res.status(500).json({ error: "Unable to load the shared leaderboard." });
  }
});

router.get("/leaderboard/all-time", async (req, res): Promise<void> => {
  try {
    const entries = await loadLeaderboard();
    res.json(ListLeaderboardResponse.parse(entries.map(toApiEntry)));
  } catch (error) {
    req.log.error({ error }, "Failed to load all-time leaderboard");
    res.status(500).json({ error: "Unable to load the all-time leaderboard." });
  }
});

router.get("/creator/access", requireCreator, (_req, res): void => {
  res.json({ authorized: true });
});

router.get("/creator/feedback", requireCreator, async (req, res): Promise<void> => {
  try {
    const feedback = await db
      .select()
      .from(feedbackMessagesTable)
      .orderBy(desc(feedbackMessagesTable.createdAt))
      .limit(200);
    res.json(ListCreatorFeedbackResponse.parse(feedback.map(toApiFeedback)));
  } catch (error) {
    req.log.error({ error }, "Failed to load creator feedback");
    res.status(500).json({ error: "Unable to load creator feedback." });
  }
});

router.delete("/creator/feedback/:id", requireCreator, async (req, res): Promise<void> => {
  const feedbackId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  try {
    const deleted = await db
      .delete(feedbackMessagesTable)
      .where(eq(feedbackMessagesTable.id, feedbackId))
      .returning({ id: feedbackMessagesTable.id });
    if (!deleted[0]) {
      res.status(404).json({ error: "Feedback not found." });
      return;
    }
    res.status(204).end();
  } catch (error) {
    req.log.error({ error }, "Failed to delete creator feedback");
    res.status(500).json({ error: "Unable to delete feedback." });
  }
});

router.delete("/leaderboard/:id", requireCreator, async (req, res): Promise<void> => {
  const entryId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  try {
    const deleted = await db
      .delete(leaderboardEntriesTable)
      .where(eq(leaderboardEntriesTable.id, entryId))
      .returning({ id: leaderboardEntriesTable.id });
    if (!deleted[0]) {
      res.status(404).json({ error: "Leaderboard entry not found." });
      return;
    }
    res.status(204).end();
  } catch (error) {
    req.log.error({ error }, "Failed to delete leaderboard entry");
    res.status(500).json({ error: "Unable to delete the leaderboard entry." });
  }
});

router.post("/leaderboard", async (req, res): Promise<void> => {
  const parsed = SubmitLeaderboardEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (parsed.data.accuracy < LEADERBOARD_MIN_ACCURACY) {
    res.status(422).json({ error: `Leaderboard entries require at least ${LEADERBOARD_MIN_ACCURACY}% accuracy.` });
    return;
  }

  try {
    const existing = await db
      .select()
      .from(leaderboardEntriesTable)
      .where(eq(leaderboardEntriesTable.id, parsed.data.runId))
      .limit(1);
    if (existing[0]) {
      res.json(SubmitLeaderboardEntryResponse.parse(toApiEntry(existing[0])));
      return;
    }

    const [created] = await db
      .insert(leaderboardEntriesTable)
      .values({
        id: parsed.data.runId,
        playerName: parsed.data.playerName.trim(),
        score: parsed.data.score,
        accuracy: parsed.data.accuracy,
        difficulty: parsed.data.difficulty,
        tableFrom: parsed.data.tableFrom,
        tableTo: parsed.data.tableTo,
        correctCount: parsed.data.correctCount,
        totalQuestions: parsed.data.totalQuestions,
      })
      .onConflictDoNothing()
      .returning();

    const entry = created ?? (await db
      .select()
      .from(leaderboardEntriesTable)
      .where(eq(leaderboardEntriesTable.id, parsed.data.runId))
      .limit(1))[0];
    if (!entry) {
      res.status(500).json({ error: "Unable to save the leaderboard entry." });
      return;
    }
    res.json(SubmitLeaderboardEntryResponse.parse(toApiEntry(entry)));
  } catch (error) {
    req.log.error({ error }, "Failed to save shared leaderboard entry");
    res.status(500).json({ error: "Unable to save the leaderboard entry." });
  }
});

router.post("/feedback", async (req, res): Promise<void> => {
  const parsed = SubmitFeedbackBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const [created] = await db
      .insert(feedbackMessagesTable)
      .values({
        id: crypto.randomUUID(),
        name: parsed.data.name?.trim() || null,
        message: parsed.data.message.trim(),
      })
      .returning();
    res.status(201).json(SubmitFeedbackResponse.parse(toApiFeedback(created)));
  } catch (error) {
    req.log.error({ error }, "Failed to save creator feedback");
    res.status(500).json({ error: "Unable to save feedback." });
  }
});

export default router;