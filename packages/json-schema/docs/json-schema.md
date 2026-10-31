# JSON Schema

`@xaravel/json-schema` ports Laravel 13's `illuminate/json-schema` component: the fluent `JsonSchema` builder that describes a JSON Schema in code, the `Serializer` that turns it into the JSON Schema array, and the `Deserializer` that builds the Types back from such an array. Every class is registered under its Upstream FQCN and exported from the package root. The package is synchronous throughout: no member returns a Promise (AD-6), so its `async-surface.json` is `[]`.

Laravel has no standalone JSON Schema page; the builder is documented where Laravel uses it, in the [MCP page's tool input schemas](https://laravel.com/docs/13.x/mcp#tool-input-schemas). This page follows that usage, and adds the rest of the component's API.

## Building a schema

`JsonSchema` has one static builder per JSON Schema type. Each returns a Type, whose modifiers return the Type itself, so calls chain as in Laravel:

```ts
import { JsonSchema } from "@xaravel/json-schema";

const schema = JsonSchema.object({
  location: JsonSchema.string().description("The location to get the weather for.").required(),
  units: JsonSchema.string().enum(["celsius", "fahrenheit"]).default("celsius"),
}).title("Weather request");
```

The builders are `JsonSchema.object(properties)`, `JsonSchema.array()`, `JsonSchema.string()`, `JsonSchema.integer()`, `JsonSchema.number()`, `JsonSchema.boolean()`, `JsonSchema.union(types)` and `JsonSchema.anyOf(schemas)`. Laravel serves them through `JsonSchema::__callStatic`, which forwards to a new `JsonSchemaTypeFactory`; the port declares them as explicit static methods that do the same (see [Divergences](#divergences)), and keeps `JsonSchema.__callStatic(name, args)` for a builder named at run time. `JsonSchemaTypeFactory` implements the `Illuminate\Contracts\JsonSchema\JsonSchema` contract from `@xaravel/contracts/json-schema`, the `$schema` an MCP tool's `schema()` method receives.

`object(properties)` takes the properties keyed by name, a plain object (or a `PhpArray` when a name is integer-like, such as `"1"`), or a closure that receives the factory and returns them:

```ts
JsonSchema.object((schema) => ({
  name: schema.string().required(),
  age: schema.integer().min(0),
}));
```

`anyOf(schemas)` takes a list of Types, or a closure that returns one. `union(types)` takes a list of type names (`"string"`, `"integer"`, `"number"`, `"boolean"`, `"object"`, `"array"`); a `"null"` member makes the union nullable, duplicates are dropped in order, and any other name throws `InvalidArgumentException` with Upstream's message, `Unsupported JSON Schema type [wat] in a multi-type union.`

### Modifiers

Every Type (`Type` is their abstract base) has:

- `title(value)` and `description(value)`;
- `required(required = true)`: the property is listed in its parent object's `required`;
- `nullable(nullable = true)`: the type becomes `[<type>, "null"]` (an `anyOf` gains a `{"type": "null"}` branch);
- `enum(values)`: a list of allowed values, or a `BackedEnum` class (or its registered FQCN string), whose cases' values are taken; any other class throws `InvalidArgumentException('The provided class must be a BackedEnum.')`.

Each concrete Type adds its own:

| Type | Modifiers |
| --- | --- |
| `StringType` | `min(length)`, `max(length)`, `pattern(regex)`, `format(format)`, `default(string)` |
| `IntegerType` | `min(value)`, `max(value)`, `multipleOf(value)`, `default(int)` |
| `NumberType` | `min(value)`, `max(value)`, `multipleOf(value)`, `default(number)` |
| `BooleanType` | `default(bool)` |
| `ArrayType` | `items(type)`, `min(count)`, `max(count)`, `unique(unique = true)`, `default(array)` |
| `ObjectType` | `withoutAdditionalProperties()`, `default(array)` |
| `UnionType` | `types()`, the member names |
| `AnyOfType` | `schemas()`, the member Types |

An array given to a Type, or returned by `types()` or `schemas()`, is a copy, as PHP passes arrays by value.

## Serializing

`toArray()` returns the JSON Schema array, and `toString()` (also `String(schema)` and a template literal) returns it as pretty-printed JSON, Laravel's `json_encode($schema->toArray(), JSON_PRETTY_PRINT)`, byte for byte. Both go through `Serializer.serialize(type)`, which writes the keys in Laravel's order, leaves out unset values, turns `nullable` into the `null` type and `required` children into the parent's `required` list. A Type class the Serializer does not know throws `RuntimeException('Unsupported [<class>] type.')`.

```ts
JsonSchema.object({ age: JsonSchema.integer().min(0).required() }).title("User").toArray();
// { title: "User", properties: { age: { minimum: 0, type: "integer" } }, type: "object", required: ["age"] }
```

## Deserializing

`JsonSchema.fromArray(schema)`, Laravel's `JsonSchema::fromArray`, builds the Types back from a JSON Schema array, through `Deserializer.deserialize(schema)`:

```ts
const type = JsonSchema.fromArray({
  type: "object",
  properties: { name: { type: "string", minLength: 1 } },
  required: ["name"],
});

type.toArray(); // the same array
```

It reads the subset of JSON Schema the builder writes:

- `type`: a name, or a list of names. A list with one name besides `"null"` is that type, nullable when `"null"` is present (so `["string"]` comes back as `"string"`); two or more names make a `UnionType`, which may not carry type-specific keywords.
- Without `type`, the type is inferred: `properties`, `additionalProperties` or `required` make an object, `items`, `minItems`, `maxItems` or `uniqueItems` an array, a homogeneous `enum` its scalar type (integers and floats together are a number), `minLength`, `maxLength`, `pattern` or `format` a string, and `minimum`, `maximum` or `multipleOf` a number.
- The keywords of each type: `properties`, `required` (property names stay strings, `"1"` included) and `additionalProperties: false`; `items` (one schema), `minItems`, `maxItems` and `uniqueItems`; `minLength`, `maxLength`, `pattern` and `format`; `minimum`, `maximum` and `multipleOf` (an integer type's must be integral; a number keeps a float a float); and `title`, `description`, `enum` and `default` on every type.
- An `anyOf` of exactly one schema plus one or more `null` branches (`{"type": "null"}`) is that schema, nullable, merged with its sibling keys; any other `anyOf` (several schemas, one schema with no `null` branch, only `null` branches, or none) is an `AnyOfType`, nullable when it has a `null` branch. A `oneOf` must be one schema plus a `null` branch, read the same way as that `anyOf`.
- A local `$ref` (`#`, `#/$defs/<name>`, `#/definitions/<name>`, any JSON pointer into the root) is resolved, with its sibling keys taking precedence.
- Unknown keywords (`$schema`, `$comment`, `readOnly`, …) are ignored.

Anything else throws `InvalidArgumentException`, with Laravel's messages:

| Schema | Message |
| --- | --- |
| no `type` and nothing to infer it from | `Unable to determine the JSON Schema type for the given schema.` |
| a `type` it does not support | `Unsupported JSON Schema type [<name>].` |
| a union member it does not support | `Unsupported JSON Schema type [<name>] in a multi-type union.` |
| type-specific keywords on a union | `Type-specific keywords [<keywords>] are not supported on a multi-type JSON Schema union.` |
| a `oneOf` other than one schema plus a `null` branch | `Only a nullable "oneOf" (a single schema plus a "null" branch) is supported.` |
| a branch that contradicts its sibling keys | `Conflicting [<key>] between a "<keyword>" branch and its sibling keys.` |
| a boolean schema as a property or an `anyOf` branch | `Unable to represent the schema for property [<name>]; boolean schemas are not supported.`, `Unable to represent the schema for an anyOf branch; boolean schemas are not supported.` |
| tuple or boolean `items` | `Tuple and boolean JSON Schema "items" are not supported.` |
| a non-numeric bound | `The JSON Schema [<keyword>] constraint must be a number.` |
| a fractional bound on an integer | `The JSON Schema integer constraint [<value>] must be an integer.` |
| `default: null` | `A null JSON Schema [default] is not supported.` |
| a remote `$ref` | `Unable to resolve non-local JSON Schema $ref [<ref>].` |
| a `$ref` that points nowhere, or not to a schema | `Unable to resolve JSON Schema $ref [<ref>].`, `The JSON Schema $ref [<ref>] does not point to a schema.` |
| a `$ref` cycle | `Circular JSON Schema $ref [<ref>] detected.` |
| more than 20,000 fragments | `The JSON Schema is too large to deserialize; it expands beyond [20000] fragments.` |

## Divergences

The API and its behaviour are Laravel's. These Divergence Records change how the port spells some of it:

- **DIV-12.22**, static methods reached through `__callStatic`: `JsonSchema.object()`, `array()`, `string()`, `integer()`, `number()`, `boolean()`, `union()` and `anyOf()` are explicit static methods that forward to a new `JsonSchemaTypeFactory`, where Laravel declares them only as `@method static` tags; calls behave as Laravel's.
- **DIV-12.2**, methods that share a name with state: each Type keeps Laravel's method names (`title()`, `enum()`, `default()`, `required()`, `nullable()`, `items()`, `multipleOf()`, `types()`, `schemas()`, …), and the state Laravel keeps in same-named properties is read through those methods and the serialized array, not as properties.
- **DIV-9.2**, PHP arrays: a schema array, a property list or an `enum` is a JS `Array` when it is a list, a plain object when every key is a non-integer-like string, and a `PhpArray` otherwise, so an object whose property names are integer-like (`"1"`, `"4"`) takes a `PhpArray`; `required` still lists the names as strings.
- **DIV-9.4**, int and float: an integral float such as Laravel's `0.0` is written `float(0)` with the runtime's float marker, so `toArray()` holds a PHP float where Laravel's does (`toString()` writes it `0`, as Laravel's `json_encode` does without `JSON_PRESERVE_ZERO_FRACTION`), and `fromArray` keeps it a float:

  ```ts
  import { float, isFloat } from "@xaravel/runtime";

  const schema = JsonSchema.number().min(float(0));
  isFloat(schema.toArray()["minimum"]); // true
  isFloat(JsonSchema.fromArray(schema.toArray()).toArray()["minimum"]); // true
  ```
