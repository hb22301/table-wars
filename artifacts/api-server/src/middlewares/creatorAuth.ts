import { clerkClient, getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";

export async function requireCreator(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in is required." });
    return;
  }

  const creatorEmail = process.env.CREATOR_EMAIL?.trim().toLowerCase();
  if (!creatorEmail) {
    res.status(503).json({ error: "Creator access is not configured." });
    return;
  }

  try {
    const user = await clerkClient.users.getUser(userId);
    const isCreator = user.emailAddresses.some(
      ({ emailAddress }) => emailAddress.toLowerCase() === creatorEmail,
    );
    if (!isCreator) {
      res.status(403).json({ error: "Creator access is required." });
      return;
    }
    next();
  } catch (error) {
    console.error("Failed to verify creator access", error);
    res.status(503).json({ error: "Unable to verify creator access." });
  }
}