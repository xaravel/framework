---
test_ids:
  - XT-contracts-5
trigger: contract
proposed: >-
  Option 1 (recommended): the method of a contract whose implementations
  are the callbacks AD-6's Derivation makes async (validation rule objects:
  `Validation\Rule::passes`, `Validation\ValidationRule::validate`,
  `Validation\InvokableRule::__invoke`; listeners, pipes and job handlers
  where a contract declares them) returns a Promise and carries
  `@asyncRoot callback`, because AD-6 lets each such callback be async and
  the caller awaits it ("Callbacks passed to async APIs may be async, and
  are awaited in registration order", DIV-1). The F-9 check of
  `conformance/review/fidelity.md` would then read "callback" as covering
  a method that is itself such a callback, a wording change only the
  Maintainer makes. Option 2: such methods return `Promise<T>` with no tag
  and the async-surface tool accepts an untagged Promise on a method of a
  listed callback contract. Option 3: they stay sync, and async rules are
  written only as closures, which drops DIV-1's "rule objects".
evidence: >-
  AD-6's Derivation says a method is async if it "accepts a callback that
  DIV-1 allows to be async", and names "validation closures and rule
  objects" among those callbacks. Story 10.2 ports
  `Illuminate\Contracts\Validation\ValidationRule::validate`,
  `Rule::passes` and `InvokableRule::__invoke`, the rule objects' own
  methods, as `Promise`-returning with `@asyncRoot callback`. The Story
  10.2 Fidelity Review's second pass (tree
  70d1c9a929e5a71c857684270e6c910bf63a20ab) rejected that on F-9: the
  method's only callback, `fail`, is sync, and the method is itself the
  callback, which the "callback" tag as written does not cover. A sync
  rule-object method would make every async rule object impossible, which
  DIV-1 allows, so the tag's meaning for this case needs a ruling.
---

# ESC-10.2-6: how is the method of an async callback contract tagged?

AD-6 makes validation rule objects one of the callbacks that may be async, so a validator awaits them. The rule object's own method (`ValidationRule::validate`, `Rule::passes`, `InvokableRule::__invoke`) is that callback: it takes no async callback itself and reaches no Driver root. The `@asyncRoot callback` tag, as F-9 reads it, covers a method that accepts such a callback, not the callback itself.

The recommended fix, Option 1, reads the tag as covering both and says so in the F-9 evidence notes. It needs the Maintainer, since F-9's wording changes only through the Maintainer. This stops XT-contracts-5.
