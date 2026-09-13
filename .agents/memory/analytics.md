---
name: Hosted analytics
description: Project decision for custom event instrumentation in the web app.
---

Custom analytics events are sent through a shared client-side wrapper that safely no-ops when the hosted tracker is absent.

**Why:** Replit injects the analytics tracker through the publishing proxy, so development previews and unpublished builds may not have `window.umami`; analytics failures must never interrupt gameplay.

**How to apply:** Keep event names in `snake_case`, send only primitive non-PII dimensions, and route all future custom events through the shared wrapper rather than calling the tracker directly.