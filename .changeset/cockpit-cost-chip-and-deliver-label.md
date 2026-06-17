---
"vibeediting": patch
---

Fix two cockpit bugs found in a live QA walk:

- **Plan cost chip / approval gate:** the Plan tab dropped the amber cost chip and instead showed a
  false "plan mentions paid generation but no cost line" warning whenever the agent wrote an
  approximate estimate like `~$0.10`. The `Estimated cost:` parser now tolerates a leading `~` /
  `≈` / `approx` / `about`, so the cost is surfaced at the approval gate (D19) rather than a
  contradictory warning.
- **Deliver loudnorm label:** the loudnorm toggle advertised the master landing in
  `test-video/<project>/…` (a stale name from the reference project). It now reads
  `deliver/<project>/…`, matching the real output directory (`deliverDir()`), the post-render
  success toast, and the served `/deliver/` mount.
