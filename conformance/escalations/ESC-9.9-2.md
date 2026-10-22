---
test_ids:
  - XT-runtime-31
trigger: divergence
proposed: >-
  Option 1 (recommended): record as a DIV clause what `mixin`'s layer
  constructor does now. A trait default never overwrites a key the
  instance already owns once the base constructor returns. Writes that
  `initialize<Trait>` makes in the base constructor (Model's constructor
  calls `initializeTraits`) therefore survive, and a trait that
  redeclares a base class's JS field keeps the base's value. Option 2:
  the trait default always overwrites. That matches PHP for defaults but
  clobbers initializer writes made in the base constructor, because JS
  assigns the layer's defaults only after `super()` returns, while PHP
  sets every default before any constructor runs.
evidence: >-
  PHP 8.5.11 probe: `trait Named { public $name = "named"; } class P {
  public $name = "parent"; } class C extends P { use Named; }`; then
  `(new C)->name` is `"named"`. The trait's default wins over the
  parent's. In Xaravel, `class C extends mixin(P, Named)` gives
  `"parent"`. `P`'s field is defined by `P`'s constructor before the
  layer runs, and the layer skips keys the instance already owns. That
  is the same guard that keeps writes made by an `initialize<Trait>`
  called from the base constructor. JS cannot tell the two apart after
  `super()` returns. XT-runtime-31 no longer asserts either value.
---

# ESC-9.9-2: a trait default and a base class field of the same name

In PHP, every property default exists before any constructor runs, and a trait's default takes the place of a parent's default of the same name. In JS, the layer that `mixin` builds can only assign trait defaults after the base constructor has returned. By then it cannot tell a base class field from a value an initializer wrote during that constructor.

The runtime keeps any key the instance already owns, which is option 1. That keeps Model-style initializer writes and diverges from PHP only when a trait redeclares a base class's field. This is a new Intentional Divergence, so it needs a ruling. XT-runtime-31 does not assert which value wins until then.
