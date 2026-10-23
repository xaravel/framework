---
decision: approved
decided_by: Maintainer
date: 2026-10-23
escalation_sha256: "d614c07e3b3bef92d3df4023956f6bded03da263c6eeb552a9cedc30bcd50e3a"
---

# ESC-10.2-3: approved, option 2 (`getMessageBag()` stays sync; a validator's bag is its last completed run's), as DIV-1.4

Option 2 is approved, recorded as clause **DIV-1.4**. Option 1 is not taken: it would make `MessageProvider::getMessageBag()` a Promise for every provider. That would change `MessageBag`, the views' `$errors` and every mailable or provider that only returns a bag it already holds, all to cover one lazy path in one implementation.

## The change

- **The contract.** `Illuminate\Contracts\Support\MessageProvider::getMessageBag()` stays sync for every provider, `Validator` included.
- **The behaviour.**
  - `Validator::getMessageBag()` returns the bag of the last completed `validate()`, `passes()`, `fails()` or `errors()` run, and an empty bag before any run has been awaited.
  - Upstream instead runs the rules on first access (`messages()` calls `passes()`). That lazy run is async under AD-6, so a sync accessor cannot perform it.
  - `errors()` stays the async form (`Promise<MessageBag>`), which runs the rules as Upstream does.
- **Ported Tests.** A Ported Test that reads a validator's message bag before running it awaits `passes()` first. Each such line is marked `// adapted:DIV-1.4`.

## Changes in this ruling's PR

- **`decisions/DIV-1.md`:**
  - clause DIV-1.4;
  - this Escalation added to `sources`.
- The Validation Story builds the behaviour. Story 10.2's port already keeps the inherited sync `getMessageBag()`.
