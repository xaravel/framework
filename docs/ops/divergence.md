# Divergence Records and `adapted` markers

The Divergence Records `decisions/DIV-1.md` to `decisions/DIV-12.md` hold the Intentional Divergences of PRD §5.2 (Story 8.1; FR-8, FR-113, AD-15). Each record states its test-adaptation rule as numbered clauses, and every `adapted` marker must cite one of them. The records are Protected (AD-16): they change only through a Maintainer-approved Infrastructure Story, and a new or changed divergence goes through an Escalation (FR-114). There is no DIV-13.

## Check

```sh
bun run divergence:check [--root <dir>]
```

`divergence:check` (`tools/divergence/divergence.ts check`) validates the records, then every marker against them. CI runs it in the required `check` job, after `expectations:reasons`.

**Record rules.** One violation per problem, naming the file:

- `decisions/DIV-<n>.md` exists for each n in 1..12 (`decisions/DIV-7.md: missing Divergence Record`).
- No other `decisions/` name matches `/^div/i`. `DIV-13.md`, `DIV-02.md` and `div-5.md` are each `<file>: not a Divergence Record name (DIV-1..DIV-12)`.
- The YAML frontmatter parses, `div` equals n, `title` is a non-empty string, `cites` and `sources` are lists of strings, and each `sources` file exists.
- The body has `## Rationale`, `## Behaviour` and `## Adaptation clauses`.
- There is at least one clause, no clause number repeats, and the clauses are numbered 1..m in file order.
- `fewer_assertions` is absent or a list. Each item is a quoted string `<k>` naming an existing clause. An unquoted number fails, because YAML reads `2.10` as `2.1`.

**Marker rules.** A marker is `DIV-<n>.<k>` (`/^DIV-([1-9]\d*)\.([1-9]\d*)$/`) and names an existing clause:

- Every non-null `adapted` in `conformance/expectations/`. A broken one is `<shard>:<line>: <id> × <variant>: adapted <v>: not DIV-<n>.<k>`, or `...: clause does not exist`. Only a `pass` line may carry `adapted` (conformance/README.md); on any other status it is `...: adapted <v>: only a pass line may carry adapted`. A shard that is not valid JSON is one violation pointing at `bun run expectations:check`; run that first.
- Every `adapted:` in a `//` or `/* */` comment in a Ported Test (`packages/*/tests/ported/**/*.test.ts`), all of them on each line, from the line's first `//` or `/*` on. The token is what follows `adapted:` and any blanks, without a trailing `*/`; it must be exactly `DIV-<n>.<k>`, so `adapted: DIV-3.1` counts and an empty token fails. A broken one is `<file>:<line>: adapted:<token>: not DIV-<n>.<k>`, or `...: clause does not exist`.

**Output.** Violations go to stderr, one per line. On success it prints `Divergence OK: <r> record(s), <c> clause(s); <e> Expectations marker(s), <p> assertion marker(s) checked.`

Exit codes: 0 pass, 1 violations or any failure, 2 usage error.

The frontmatter and clause parsers are Boost's (`parseFrontmatter` in `tools/boost-framework/src/data.ts`, `divergenceClauses` in `tools/boost-framework/src/tools.ts`), imported rather than copied. So "the clause exists" means the same thing to this check, to Boost's `divergence.get` and to the dashboard.

## Record shape

```markdown
---
div: 11
title: "Long-lived application"
cites: ["AD-5", "AD-25", "AD-13"]
sources: []
fewer_assertions: []
---

# DIV-11: Long-lived application

## Rationale

## Behaviour

## Adaptation clauses

- **DIV-11.4** Job timeouts: no pcntl; job timeouts are enforced by the supervisor process,
  which kills the worker child (AD-13). Upstream timeout tests run against a spawned
  fixture app and are marked `adapted:DIV-11.4`.
```

- `title` is the bold title of the record's PRD §5.2 bullet.
- `cites` lists the ADs the record follows (`[]` when none).
- `sources` lists the `decisions/ESC-*.md` rulings whose clauses it carries (`[]` when none).
- Each clause is one list item, `- **DIV-<n>.<k>** <text>`, with a numeric `<k>`. Continuation lines are indented. A clause runs to the next clause start or heading, so keep `## Adaptation clauses` last and put no heading inside it. No other line of the record may start with `DIV-<n>.<k>`.

## Adding a clause

Clauses are append-only. A new clause takes the next number, m + 1. An existing clause is never renumbered or reused, because Expectations lines and Ported Tests cite it by number. A closed clause stays in the record, never removed or renumbered: its text then says which Story closed it, and that Story removes the markers citing it. A clause that owes its existence to an Escalation ruling cites the ruling, for example `(ESC-4.3-1 item 9)`, and the ruling's file goes into `sources`.

## The assertion-floor waiver

`fewer_assertions` lists the clauses whose adaptations may record fewer assertions than the Inventory (ESC-5.3-2, FR-113). The harness waives the `FLOOR` failure for an Expectations line exactly when its `adapted` is `DIV-<n>.<k>` and that record's list contains `"<k>"` ([harness.md](harness.md)). Every record ships with `fewer_assertions: []`. Adding an item weakens the grader, so it needs an approved Escalation.
