// Ported from Laravel v13.37.0 framework/tests/JsonSchema/TypeTest.php.
//
// Upstream validates each schema with `opis/json-schema`; the port validates it with `ajv` (draft 2020-12 build,
// `ajv/dist/2020`, Opis 2.x's default draft) and `ajv-formats`, behind Upstream's own `makeValidator`,
// `assertValidOnJsonSchema` and `assertNotValidOnJsonSchema` helpers (decisions/ESC-16.1-1.md). The schema is
// `jsonDecode((string) $schema)`; the data is the PHP value the row holds, a `(object) [...]` as the runtime's
// `stdClass`, with an integral float's marker (DIV-9.4) read as the number it marks, as Opis reads a PHP float. Every
// assertion, expected value and dataset row is Upstream's. ajv runs with `strict: false` and `multipleOfPrecision: 12`
// (decisions/ESC-16.1-5.md), validator settings under which every one of the 172 rows matches the Oracle's Opis
// verdict; a row where ajv's verdict still differed would raise its own Escalation, never be adapted.
import { portedTest, TestCase } from "@xaravel/assert";
import { float, InvalidArgumentException, jsonDecode, PhpFloat, registerTestClass, stdClass, toPhpString } from "@xaravel/runtime";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { JsonSchema, type JsonSchemaTypeFactory, type Type } from "../../../../../src";
import { IntBackedEnum } from "./Fixtures/Enums/IntBackedEnum";
import { StringBackedEnum } from "./Fixtures/Enums/StringBackedEnum";
import { UnitEnum } from "./Fixtures/Enums/UnitEnum";

const FIXTURES = "Illuminate\\Tests\\JsonSchema\\Fixtures\\Enums\\";

/** A copy of `value` as the validator reads it: each PHP float's marker unwrapped to its number, arrays and objects walked. */
function validatorValue(value: unknown): unknown {
  if (value instanceof PhpFloat) {
    return Number(value);
  }
  if (Array.isArray(value)) {
    return value.map(validatorValue);
  }
  if (typeof value === "object" && value !== null) {
    const copy = Object.create(Object.getPrototypeOf(value) as object | null) as Record<string, unknown>;
    for (const [key, item] of Object.entries(value)) {
      copy[key] = validatorValue(item);
    }
    return copy;
  }
  return value;
}

class TypeTest extends TestCase {
  /**
   * Registers the enum fixtures under their Upstream FQCNs for each test, so `fqcn()` and a class-string lookup resolve
   * them. The dataset rows' `enum(<class>)` calls run at module load, before this, and read the class itself.
   */
  setUp(): void {
    registerTestClass(`${FIXTURES}IntBackedEnum`, IntBackedEnum);
    registerTestClass(`${FIXTURES}StringBackedEnum`, StringBackedEnum);
    registerTestClass(`${FIXTURES}UnitEnum`, UnitEnum);
  }

