<!-- bmad:context -->
<!-- Verified 2026-10-16 against 158241f. Managed by bmad-project-context; edits inside this block are replaced on refresh. Keep anything you want preserved outside the markers. -->

## Xaravel

A TypeScript port of Laravel 13 (`laravel/framework` v13.37.0) to Bun, server-rendered for htmx 4. Laravel's own test suite, ported to `bun test`, is the specification. Status: planning, no code yet. The contract is `_bmad-output/specs/spec-xaravel/SPEC.md` and its companions; the work breakdown is `_bmad-output/planning-artifacts/epics.md`.

## Policy

- Never push to `main`; open a PR. The `Protect main` ruleset lets org admins bypass, so it will not stop you.
- Branch as `planning/<topic>` for planning and docs work, and `story/<story-id>` for Story work (AD-16).
- Never create a `CLAUDE.md` anywhere in this repo — Claude Code stops reading `AGENTS.md` when one exists. Put instructions here.
- Change `AGENTS.md` only when the Maintainer asks for that change; it is a Protected Path (AD-16).
- AD-1..AD-28 in the spine bind every change. When a task conflicts with an AD, or needs a divergence outside DIV-1..12, stop and raise an Escalation (AD-16) — never decide it locally.
- Never weaken the grader: no removed assertions, weakened expected values, or new skips without a DIV clause or an approved Escalation. Never stub, fake, or partially implement another Component to pass a test; mark it `blocked-by:<component>`.
- A Story edits only `packages/<its component>/**`, its own Expectations lines, `conformance/oracle-requests/<story-id>.jsonl` and its own Escalations. Protected Paths (AD-16 list) change only through a Maintainer-approved Infrastructure Story.
- Never publish to npm or handle publish credentials; only the Maintainer releases, from CI (AD-18). Never commit secrets or an `APP_KEY`.
- The name is Xaravel (`xaravel`) everywhere. Describe it only as "a TypeScript port of Laravel", never as affiliated with Laravel; no Laravel logo. Every `LICENSE` keeps Laravel's MIT notice beside Xaravel's.

## Where things are

- Architecture decisions: `_bmad-output/planning-artifacts/architecture/architecture-xaravel-2026-10-16/ARCHITECTURE-SPINE.md`. Before writing code in a package, read the ADs its row in the spine's Capability → Architecture Map names.
- Terms (Test ID, Variant, Skip Reason, Protected Path, Escalation, DIV-n): PRD §3 Glossary, `_bmad-output/planning-artifacts/prds/prd-xaravel-2026-10-15/prd.md`.
- Laravel reference research: `_bmad-output/planning-artifacts/briefs/brief-xaravel-2026-10-15/research/`.

## Running and verifying

- Use only the decided toolchain (spine § Stack): Bun 1.4.3 (pinned in `.bun-version`), TypeScript 7.0.2 with `tsc --strict`, oxlint 1.88.0 with oxlint-tsgolint, and `bun test` under the conformance harness. Never substitute Node, npm, pnpm, Jest, Vitest, ESLint or Prettier.
- Claude Code 2.1.277 or later is required to load this file.
- TODO (Epics 1–5): the harness becomes the test entry point — `bun run harness --fast --story <story-id>` while iterating, `bun run harness` for a full run. Replace this line with verified invocations once the scripts exist.

## Conventions that differ from defaults

- Keep Laravel's class, method, option and exception names and messages. Files are `src/<Upstream sub-path>/<ClassName>.ts`, one public class per file, named exports only (AD-3).
- Class identity is `fqcn()`, never `constructor.name`; every framework class file ends with `registerClass('<Upstream FQCN>', X)` (AD-10).
- `null` is the only absent value; never return `undefined` (AD-9).
- IO is async only behind the async-root Driver contracts; keep everything else sync, and never return `T | Promise<T>` (AD-6).
- Per-request state goes in Scope Frame slots (`@xaravel/runtime/scope`), never in singleton fields or module variables (AD-5).
- Encode with `jsonEncode` / `phpSerialize` from `@xaravel/runtime/php`, never `JSON.stringify` on framework values (AD-23).
- Decorators are TC39; never set `experimentalDecorators` (AD-4). Bun's `.env` autoload is off; env files are read only by Xaravel's loader.
- Ported Tests use only `portedTest(...)` and `@xaravel/assert`, never `expect` from `bun:test`; mark each changed assertion `// adapted:DIV-<n>.<clause>` (AD-15).

<!-- /bmad:context -->
