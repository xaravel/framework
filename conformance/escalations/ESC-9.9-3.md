---
test_ids:
  - XT-runtime-31
trigger: divergence
proposed: >-
  Option 1 (recommended): add a third case to DIV-12.8 for what the
  ESC-9.9-2 rule already does. When the base declares a private
  property and a trait mixed onto a subclass declares a public or
  protected property of the same name, the layer keeps the base's value
  in the one JS slot. PHP has two slots: code outside the base, and the
  using class's own methods, read the trait's default, while the base's
  own methods read the base's. Xaravel matches the base's methods and
  differs for every other reader. Option 2: apply the trait's default
  for a private base slot. Xaravel then matches outside readers and the
  using class, and differs for the base's own methods. Either option
  is a DIV-12.8 change, so the Maintainer rules on it.
evidence: >-
  PHP 8.5.11 probe: `trait SetsName { public $name = 'named'; } class
  Secret { private $name = 'parent'; function inner() { return
  $this->name; } } class UsesSecret extends Secret { use SetsName; }`;
  then `(new UsesSecret)->name` is `"named"` and `(new
  UsesSecret)->inner()` is `"parent"`. In Xaravel, `class UsesSecret
  extends mixin(Secret, SetsName)`, with `Secret` declaring `name`
  private in its property table, gives `"parent"` for both reads, as
  decisions/ESC-9.9-2.md directs ("A private property of the base ...
  takes the second branch"). DIV-12.8 lists only the no-table case and
  the unchanged-looking-write case, so this third difference is not
  recorded. Found in the Story 9.9 review pass after the ESC-9.9-2
  follow-up. XT-runtime-31 does not assert either value until it is
  ruled.
---

# ESC-9.9-3: a private base property and a trait property of the same name

The ESC-9.9-2 rule keeps the instance's value when the base's property table lists the name only as a private slot. In PHP, a private property and a subclass's public property of the same name are two separate slots. A JS object has one, so whichever value the layer keeps, one kind of reader sees something different from PHP.

The code does what the ruling says, which is option 1. The ruling's rationale says Option 3 "differs only in the two cases above", and DIV-12.8 lists those two. This case is a third one, so recording it, or choosing option 2 instead, changes DIV-12.8. That change is the Maintainer's. Until it is ruled, XT-runtime-31 asserts neither value for this case, and `packages/runtime/docs/traits-and-inject.md` names it as open.
