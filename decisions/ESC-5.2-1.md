---
decision: approved
decided_by: Maintainer
date: 2026-10-19
escalation_sha256: "51594b5776408009892090fdbc59d81cd063415e8bc2938e012fe4c387a3eed7"
---

# ESC-5.2-1: approved, option 1

The Maintainer approved this in the Maintainer's session on 2026-10-19.

Story 8.5's reviewers' checklist, `conformance/review/fidelity.md`, cites the "Precedence" section of `conformance/README.md` (`conformance/README.md#precedence`) in its "every new Skip Reason is justified, and its precedence is right" item. `epics.md` Story 8.5 now says so. Story 5.2's AC 9 is complete when Story 8.5 lands.

Rationale: the reference belongs in the file Story 8.5 owns. Option 2 would have Story 5.2 write another Story's file and pre-empt its design. Option 3 would drop half of Story 5.2's criterion. Option 1 changes no code, weakens no check and keeps each Story within its own paths.
