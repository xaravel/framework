---
test_ids:
  - XT-runtime-24
  - XT-runtime-25
trigger: contract
proposed: >-
  (1) Non-public properties and defaults. Option 1a (recommended): a ported
  class may declare its PHP property table as a static
  `[Symbol.for('xaravel.php.properties')]` list of `{ name, visibility:
  'public' | 'protected' | 'private', default }` in declaration order,
  which generators emit from Upstream. `phpSerialize`'s default path then
  writes `\0*\0name` for protected and `\0<declaring FQCN>\0name` for
  private, as PHP does. `phpUnserialize` starts the rebuilt object from
  the declared defaults before it applies the payload, as PHP's
  `object_init_ex` does, so a property `__sleep` dropped is never
  `undefined`. A class without the list keeps today's public-only
  behaviour. Story 9.7 lands it as a follow-up on `story/9.7`, within
  `packages/runtime/**`. Option 1b: no metadata; each port that needs
  non-public bytes hand-writes `__serialize` / `__unserialize`. Laravel
  classes do not have these methods, so this adds API to the port, and
  the decision is the Maintainer's.
  (2) Binary strings. Option 2a (recommended): keep a string as a JS
  string (AD-9). An `s:` value that is not valid UTF-8, or a JS string
  with a lone surrogate, throws a `TypeError` naming the limit. A
  consumer that must carry bytes (Encryption, Cache) raises its own
  Escalation with its first Upstream test that needs them. Option 2b: a
  byte-string value type in AD-9, which changes the spine and is the
  Maintainer's.
  (3) Enum and `Serializable` payloads. Option 3a (recommended): until
  an AD defines a ported enum model, `E:` payloads stay unsupported and
  `phpUnserialize` returns `false` for them, as PHP does for an enum it
  cannot load. A `C:` payload is read as PHP 8.5 reads one for a class
  with no `unserialize()` (an incomplete or empty object, its data
  dropped; XT-runtime-25's Oracle rows), and no JS `unserialize` method
  is called. The Story that first ports a backed enum or a `Serializable`
  class adds `E:` / `C:` hooks to both functions, in
  `packages/runtime/**`, with Oracle rows.
  (4) The Closure error. Option 4a (recommended): `phpSerialize` throws
  an `Error` with PHP's message `Serialization of 'Closure' is not
  allowed`. Story 9.10, which ports PHP's `Exception` in the same
  package, switches it to `Exception` and asserts the class in
  XT-runtime-24.
evidence: >-
  Story 9.7 AC 1 (`epics.md` line 3130): "Given Oracle fixtures of
  `serialize()` over ... objects of registered classes ... Then the
  output is byte-identical". PHP writes a protected property as
  `s:4:"\0*\0b"` and a private one as `s:4:"\0A\0c"` (local PHP 8.5.11:
  `serialize(new A)` with `public $a; protected $b; private $c` gives
  `O:1:"A":3:{s:1:"a";i:1;s:4:"\0*\0b";i:2;s:4:"\0A\0c";i:3;}`). TS
  `protected` / `private` are erased at run time. ESC-4.1-1's props
  protocol (`decisions/ESC-4.1-1.md`) returns public props only, which is
  how the grader decodes Oracle objects
  (`packages/assert/tests/xaravel/oracle-values.ts`, hidden props kept
  apart). So no current contract tells the codec a property's
  visibility, or its default value: `Object.create(Class.prototype)` runs
  no field initializer. AD-9.1 forbids returning `undefined`. AD-9 models
  a PHP string as a JS string and has no byte string. No AD defines
  ported enums. Story 9.10's ACs port the exception hierarchy but do not
  name the codec. The Story ships with every XT-runtime-24..26 row
  passing against the signed Oracle fixtures: the fixture classes use
  public properties, `__serialize` with mangled keys, and `__sleep`. The
  four points above are recorded in
  `_bmad-output/implementation-artifacts/spec-9-7-phpserialize-phpunserialize-codec.md`
  (Design Notes, Review Triage Log).
---

# ESC-9.7-1: the codec's PHP property table, byte strings, enums and the Closure error

Story 9.7 makes `phpSerialize` / `phpUnserialize` byte-identical to PHP for every value the AD-9 model holds and for objects whose PHP form is public properties, `__serialize` or `__sleep`. Four parts of PHP's format need a contract that no AD gives today: the visibility and default value of a declared property, a string that is not UTF-8, an enum case, and the class of the Closure error. This Escalation asks for a ruling on each. AC 1 and AC 2 hold for objects with non-public default properties only once item (1) is ruled.
