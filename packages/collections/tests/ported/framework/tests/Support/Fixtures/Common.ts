// Ported from framework/tests/Support/Fixtures/Common.php (Laravel v13.37.0), Story 14.1.
//
// Each `implements` is a brand getter per token in the interface's chain (AD-9.5): `IteratorAggregate` also carries
// `Traversable`'s, and a Traversable iterates its values, `entries()` and `keys()` through `getIterator()` (AD-26).
// The classes are registered under `Illuminate\Tests\Support\Fixtures\<Name>` by the test case's `setUp`
// (`registerTestClass` needs a test frame).
import { Arrayable, Jsonable } from "@xaravel/contracts/support";
import { ArrayIterator, IteratorAggregate, JsonSerializable, jsonDecode, jsonEncode, Traversable } from "@xaravel/runtime/php";

export class TestArrayableObject implements Arrayable {
  get [Arrayable.brand](): true {
    return true;
  }

  toArray(): Record<string, unknown> {
    return { foo: "bar" };
  }
}

export class TestJsonableObject implements Jsonable {
  get [Jsonable.brand](): true {
    return true;
  }

  toJson(options: number = 0): string {
    void options;
    return '{"foo":"bar"}';
  }
}

export class TestJsonSerializeObject implements JsonSerializable {
  get [JsonSerializable.brand](): true {
    return true;
  }

  jsonSerialize(): Record<string, unknown> {
    return { foo: "bar" };
  }
}

export class TestJsonSerializeWithScalarValueObject implements JsonSerializable {
  get [JsonSerializable.brand](): true {
    return true;
  }

  jsonSerialize(): string {
    return "foo";
  }
}

export class TestTraversableAndJsonSerializableObject implements IteratorAggregate, JsonSerializable {
  items: unknown;

  constructor(items: unknown = []) {
    this.items = items;
  }

  get [IteratorAggregate.brand](): true {
    return true;
  }

  get [Traversable.brand](): true {
    return true;
  }

  get [JsonSerializable.brand](): true {
    return true;
  }

  getIterator(): Traversable {
    return new ArrayIterator(this.items);
  }

  [Symbol.iterator](): Iterator<unknown> {
    return this.getIterator()[Symbol.iterator]();
  }

  entries(): Iterable<[unknown, unknown]> {
    return this.getIterator().entries();
  }

  keys(): Iterable<unknown> {
    return this.getIterator().keys();
  }

  jsonSerialize(): unknown {
    return jsonDecode(jsonEncode(this.items) as string, true);
  }
}

/** The fixtures, by their Upstream FQCN, for `registerTestClass` in a test case's `setUp`. */
export const FIXTURES: readonly (readonly [string, abstract new (...args: never[]) => unknown])[] = [
  ["Illuminate\\Tests\\Support\\Fixtures\\TestArrayableObject", TestArrayableObject],
  ["Illuminate\\Tests\\Support\\Fixtures\\TestJsonableObject", TestJsonableObject],
  ["Illuminate\\Tests\\Support\\Fixtures\\TestJsonSerializeObject", TestJsonSerializeObject],
  ["Illuminate\\Tests\\Support\\Fixtures\\TestJsonSerializeWithScalarValueObject", TestJsonSerializeWithScalarValueObject],
  ["Illuminate\\Tests\\Support\\Fixtures\\TestTraversableAndJsonSerializableObject", TestTraversableAndJsonSerializableObject],
];
