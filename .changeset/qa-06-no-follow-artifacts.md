---
"@patchrace/core": patch
---

Refuse symbolic-link and multiply hard-linked run files during artifact
append/read, recovery, and cleanup ownership checks so malicious same-user
processes cannot redirect PatchRace file access outside the owned run tree.
