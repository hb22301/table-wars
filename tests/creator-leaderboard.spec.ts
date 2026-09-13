import { createClerkClient } from "@clerk/backend";
import { clerk as clerkTesting, clerkSetup } from "@clerk/testing/playwright";
import { expect, test, type APIRequestContext } from "@playwright/test";

type TestIdentity = {
  email: string;
  userId: string;
  sessionId: string;
  token: string;
  createdUser: boolean;
};

type LeaderboardEntry = {
  id: string;
  playerName: string;
};

const creatorEmail = process.env.CREATOR_EMAIL?.trim().toLowerCase();
const clerkSecretKey = process.env.CLERK_SECRET_KEY;

if (!creatorEmail) {
  throw new Error(
    "CREATOR_EMAIL is required to run the creator leaderboard E2E test.",
  );
}

if (!clerkSecretKey) {
  throw new Error(
    "CLERK_SECRET_KEY is required to run the creator leaderboard E2E test.",
  );
}

const clerk = createClerkClient({ secretKey: clerkSecretKey });
const testRunId = `e2e-creator-delete-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const testPlayerName = `E2E creator deletion ${testRunId.slice(-8)}`;

async function findOrCreateIdentity(
  email: string,
  role: "creator" | "noncreator",
): Promise<TestIdentity> {
  const existing = await clerk.users.getUserList({
    emailAddress: [email],
    limit: 1,
  });
  const existingUser = existing.data[0];
  const password = `E2e-${crypto.randomUUID()}-StrongPassword!`;
  const user =
    existingUser ??
    (await clerk.users.createUser({
      emailAddress: [email],
      password,
      firstName: "Leaderboard",
      lastName: `E2E ${role}`,
      skipPasswordChecks: true,
    }));
  const session = await clerk.sessions.createSession({ userId: user.id });
  const token = await clerk.sessions.getToken(session.id);

  return {
    email,
    userId: user.id,
    sessionId: session.id,
    token: token.jwt,
    createdUser: !existingUser,
  };
}

async function deleteIdentity(identity: TestIdentity): Promise<void> {
  await clerk.sessions.revokeSession(identity.sessionId).catch(() => undefined);
  if (identity.createdUser) {
    await clerk.users.deleteUser(identity.userId).catch(() => undefined);
  }
}

async function submitTestEntry(
  request: APIRequestContext,
): Promise<LeaderboardEntry> {
  const response = await request.post("/api/leaderboard", {
    data: {
      runId: testRunId,
      playerName: testPlayerName,
      score: 999_999,
      accuracy: 100,
      difficulty: 1,
      tableFrom: 2,
      tableTo: 12,
      correctCount: 20,
      totalQuestions: 20,
    },
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<LeaderboardEntry>;
}

async function cleanupEntry(
  request: APIRequestContext,
  token: string,
): Promise<void> {
  const response = await request.delete(
    `/api/leaderboard/${encodeURIComponent(testRunId)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (![204, 404].includes(response.status())) {
    throw new Error(
      `Could not clean up test leaderboard entry: ${response.status()}`,
    );
  }
}

test("creator can delete a leaderboard entry and authorization stays enforced", async ({
  browser,
  request,
  baseURL,
}) => {
  if (!baseURL) {
    test.skip(true, "A browser base URL is required.");
    return;
  }

  await clerkSetup();

  let creator: TestIdentity | undefined;
  let nonCreator: TestIdentity | undefined;
  let entry: LeaderboardEntry | undefined;

  try {
    creator = await findOrCreateIdentity(creatorEmail, "creator");
    const nonCreatorEmail = `e2e-noncreator-${testRunId}@example.com`;
    nonCreator = await findOrCreateIdentity(nonCreatorEmail, "noncreator");
    entry = await submitTestEntry(request);

    const unauthenticatedDelete = await request.delete(
      `/api/leaderboard/${encodeURIComponent(entry.id)}`,
    );
    expect(unauthenticatedDelete.status()).toBe(401);

    const nonCreatorDelete = await request.delete(
      `/api/leaderboard/${encodeURIComponent(entry.id)}`,
      {
        headers: { Authorization: `Bearer ${nonCreator.token}` },
      },
    );
    expect(nonCreatorDelete.status()).toBe(403);

    const creatorContext = await browser.newContext();
    try {
      const creatorPage = await creatorContext.newPage();
      await creatorPage.goto("/");
      await clerkTesting.signIn({
        page: creatorPage,
        emailAddress: creator.email,
      });
      await creatorPage.goto("/creator");
      await expect(
        creatorPage.getByRole("heading", { name: "Manage the leaderboard." }),
      ).toBeVisible();
      const creatorRow = creatorPage.getByTestId(`creator-row-${entry.id}`);
      await expect(creatorRow).toContainText(testPlayerName);
      creatorPage.on("dialog", (dialog) => dialog.accept());
      await creatorPage.getByTestId(`button-delete-${entry.id}`).click();
      await expect(creatorRow).toHaveCount(0);
    } finally {
      await creatorContext.close();
    }

    const weeklyBoard = await request.get("/api/leaderboard");
    const weeklyEntries = (await weeklyBoard.json()) as Array<{ id: string }>;
    expect(weeklyEntries.some(({ id }) => id === entry?.id)).toBeFalsy();

    const allTimeBoard = await request.get("/api/leaderboard/all-time");
    const allTimeEntries = (await allTimeBoard.json()) as Array<{ id: string }>;
    expect(allTimeEntries.some(({ id }) => id === entry?.id)).toBeFalsy();
  } finally {
    if (creator) {
      await cleanupEntry(request, creator.token);
    }
    if (nonCreator) {
      await deleteIdentity(nonCreator);
    }
    if (creator) {
      await deleteIdentity(creator);
    }
  }
});
