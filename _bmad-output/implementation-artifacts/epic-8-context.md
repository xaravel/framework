# Epic 8 Context: `PORTING.md`, Divergence Records, Fidelity Review & pilot (Phase 0 exit)

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Close Phase 0 by giving Framework Agents one written rulebook and a proven review loop before any framework porting starts. Epic 8 writes the twelve Divergence Records (DIV-1..DIV-12) with numbered adaptation clauses that every `adapted` marker must cite. It also writes `PORTING.md`, the PHP→TypeScript rulebook, and runs the Bun/Temporal/bcrypt spikes that settle the open questions. It sets up the two-reviewer Fidelity Review and the agent stop rules, then pilots the whole loop on real Support and Collections tests. A CI gate blocks Phase 1 Stories until all of this is on `main`.

## Stories

- Story 8.1: Divergence Records DIV-1 to DIV-12
- Story 8.2: `PORTING.md`
- Story 8.3: Bun primitive probes (OQ-11)
- Story 8.4: Temporal and bcrypt spikes, and the OQ-12 decision
- Story 8.5: Fidelity Review workflow
- Story 8.6: Framework Agent operating instructions and stop rules
- Story 8.7: `PORTING.md` pilot on Support and Collections
- Story 8.8: Phase 1 gate

## Requirements & Constraints

- **Kind.** This is Conformance System work. Each acceptance criterion is verified by an `XT-conformance-<n>` Xaravel Test (`xaravelTest(...)`), or by a decision file the Maintainer signs. Story 8.1 owns XT-conformance-149..152 and has no Ported Test IDs.
- **Divergence Records** (`decisions/DIV-<n>.md`). Each record has a rationale, a behaviour section and at least one adaptation clause numbered `DIV-<n>.<k>`. Its content must match the PRD's Intentional Divergence text and the ADs that DIV cites:
  - **DIV-1, async IO terminals (AD-6).** Async roots, async by derivation (callbacks), loaded-once sync state (session, input, auth user), dual helpers, thenables, self-starting destructor terminals, the async companions, and `AsyncLazyCollection` (adaptation: `instanceof LazyCollection` becomes `instanceof AsyncLazyCollection`).
  - **DIV-2, strict loading (AD-8).** `model.related('rel')` replaces `$m->rel()`. Lazy property access adapts to `await m.related('rel')`. Automatic eager loading on await.
  - **DIV-3, `inject({...})` named map (AD-4).** No static `inject` list.
  - **DIV-4, closure serialization (AD-14).** Arguments plus facades and helpers only.
  - **DIV-5, generated code is TS.** PHP-output asserts become rendered-output or TS-snapshot tests.
  - **DIV-6, `php-only` catalogue.** Every entry needs an approved Escalation; type juggling is never php-only.
  - **DIV-7, discovery without reflection.**
  - **DIV-8, async test bodies.** Predicate assertions on fakes and `TestResponse` return Promises.
  - **DIV-9, PHP value model (AD-9).** null, list/object/`PhpArray`, lossless integers with `IntegerOverflowException`, the float marker (`adapted:DIV-9.<k>`), brands, php-props.
  - **DIV-10, JS `RegExp`, not PCRE.** Tests that depend on PCRE-only features are skipped as `intentional-divergence:DIV-10`.
  - **DIV-11, long-lived application (AD-5, AD-25, AD-13).** Scope Frames, base-only writes throw `ScopeFrameException`, frame-held writes. It **must** include the clause "no pcntl; job timeouts are enforced by the supervisor process". Timeout tests use a spawned fixture app and are marked `adapted:DIV-11.<k>`.
  - **DIV-12, member namespaces (AD-26).** Option pairs, method-plus-state, decorated accessors and scopes, `setFillable` and `isTouching`, no magic Request properties. It **must** include `collection.get(0)`, the Model method renames, and no dynamic wheres or finders (`where('email', v)`).
- **Clauses owed by earlier Escalation rulings.** Story 8.1's records must carry these clauses:
  - **DIV-6 php-only:** Mockery `alias:` and `overload:`, and run-time method visibility (`decisions/ESC-4.6-1.md`).
  - **DIV-6 php-only:** PHP run-time types and reflection in test doubles (`ESC-4.7-1.md` item 2).
  - **DIV-6 php-only:** PHP final, visibility and reflection in Double's doubles (`ESC-4.8-1.md`).
  - **DIV-9 (JS value model, message-only):** closure equality, the JS `Error` through `ExceptionComparator`, and the exception export without string/file/line/trace (`ESC-4.3-1.md` items 9, 10, 13).
  - **DIV-9 (JS value model, message-only):** the wrong-class message ending in JS stack frames (`ESC-4.4-2.md` item 3).
  - **DIV-9 (JS value model, message-only):** the test-double notices and deprecations (`ESC-4.7-1.md` item 3).

  Read each ruling for the exact wording.
- **Marker check.** An `adapted:DIV-<n>.<k>` marker, in an Expectations line's `adapted` field (stored as `DIV-<n>.<k>`) or as `// adapted:DIV-<n>.<k>` on an assertion line, fails the check when clause `<n>.<k>` does not exist in its record. No tool does this yet; Story 8.1 builds it.
- **Assertion-floor waiver (ESC-5.3-2).** A record lists, in a frontmatter `fewer_assertions: [<k>, ...]` list, the clauses whose adaptations may record fewer assertions than the Inventory. Only those clauses waive the harness's `FLOOR` failure. Quote the items (`["2"]`): YAML numbers turn `2.10` into `"2.1"`, which fails closed.
- **`PORTING.md`.** Every AD-26 construct row exists and is marked `decided`. The file also holds:
  - the idiom table and the test-adaptation rules;
  - the mechanical PHP→TS expression rule, including Blade templates. A 20-expression fixture checks it against committed expected TS;
  - the by-reference (`Ref<T>`) and exception mappings;
  - the frame-slot list (AD-5);
  - the `APP_KEY` form per consumer: Encrypter raw; signed URLs and closures use the config string with previous keys; cookie prefix raw;
  - the `Promise.all` allow-list (`Http.pool`, `Concurrency.run`, `Process.pool`, batch dispatch);
  - the DIV-10 PCRE conversion rule (`ESC-4.3-1.md` item 5);
  - the DIV-12 pair list, generated from `conformance/scans/div12-pairs.jsonl`.