  static validSchemasProvider(): unknown[][] {
    return [
      // StringType
      [JsonSchema.string(), 'hello'],
      [JsonSchema.string().min(2), 'hi'],
      [JsonSchema.string().max(5), 'hello'],
      [JsonSchema.string().pattern('^foo.*$'), 'foobar'],
      [JsonSchema.string().default('x'), 'x'],
      [JsonSchema.string().enum(['draft', 'published']), 'draft'],
      // additional StringType cases
      [JsonSchema.string().min(0), ''], // empty allowed with min 0
      [JsonSchema.string().max(0), ''], // exactly zero length
      [JsonSchema.string().min(1).max(3), 'a'], // boundary at min
      [JsonSchema.string().pattern('^[A-Z]{2}[0-9]{2}$'), 'AB12'], // complex pattern
      [JsonSchema.string().enum(['', 'x', 'y']), ''], // enum including empty string
      [JsonSchema.string().enum(StringBackedEnum), 'one'], // string backed enum cases
      [JsonSchema.string().nullable(), null],
      [JsonSchema.string().nullable(false), ''],

      // IntegerType
      [JsonSchema.integer(), 10],
      [JsonSchema.integer().min(0), 0],
      [JsonSchema.integer().max(120), 120],
      [JsonSchema.integer().default(18), 18],
      [JsonSchema.integer().enum([1, 2, 3]), 2],
      [JsonSchema.integer().multipleOf(5), 10],
      [JsonSchema.integer().multipleOf(3), 9],
      [JsonSchema.integer().multipleOf(7), 0],
      // additional IntegerType cases
      [JsonSchema.integer().min(-5), -5], // negative boundary
      [JsonSchema.integer().max(10), 9], // below max
      [JsonSchema.integer().min(1).max(3), 3], // boundary at max
      [JsonSchema.integer().enum([0, -1, 5]), 0], // enum with zero
      [JsonSchema.integer().enum(IntBackedEnum), 1], // integer backed enum cases
      [JsonSchema.integer().default(0), 0], // default value
      [JsonSchema.integer().nullable(), null],
      [JsonSchema.integer().nullable(false), 0],

      // NumberType
      [JsonSchema.number(), 3.14],
      [JsonSchema.number().min(float(0)), float(0)],
      [JsonSchema.number().max(float(100)), 99.9],
      [JsonSchema.number().default(9.99), 9.99],
      [JsonSchema.number().enum([1, 2.5, 3]), 2.5],
      [JsonSchema.number().multipleOf(0.5), 2.5],
      [JsonSchema.number().multipleOf(3), 9],
      [JsonSchema.number().multipleOf(0.1), 0.3],
      // additional NumberType cases
      [JsonSchema.number().min(-10.5), -10.5], // negative boundary
      [JsonSchema.number().min(0).max(1), float(1)], // boundary at max
      [JsonSchema.number(), 5], // integers are numbers
      [JsonSchema.number().enum([float(0), 1.1]), float(0)],
      [JsonSchema.number().default(float(0)), float(0)],
      [JsonSchema.number().nullable(), null],
      [JsonSchema.number().nullable(false), float(0)],

      // BooleanType
      [JsonSchema.boolean(), true],
      [JsonSchema.boolean().default(false), false],
      [JsonSchema.boolean().enum([true, false]), true],
      // additional BooleanType cases
      [JsonSchema.boolean(), false],
      [JsonSchema.boolean().enum([true, false]), false],
      [JsonSchema.boolean().enum([true]), true],
      [JsonSchema.boolean().enum([false]), false],
      [JsonSchema.boolean().default(true), true],
      [JsonSchema.boolean().nullable(), null],
      [JsonSchema.boolean().nullable(false), false],

      // ObjectType
      [
          JsonSchema.object({
            name: JsonSchema.string().required(),
            age: JsonSchema.integer().min(21),
          }),
          Object.assign(new stdClass(), { name: 'Nuno', age: 30 }),
      ],
      [
          JsonSchema.object({ meta: JsonSchema.object().withoutAdditionalProperties() }),
          Object.assign(new stdClass(), { meta: new stdClass() }),
      ],
      [
          JsonSchema.object({ config: JsonSchema.object().default({ x: 1 }) }),
          Object.assign(new stdClass(), { config: Object.assign(new stdClass(), { x: 1 }) }),
      ],
      [
          JsonSchema.object({ status: JsonSchema.string().enum(['draft', 'published']) }),
          Object.assign(new stdClass(), { status: 'published' }),
      ],
      // additional ObjectType cases
      [
          JsonSchema.object([]),
          new stdClass(), // empty object allowed
      ],
      [
          JsonSchema.object({ name: JsonSchema.string().required() }),
          Object.assign(new stdClass(), { name: 'John' }), // only required present
      ],
      [
          JsonSchema.object({ meta: JsonSchema.object().withoutAdditionalProperties() }),
          new stdClass(), // optional property omitted
      ],
      [
          JsonSchema.object({ name: JsonSchema.string() }),
          Object.assign(new stdClass(), { name: 'Jane', extra: 1 }), // additional properties allowed by default
      ],
      [
          JsonSchema.object({ age: JsonSchema.integer().min(0) }),
          Object.assign(new stdClass(), { age: 0 }), // boundary at min
      ],
      [
          JsonSchema.object({ age: JsonSchema.integer().nullable() }),
          Object.assign(new stdClass(), { age: null }), // nullable
      ],
      [
          JsonSchema.object({ age: JsonSchema.integer().nullable(false) }),
          Object.assign(new stdClass(), { age: 0 }), // not nullable
      ],

      // ArrayType
      [JsonSchema.array(), []],
      [JsonSchema.array().min(1), ['a']],
      [JsonSchema.array().max(2), ['a', 'b']],
      [JsonSchema.array().items(JsonSchema.string().max(3)), ['one', 'two']],
      [JsonSchema.array().default(['x']), ['x']],
      [JsonSchema.array().enum([['a'], ['b', 'c']]), ['b', 'c']],
      [JsonSchema.array().unique(), [1, 2, 3]],
      [JsonSchema.array().items(JsonSchema.string()).unique(), ['a', 'b', 'c']],
      [JsonSchema.array().unique(), []],
      // additional ArrayType cases
      [JsonSchema.array().min(0), []], // explicit min zero
      [JsonSchema.array().max(0), []], // exactly zero length
      [JsonSchema.array().items(JsonSchema.string()).min(2).max(2), ['a', 'b']],
      [JsonSchema.array().items(JsonSchema.integer().min(0)), [0, 1, 2]],
      [JsonSchema.array().enum([[]]), []],
      [JsonSchema.array().nullable(), null],
      [JsonSchema.array().nullable(false), []],

      // UnionType
      [JsonSchema.union(['string', 'number']), 'hello'],
      [JsonSchema.union(['string', 'number']), 42],
      [JsonSchema.union(['string', 'number']), 3.14],
      [JsonSchema.union(['integer', 'boolean']), true],
      [JsonSchema.union(['string', 'number']).enum(['draft', 5]), 'draft'],
      [JsonSchema.union(['string', 'number']).nullable(), null],
      [JsonSchema.union(['string', 'number']).nullable(), 'still valid'],

      // AnyOfType
      [JsonSchema.anyOf([JsonSchema.string(), JsonSchema.integer()]), 'hello'],
      [JsonSchema.anyOf([JsonSchema.string(), JsonSchema.integer()]), 10],
      [JsonSchema.anyOf([JsonSchema.string(), JsonSchema.integer()]).nullable(), null],
      [JsonSchema.anyOf([
          JsonSchema.object({
            type: JsonSchema.string().enum(['card']).required(),
            last4: JsonSchema.string().min(4).max(4).required(),
          }),
          JsonSchema.object({
            type: JsonSchema.string().enum(['bank_account']).required(),
            iban: JsonSchema.string().required(),
          }),
      ]), Object.assign(new stdClass(), { type: 'card', last4: '1234' })],

    ];
  }

