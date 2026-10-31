// The package-internal write of a Type's default (Deserializer::applyCommon). Upstream assigns `$this->default` through
// `(fn () => $this->default = $schema['default'])->call($type)`, a closure bound into the type's scope, because each
// concrete Type types its own `default()` setter (`string`, `int|float`, `array`, …). The port's state for Upstream's
// `$default` is `defaultProperty` (DIV-12.2), so each Type answers `[ASSIGN_DEFAULT](value)`, which sets it to a PHP
// by-value copy of the value. The symbol is not exported from the package index.

/** The key of a Type's internal default setter: PHP's `Closure::call` into the Type's scope. Package-internal. */
export const ASSIGN_DEFAULT: unique symbol = Symbol("xaravel.json-schema.assignDefault");
