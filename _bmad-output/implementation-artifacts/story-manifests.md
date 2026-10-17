# Story manifests

Sprint planning writes `stories/<story-id>.md` (AD-16). This note records the conventions it uses.

- **Story ID.** The Story number from `epics.md`, dotted: `1.1`, `14.3`. The branch is `story/<story-id>` and Escalations are `ESC-<story-id>-<n>` (for example `ESC-1.1-1`). Each manifest's `sprint_key` names its entry in `sprint-status.yaml`.
- **Xaravel Test IDs.** Each acceptance criterion (one `**Given**` block) gets one `XT-<component>-<n>`, numbered per Component in file order. A Story may add further Xaravel Tests for a criterion, but it must not renumber those already allocated.
- **Coverage so far.** Manifests exist for Phase 0 (Epics 1–8) only. Phase 1–8 Stories name Upstream selectors, which sprint planning resolves to Test IDs once Epic 2 delivers the Test Inventory; their manifests are written then. Phase 0 must finish before Phase 1 starts, so no Story is waiting on them.
- **Components.** Epics 1–3, 5, 6 and 8, and Stories 7.1–7.2, use `component: conformance`. Stories 4.1–4.4 use `assert`, 4.5–4.6 use `mockery`, and 7.3–7.4 use `boost`.