  static invalidSchemasProvider(): unknown[][] {
    return [
      // StringType
      [JsonSchema.string(), 123], // type mismatch
      [JsonSchema.string().min(3), 'hi'], // too short
      [JsonSchema.string().max(2), 'long'], // too long
      [JsonSchema.string().pattern('^foo.*$'), 'barbaz'], // pattern mismatch
      [JsonSchema.string().default('x'), 10], // default doesn't enforce, but data wrong type
      [JsonSchema.string().enum(['draft', 'published']), 'archived'], // not in enum
      // additional StringType cases
      [JsonSchema.string().min(1), ''], // too short (empty)
      [JsonSchema.string().max(0), 'a'], // too long for zero max
      [JsonSchema.string().pattern('^[a]+$'), 'ab'], // pattern mismatch
      [JsonSchema.string().enum(['a', 'b']), 'A'], // case sensitive mismatch
      [JsonSchema.string().enum(StringBackedEnum), 'three'], // string backed enum cases mismatch
      [JsonSchema.string(), null], // null not allowed
      [JsonSchema.string().nullable(false), null], // not nullable

      // IntegerType
      [JsonSchema.integer(), '10'], // type mismatch
      [JsonSchema.integer().min(5), 4], // below min
      [JsonSchema.integer().max(5), 6], // above max
      [JsonSchema.integer().default(1), '1'], // wrong type
      [JsonSchema.integer().enum([1, 2, 3]), 4], // not in enum
      [JsonSchema.integer().multipleOf(5), 7], // not a multiple
      [JsonSchema.integer().multipleOf(3), 10], // not a multiple
      // additional IntegerType cases
      [JsonSchema.integer().min(0), -1], // below min boundary
      [JsonSchema.integer().max(0), 1], // above max boundary
      [JsonSchema.integer(), 3.14], // not an integer
      [JsonSchema.integer().enum([1, 2]), 2.5], // not in enum and not an integer
      [JsonSchema.integer().enum(IntBackedEnum), 3], // integer backed enum cases mismatch
      [JsonSchema.integer().default(1), null], // wrong type
      [JsonSchema.integer().nullable(false), null], // not nullable

      // NumberType
      [JsonSchema.number(), '3.14'], // type mismatch
      [JsonSchema.number().min(0.5), 0.4], // below min
      [JsonSchema.number().max(1.5), 1.6], // above max
      [JsonSchema.number().default(1.1), '1.1'], // wrong type
      [JsonSchema.number().enum([1, 2.5, 3]), 4], // not in enum
      [JsonSchema.number().multipleOf(0.5), 1.3], // not a multiple
      [JsonSchema.number().multipleOf(3), 10], // not a multiple
      // additional NumberType cases
      [JsonSchema.number().min(0), -0.0001], // below min
      [JsonSchema.number().max(10), 10.0001], // above max
      [JsonSchema.number(), 'NaN'], // string, not number
      [JsonSchema.number().enum([1.1, 2.2]), 1.1000001], // not exactly in enum
      [JsonSchema.number().default(float(0)), []], // wrong type
      [JsonSchema.number().nullable(false), null], // not nullable

      // BooleanType
      [JsonSchema.boolean(), 'true'], // type mismatch
      [JsonSchema.boolean().default(false), 0], // wrong type
      [JsonSchema.boolean().enum([true, false]), null], // not in enum
      // additional BooleanType cases
      [JsonSchema.boolean().enum([true]), false], // not in enum
      [JsonSchema.boolean().enum([false]), true], // not in enum
      [JsonSchema.boolean(), 1], // wrong type
      [JsonSchema.boolean().default(true), 'true'], // wrong type
      [JsonSchema.boolean(), null], // null is invalid
      [JsonSchema.boolean().nullable(false), null], // not nullable

      // ObjectType
      [JsonSchema.object({ name: JsonSchema.string().required() }), new stdClass()], // missing required
      [JsonSchema.object({ meta: JsonSchema.object().withoutAdditionalProperties() }), Object.assign(new stdClass(), { meta: Object.assign(new stdClass(), { x: 1 }) })], // additional prop not allowed
      [JsonSchema.object({ age: JsonSchema.integer().min(21) }), Object.assign(new stdClass(), { age: 18 })], // below min in nested schema
      // additional ObjectType cases
      [JsonSchema.object([]).withoutAdditionalProperties(), Object.assign(new stdClass(), { x: 1 })], // no additional properties allowed
      [JsonSchema.object({ name: JsonSchema.string() }), Object.assign(new stdClass(), { name: 123 })], // wrong type for property
      [JsonSchema.object({ meta: JsonSchema.object().withoutAdditionalProperties() }), Object.assign(new stdClass(), { meta: 'nope' })], // wrong type in nested object
      [JsonSchema.object({ name: JsonSchema.string().required() }).default({ name: 'x' }), new stdClass()], // default doesn't satisfy missing required
      [JsonSchema.object({ score: JsonSchema.integer().min(0) }), Object.assign(new stdClass(), { score: -1 })], // below min
      [JsonSchema.object({ age: JsonSchema.integer().nullable(false) }), Object.assign(new stdClass(), { age: null })], // not nullable

      // ArrayType
      [JsonSchema.array(), new stdClass()], // type mismatch
      [JsonSchema.array().min(2), ['a']], // too few items
      [JsonSchema.array().max(1), ['a', 'b']], // too many items
      [JsonSchema.array().items(JsonSchema.string().max(3)), ['four']], // item too long
      [JsonSchema.array().enum([['a'], ['b', 'c']]), ['c', 'd']], // not in enum
      [JsonSchema.array().unique(), [1, 1, 2]],
      [JsonSchema.array().items(JsonSchema.string()).unique(), ['a', 'b', 'a']],
      // additional ArrayType cases
      [JsonSchema.array().items(JsonSchema.integer()), ['a']], // wrong item type
      [JsonSchema.array().min(1), []], // too few
      [JsonSchema.array().max(0), ['a']], // too many for zero max
      [JsonSchema.array().enum([['a'], ['b']]), ['a', 'b']], // not equal to any enum member
      [JsonSchema.array().items(JsonSchema.string().max(1)), ['ab']], // item too long
      [JsonSchema.array().nullable(false), null], // not nullable

      // UnionType
      [JsonSchema.union(['string', 'number']), true], // boolean not in union
      [JsonSchema.union(['string', 'number']), []], // array not in union
      [JsonSchema.union(['string', 'number']), null], // null not allowed unless nullable
      [JsonSchema.union(['integer', 'boolean']), 'nope'], // string not in union
      [JsonSchema.union(['string', 'number']).enum(['draft', 5]), 'archived'], // not in enum

      // AnyOfType
      [JsonSchema.anyOf([JsonSchema.string(), JsonSchema.integer()]), true],
      [JsonSchema.anyOf([JsonSchema.string(), JsonSchema.integer()]), null],
      [JsonSchema.anyOf([
          JsonSchema.object({
            type: JsonSchema.string().enum(['card']).required(),
            last4: JsonSchema.string().min(4).max(4).required(),
          }),
          JsonSchema.object({
            type: JsonSchema.string().enum(['bank_account']).required(),
            iban: JsonSchema.string().required(),
          }),
      ]), Object.assign(new stdClass(), { type: 'card', iban: 'wrong-branch' })],

    ];
  }

