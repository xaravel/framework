---
div: 10
title: "Regular expressions"
cites: []
sources: []
fewer_assertions: []
---

# DIV-10: Regular expressions

## Rationale

Xaravel runs on JavaScript's regular-expression engine, not PCRE. Some PCRE features have no `RegExp` equivalent, so behaviour that depends on them does not exist in Xaravel.

## Behaviour

- User-supplied patterns, such as the `regex` validation rule and `Str.match` / `Str.replaceMatches`, are JavaScript `RegExp`, not PCRE.
- `PORTING.md` documents the PCRE features that have no equivalent, and the PCRE conversion rule (Story 8.2, ESC-4.3-1 item 5).

## Adaptation clauses

`fewer_assertions` is empty, so no clause of this record waives the assertion floor (FR-113). Adding an item needs an approved Escalation (ESC-5.3-2, FR-113); an item is the quoted `<k>` of an existing clause, for example `["2"]`. Clauses are append-only: a new clause takes the next number, and an existing clause is never renumbered.

- **DIV-10.1** Upstream tests that depend on PCRE-only features are skipped as `intentional-divergence:DIV-10`. A pattern that has a `RegExp` equivalent is converted by the rule in `PORTING.md`, and its test is ported, not skipped.
