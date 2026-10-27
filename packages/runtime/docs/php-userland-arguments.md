# Userland arguments and returns

`bindPhpArguments(fn, parameters, args)` validates and coerces every parameter before body logic executes. A parameter has a `name`, PHP `type` declaration (`array`, `string`, `bool`, `int`, `float`, nullable forms and unions), and optionally an own `default` property. Omission selects the default; supplied null requires a nullable type. Errors identify the declaring PHP method and parameter. Internal builtin null coercion remains separate.

`phpReturn(fn, type, value)` applies weak return typing independently. Integers normalize safe bigint to number while retaining large bigint losslessly. Integral floats retain float identity, and class strings normalize to primitive strings. Array arguments are copied with PHP value semantics; objects retain handles.

Run this example with Bun in the workspace:

```ts
import { bindPhpArguments, phpReturn, jsonEncode } from '@xaravel/runtime/php';

function integer(...args: unknown[]): unknown {
  const [value, fallback, enabled] = bindPhpArguments('Example::integer', [
    { name: 'value', type: 'int' },
    { name: 'fallback', type: '?int', default: null },
    { name: 'enabled', type: 'bool', default: true },
  ], args);
  // Every supplied argument, including an unused fallback, is validated before this body.
  return phpReturn('Example::integer', '?int', enabled ? value : fallback);
}
console.log(jsonEncode(integer('9007199254740993'))); // 9007199254740993
console.log(jsonEncode(integer('12', '4', false))); // 4
```

The seam accepts an explicit positional argument list. Consumers implement their own public AD-26 options signatures before supplying that list; the binder adds no named dispatch metadata.

## Divergences

AD-9 / DIV-9 define bigint, integral float representation and by-value arrays. PHP fractional-float coercion deprecation notices are omitted, as with existing builtin coercions.

The exported `PhpParameter` interface describes each parameter's `name`, `type` and optional `default`; `PhpUserlandType` represents the PHP declaration string.

## Arr builtins

`array_is_list` checks consecutive integer keys in iteration order. `array_push` appends through `Ref`, preserves next-key history, and returns the resulting count. `Randomizer.shuffleArray` returns a secure, reindexed permutation without changing its input.

`http_build_query` encodes nested arrays and public object properties. `PHP_QUERY_RFC1738` uses plus for spaces; `PHP_QUERY_RFC3986` uses percent encoding and preserves tilde. The `HttpBuildQueryOptions` interface accepts `numericPrefix`, `argSeparator` and `encodingType`, in addition to the positional PHP signature.