  /** Upstream's Opis `Validator` with its schema loader is ajv's draft 2020-12 validator with the formats; no row loads a remote schema. `multipleOfPrecision: 12` matches Opis's `multipleOf` verdicts on floats (decisions/ESC-16.1-5.md). */
  makeValidator(): Ajv2020 {
    const validator = new Ajv2020({ strict: false, multipleOfPrecision: 12 });
    addFormats(validator);

    return validator;
  }

  assertValidOnJsonSchema(schema: Type, data: unknown): void {
    const validator = this.makeValidator();
    const validate = validator.compile(validatorValue(jsonDecode(toPhpString(schema))) as object);
    const isValid = validate(validatorValue(data));
    const errorMessage = validate.errors?.[0]?.message ?? 'The JSON schema is valid.';
    this.assertTrue(isValid, errorMessage);
  }

  assertNotValidOnJsonSchema(schema: Type, data: unknown): void {
    const validator = this.makeValidator();
    const validate = validator.compile(validatorValue(jsonDecode(toPhpString(schema))) as object);
    const isValid = validate(validatorValue(data));
    this.assertFalse(isValid);
  }
}

portedTest('Illuminate\\Tests\\JsonSchema\\TypeTest::test_as_a_array_representation', { case: TypeTest }, async function () {
  const type = JsonSchema.object({
    age: JsonSchema.integer().min(0).required(),
  }).title('User').description('User payload').default({ age: 20 });

  this.assertEquals({
    type: 'object',
    title: 'User',
    description: 'User payload',
    default: { age: 20 },
    properties: {
      age: {
        type: 'integer',
        minimum: 0,
      },
    },
    required: ['age'],
  }, type.toArray());
});

