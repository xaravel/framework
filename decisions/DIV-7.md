---
div: 7
title: "Discovery without reflection"
cites: ["AD-10"]
sources: []
fewer_assertions: []
---

# DIV-7: Discovery without reflection

## Rationale

Laravel discovers event listeners, policies and commands by reflecting on PHP types at run time. TypeScript erases those types, so discovery cannot read them.

## Behaviour

- Event listeners, policies and commands are found through file conventions and explicit registration, not runtime type reflection.

## Adaptation clauses

`fewer_assertions` is empty, so no clause of this record waives the assertion floor (FR-113). Adding an item needs an approved Escalation (ESC-5.3-2, FR-113); an item is the quoted `<k>` of an existing clause, for example `["2"]`. Clauses are append-only: a new clause takes the next number, and an existing clause is never renumbered.

- **DIV-7.1** Explicit registration replaces reflection discovery. Where an Upstream test relies on run-time type reflection to discover an event listener, policy or command, the Ported Test makes the same item discoverable through the file convention or registers it explicitly. The assertions on what is discovered are unchanged.
