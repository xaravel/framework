---
test_ids:
  - XT-contracts-5
trigger: contract
proposed: >-
  Option 1 (recommended): `Illuminate\Contracts\Validation\Validator`
  declares its inherited `getMessageBag()` again as `getMessageBag():
  Promise<MessageBag>` with `@asyncRoot callback`, as AD-6 requires of a
  method that runs validation rules on some path. Since a child cannot
  make an inherited method async, and a `MessageBag | Promise<MessageBag>`
  return is forbidden (AD-6),
  `Illuminate\Contracts\Support\MessageProvider::getMessageBag()` becomes
  `Promise<MessageBag>` for every provider. Option 2: MessageProvider stays sync,
  and Validator's `getMessageBag()` returns the bag of the last completed
  run (an empty bag before `validate()`, `passes()`, `fails()` or `errors()`
  has been awaited), recorded as a new DIV-1 clause.
evidence: >-
  `Illuminate\Contracts\Validation\Validator extends MessageProvider`, whose
  only method is `getMessageBag()`. In Upstream,
  `Illuminate\Validation\Validator::getMessageBag()` returns `$this->messages()`,
  and `messages()` calls `$this->passes()` when no messages exist yet
  (`conformance/upstream/framework/src/Illuminate/Validation/Validator.php`,
  around line 1169), so it runs the validation rules. AD-6 makes rule
  objects and validation closures async ("a method that is async on any
  path is async on all paths"), so Story 10.2 ports `errors()`, which takes
  the same path, as `Promise<MessageBag>`. `getMessageBag()` is inherited
  from MessageProvider, which is sync for every other provider
  (`Support\MessageBag`, `ViewErrorBag` sources, mailables), and TypeScript
  does not let `Validator` redeclare it with an incompatible
  `Promise<MessageBag>` return while it extends MessageProvider. Raised by
  two Story 10.2 code reviewers.
---

# ESC-10.2-3: `Validator::getMessageBag()` runs async rules, but its parent `MessageProvider` is sync

Upstream's `Validator::getMessageBag()` runs the rules when the validator has not run yet, so under AD-6 it is async. It is declared by `MessageProvider`, which every other provider implements synchronously, and a TypeScript child interface cannot make an inherited method async.

Option 1 makes `MessageProvider::getMessageBag()` async for all providers; Option 2 keeps it sync and records that a validator's bag is empty until a run has been awaited. Either changes the async surface or adds a divergence, so it needs a ruling. This stops XT-contracts-5. Story 10.2 ports `Validator` with the inherited sync `getMessageBag()` until the ruling.