portedTest('Illuminate\\Tests\\JsonSchema\\TypeTest::test_does_have_a_string_representation', { case: TypeTest }, async function () {
  const type = JsonSchema.object({
    age: JsonSchema.integer().min(0).required(),
  }).title('User');

  this.assertSame(
    '{\n' +
    '    "title": "User",\n' +
    '    "properties": {\n' +
    '        "age": {\n' +
    '            "minimum": 0,\n' +
    '            "type": "integer"\n' +
    '        }\n' +
    '    },\n' +
    '    "type": "object",\n' +
    '    "required": [\n' +
    '        "age"\n' +
    '    ]\n' +
    '}',
    type.toString(),
  );
});

portedTest('Illuminate\\Tests\\JsonSchema\\TypeTest::test_does_have_a_stringable_representation', { case: TypeTest }, async function () {
  const type = JsonSchema.object({
    age: JsonSchema.integer().min(0).required(),
  }).description('Payload');

  this.assertSame(
    '{\n' +
    '    "description": "Payload",\n' +
    '    "properties": {\n' +
    '        "age": {\n' +
    '            "minimum": 0,\n' +
    '            "type": "integer"\n' +
    '        }\n' +
    '    },\n' +
    '    "type": "object",\n' +
    '    "required": [\n' +
    '        "age"\n' +
    '    ]\n' +
    '}',
    toPhpString(type),
  );
});

