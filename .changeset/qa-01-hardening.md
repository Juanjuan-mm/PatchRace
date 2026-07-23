---
"@patchrace/core": patch
"patchrace": patch
"pi-patchrace": patch
---

Fail visibly when durable run discovery encounters corrupt owned state instead
of silently reporting that no run exists, and reject cleanup without an
explicit owned run or cache target instead of returning a legacy placeholder.
