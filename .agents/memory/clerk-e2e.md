---
name: Clerk browser regression tests
description: Use Clerk's official Playwright testing helper for authenticated browser flows on Replit development domains.
---

Use `@clerk/testing/playwright` with `clerkSetup()` and `clerk.signIn({ page, emailAddress })` for browser-authenticated tests; do not reproduce Clerk's private cookie format manually.

**Why:** Replit development domains use Clerk's suffixed and development-browser cookies, and manually injecting a backend session token can still leave the frontend signed out.

**How to apply:** Keep backend API authorization assertions separate from the browser sign-in helper, and clean up any temporary Clerk identities and test records in `finally`.