- **Probes and spikes.**
  - **Bun probes** live under `conformance/probes/` and report supported or unsupported on Bun 1.4.3. An unsupported primitive raises an Escalation proposing a `deferred:` item or a workaround.
  - **OQ-4.** Temporal coverage of Carbon's needs; the ruling goes in `decisions/OQ-4.md`.
  - **OQ-8.** PHP `$2y$` hashes of 71/72/73/200-byte and multibyte passwords must verify with input truncated to 72 UTF-8 bytes. The inputs come from Story 3.4 Oracle requests; the result goes in `decisions/OQ-8.md`.
  - **OQ-12.** Whether security releases allow an out-of-cycle pin bump; the ruling goes in `decisions/OQ-12.md`.
- **Fidelity Review.**
  - **Checklist.** The Protected `conformance/review/fidelity.md` covers the full checklist. It cites `conformance/README.md#precedence` for Skip Reason precedence (ESC-5.2-1). It requires that error fixtures match the error Upstream expects. It requires that Oracle requests' `setup` and `exprs` match Upstream inputs or carry a recorded reason.
  - **Reviewers.** Two reviewer identities, neither the PR author, post PR reviews.
  - **Counting.** `story:check` counts only approvals by distinct identity.
- **Stop rules.** The rules go in `AGENTS.md`, outside its `bmad:context` block; there must be no `CLAUDE.md`. They list every FR-114 trigger. An Escalation stops only its own Test IDs. A test that needs a later Component is marked `blocked-by:<component>` and is never stubbed.
- **Pilot.**
  - **Sample.** At least 60 seeded Test IDs from the Support Collection, Arr, Str and Stringable tests. The translations must type-check, meet the assertion floor and pass Fidelity Review.
  - **Report.** `docs/porting/pilot-report.md` lists every rule hit, every ambiguity and each revision it caused.
  - **Translations.** Kept on the `pilot/porting` branch and never merged.
- **Phase 1 gate.** A manifest whose `epic` is in Phase 1 or later fails unless `main` has all of these:
  - `PORTING.md`, passing its gate check;
  - DIV-1..12;
  - the pilot report;
  - a Maintainer-signed `decisions/PHASE-0-EXIT.md`.

## Technical Decisions

- **Protected Paths.** `decisions/`, `PORTING.md`, `stories/`, `tools/`, `.github/`, `AGENTS.md` and most of `conformance/` are Protected (AD-16), so this Epic is Infrastructure work under Maintainer Code Owner review. `decisions/PHASE-1-EXIT.md` activates the `after-phase:1` protection of `packages/contracts`.
- **Parsers that already read DIV records.** Keep the records compatible with them:
  - **Harness floor waiver (`waiverFor` in `conformance/harness/harness.ts`).** It matches `adapted` as `DIV-<n>.<k>` (any non-space `<k>`) and reads `fewer_assertions` from YAML frontmatter.
  - **Boost `divergence.get` (`tools/boost-framework/src/tools.ts`).** A clause starts with `DIV-<n>.<k>` as the first token of a line. A list marker, heading `#`s or `**` may come before it, and `<k>` must be numeric, `[1-9]\d*`. The clause runs to the next clause start or heading.
  - **XT-boost real-repo test.** It requires every `decisions/DIV-*.md` to be named `DIV-<n>.md` and to have at least one clause that parser recognises.
  - **The dashboard (`tools/conformance-report/site.ts`).** It lists DIV-1..12 and links each one to its record.
- **Clause syntax.** The harness accepts a non-numeric `<k>` and Boost does not, so use numeric clause numbers only.
- **AD-26 rows** must all appear in `PORTING.md` as decided. They cover: named arguments as an options object; enums as classes; attributes as TC39 decorators; `__call` as generated delegators; no `__get` outside Model; `__toString`; `__invoke`; ArrayAccess as `offset*` plus `get()`; iterators; traits via `mixin`; `static::`; property and method pairs; facades; Macroable; real-time facades; no dynamic wheres; `Ref<T>`.
- **Toolchain and conventions.** Bun 1.4.3, `tsc --strict` 7.0.2, type-aware oxlint. Tools follow the existing CLI shape: `check` and `generate` subcommands, `--root`, fail-closed exits.

## Cross-Story Dependencies

- **8.1 first.** 8.2, 8.5 (checking markers against clauses), 8.7 and 8.8 all depend on 8.1's records.
- **8.2 before 8.7.** The pilot revises `PORTING.md`, and 8.8 requires that revision and the pilot report.
- **8.5 before 8.7.** The pilot's translations must pass a Fidelity Review.
- **8.4 needs Story 3.4's Oracle request flow** and signed fixtures for the bcrypt cases.
- **8.8 extends the Epic 1/5 checks** (ownership and manifests) and gates every Epic 9+ Story.
- **Epic 8 checkpoint.** The Maintainer also decides here on the deferred agent identity: a non-admin agent account, `Agent pushes` re-enabled, and ESC-5.8-1's bot bypass. 8.5's distinct-identity approvals cannot be truly verified while the orchestrator merges as the Maintainer.