portedTest('Illuminate\\Tests\\JsonSchema\\TypeTest::test_produces_valid_json_schemas', { case: TypeTest, dataset: TypeTest.validSchemasProvider() }, async function (schema: Type, data: unknown) {
  this.assertValidOnJsonSchema(schema, data);
});

portedTest('Illuminate\\Tests\\JsonSchema\\TypeTest::test_produces_invalid_json_schemas', { case: TypeTest, dataset: TypeTest.invalidSchemasProvider() }, async function (schema: Type, data: unknown) {
  this.assertNotValidOnJsonSchema(schema, data);
});

portedTest('Illuminate\\Tests\\JsonSchema\\TypeTest::test_types_in_object_schema', { case: TypeTest }, async function () {
  const schema = JsonSchema.object((schema: JsonSchemaTypeFactory) => ({
    name: schema.string().required(),
    age: schema.integer().min(0),
  }));

  this.assertInstanceOf(JsonSchema, schema);
});

portedTest('Illuminate\\Tests\\JsonSchema\\TypeTest::test_required_may_be_unset', { case: TypeTest }, async function () {
  const schema = JsonSchema.object({
    name: JsonSchema.string().required().required(false),
  });

  this.assertEquals({
    type: 'object',
    properties: {
      name: {
        type: 'string',
      },
    },
  }, schema.toArray());

  this.assertValidOnJsonSchema(schema, new stdClass());
});

portedTest('Illuminate\\Tests\\JsonSchema\\TypeTest::test_nullable_may_be_unset', { case: TypeTest }, async function () {
  const schema = JsonSchema.string().nullable().nullable(false);

  this.assertEquals({
    type: 'string',
  }, schema.toArray());

  this.assertNotValidOnJsonSchema(schema, null);
});

portedTest('Illuminate\\Tests\\JsonSchema\\TypeTest::test_throws_with_invalid_enum_string', { case: TypeTest }, async function () {
  this.expectExceptionObject(new InvalidArgumentException('The provided class must be a BackedEnum.', 0));

  JsonSchema.string().enum('NonExistentEnumClass');
});

portedTest('Illuminate\\Tests\\JsonSchema\\TypeTest::test_throws_with_not_an_enum_class', { case: TypeTest }, async function () {
  this.expectExceptionObject(new InvalidArgumentException('The provided class must be a BackedEnum.', 0));

  JsonSchema.string().enum(stdClass);
});

portedTest('Illuminate\\Tests\\JsonSchema\\TypeTest::test_throws_with_unit_enum_class', { case: TypeTest }, async function () {
  this.expectExceptionObject(new InvalidArgumentException('The provided class must be a BackedEnum.', 0));

  JsonSchema.string().enum(UnitEnum);
});
