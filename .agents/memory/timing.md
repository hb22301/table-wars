---
name: Timer synchronization
description: Timing decision for the practice question countdown and progress bar.
---

The question countdown label, progress bar, and timeout decision share one monotonic deadline and remaining-milliseconds calculation.

**Why:** Independent whole-second state updates and CSS width transitions can visibly drift apart, especially when frames or timer callbacks are delayed.

**How to apply:** When changing the practice timer, preserve the single-deadline model and avoid adding a second visual or logical clock.