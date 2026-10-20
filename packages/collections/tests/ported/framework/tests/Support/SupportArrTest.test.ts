// pilot/porting: Story 8.7 pilot translation, never merged
import { portedTest, TestCase } from "@xaravel/assert";
import { Arr, MultipleItemsFoundException } from "@xaravel/collections";
import { ArrayObject, InvalidArgumentException, is_string, PhpArray } from "@xaravel/runtime/php";

portedTest("Illuminate\\Tests\\Support\\SupportArrTest::testDivide", { case: TestCase }, async function () {
  // Test dividing an empty array
  let [keys, values] = Arr.divide([]);
  this.assertSame([], keys);
  this.assertSame([], values);

  // Test dividing an array with a single key-value pair
  [keys, values] = Arr.divide({ name: "Desk" });
  this.assertEquals(["name"], keys);
  this.assertEquals(["Desk"], values);

  // Test dividing an array with multiple key-value pairs
  [keys, values] = Arr.divide({ name: "Desk", price: 100, available: true });
  this.assertEquals(["name", "price", "available"], keys);
  this.assertEquals(["Desk", 100, true], values);

  // Test dividing an array with numeric keys
  [keys, values] = Arr.divide(["first", "second"]);
  this.assertEquals([0, 1], keys);
  this.assertEquals(["first", "second"], values);

  // Test dividing an array with null key
  [keys, values] = Arr.divide(new PhpArray([[null, "Null"], [1, "one"]]));
  this.assertEquals([null, 1], keys);
  this.assertEquals(["Null", "one"], values);

  // Test dividing an array where the keys are arrays
  [keys, values] = Arr.divide([new PhpArray<string | number | null, unknown>([["one", 1], [2, "second"]]), "one"]);
  this.assertEquals([0, 1], keys);
  this.assertEquals([new PhpArray<string | number | null, unknown>([["one", 1], [2, "second"]]), "one"], values);

  // Test dividing an array where the values are arrays
  [keys, values] = Arr.divide(new PhpArray<string | number | null, unknown>([["", new PhpArray<string | number | null, unknown>([["one", 1], [2, "second"]])], [1, "one"]]));
  this.assertEquals([null, 1], keys);
  this.assertEquals([new PhpArray<string | number | null, unknown>([["one", 1], [2, "second"]]), "one"], values);

  // Test dividing an array where the values are arrays (with null key)
  [keys, values] = Arr.divide(new PhpArray<string | number | null, unknown>([[null, new PhpArray<string | number | null, unknown>([["one", 1], [2, "second"]])], [1, "one"]]));
  this.assertEquals([null, 1], keys);
  this.assertEquals([new PhpArray<string | number | null, unknown>([["one", 1], [2, "second"]]), "one"], values);
});

portedTest("Illuminate\\Tests\\Support\\SupportArrTest::testEvery", { case: TestCase }, async function () {
  this.assertFalse(Arr.every([1, 2], (value: unknown, key: unknown) => is_string(value)));
  this.assertFalse(Arr.every(["foo", 2], (value: unknown, key: unknown) => is_string(value)));
  this.assertTrue(Arr.every(["foo", "bar"], (value: unknown, key: unknown) => is_string(value)));
});

portedTest("Illuminate\\Tests\\Support\\SupportArrTest::testExcept", { case: TestCase }, async function () {
  let array: unknown = { name: "taylor", age: 26 };
  this.assertEquals({ age: 26 }, Arr.except(array, ["name"]));
  this.assertEquals({ age: 26 }, Arr.except(array, "name"));

  array = { name: "taylor", framework: { language: "PHP", name: "Laravel" } };
  this.assertEquals({ name: "taylor" }, Arr.except(array, "framework"));
  this.assertEquals({ name: "taylor", framework: { name: "Laravel" } }, Arr.except(array, "framework.language"));
  this.assertEquals({ framework: { language: "PHP" } }, Arr.except(array, ["name", "framework.name"]));

  array = new PhpArray<string | number | null, unknown>([[1, "hAz"], [2, new PhpArray<string | number | null, unknown>([[5, "foo"], [12, "baz"]])]]);
  this.assertEquals(new PhpArray([[1, "hAz"]]), Arr.except(array, 2));
  this.assertEquals(new PhpArray<string | number | null, unknown>([[1, "hAz"], [2, new PhpArray<string | number | null, unknown>([[12, "baz"]])]]), Arr.except(array, 2.5));
});

portedTest("Illuminate\\Tests\\Support\\SupportArrTest::testFirstWorksWithArrayObject", { case: TestCase }, async function () {
  const arrayObject = new ArrayObject([0, 10, 20]);

  const result = Arr.first(arrayObject, (value: unknown) => value === 0);

  this.assertSame(0, result);
});

portedTest("Illuminate\\Tests\\Support\\SupportArrTest::testGet", { case: TestCase }, async function () {
  let array: unknown = { "products.desk": { price: 100 } };
  this.assertEquals({ price: 100 }, Arr.get(array, "products.desk"));

  array = { products: { desk: { price: 100 } } };
  let value = Arr.get(array, "products.desk");
  this.assertEquals({ price: 100 }, value);

  // Test null array values
  array = { foo: null, bar: { baz: null } };
  this.assertNull(Arr.get(array, "foo", "default"));
  this.assertNull(Arr.get(array, "bar.baz", "default"));

  // Test direct ArrayAccess object
  array = { products: { desk: { price: 100 } } };
  let arrayAccessObject = new ArrayObject(array);
  value = Arr.get(arrayAccessObject, "products.desk");
  this.assertEquals({ price: 100 }, value);

  // Test array containing ArrayAccess object
  let arrayAccessChild = new ArrayObject({ products: { desk: { price: 100 } } });
  array = { child: arrayAccessChild };
  value = Arr.get(array, "child.products.desk");
  this.assertEquals({ price: 100 }, value);

  // Test array containing multiple nested ArrayAccess objects
  arrayAccessChild = new ArrayObject({ products: { desk: { price: 100 } } });
  let arrayAccessParent = new ArrayObject({ child: arrayAccessChild });
  array = { parent: arrayAccessParent };
  value = Arr.get(array, "parent.child.products.desk");
  this.assertEquals({ price: 100 }, value);

  // Test missing ArrayAccess object field
  arrayAccessChild = new ArrayObject({ products: { desk: { price: 100 } } });
  arrayAccessParent = new ArrayObject({ child: arrayAccessChild });
  array = { parent: arrayAccessParent };
  value = Arr.get(array, "parent.child.desk");
  this.assertNull(value);

  // Test missing ArrayAccess object field
  arrayAccessObject = new ArrayObject({ products: { desk: null } });
  array = { parent: arrayAccessObject };
  value = Arr.get(array, "parent.products.desk.price");
  this.assertNull(value);

  // Test null ArrayAccess object fields
  array = new ArrayObject({ foo: null, bar: new ArrayObject({ baz: null }) });
  this.assertNull(Arr.get(array, "foo", "default"));
  this.assertNull(Arr.get(array, "bar.baz", "default"));

  // Test null key returns the whole array
  array = ["foo", "bar"];
  this.assertEquals(array, Arr.get(array, null));

  // Test $array not an array
  this.assertSame("default", Arr.get(null, "foo", "default"));
  this.assertSame("default", Arr.get(false, "foo", "default"));

  // Test $array not an array and key is null
  this.assertSame("default", Arr.get(null, null, "default"));

  // Test $array is empty and key is null
  this.assertEmpty(Arr.get([], null));
  this.assertEmpty(Arr.get([], null, "default"));

  // Test numeric keys
  array = {
    products: [
      { name: "desk" },
      { name: "chair" },
    ],
  };
  this.assertSame("desk", Arr.get(array, "products.0.name"));
  this.assertSame("chair", Arr.get(array, "products.1.name"));

  // Test return default value for non-existing key.
  array = { names: { developer: "taylor" } };
  this.assertSame("dayle", Arr.get(array, "names.otherDeveloper", "dayle"));
  this.assertSame("dayle", Arr.get(array, "names.otherDeveloper", () => "dayle"));

  // Test array has a null key
  this.assertSame("bar", Arr.get({ "": "bar" }, ""));
  this.assertSame("bar", Arr.get({ "": { "": "bar" } }, "."));
});

portedTest("Illuminate\\Tests\\Support\\SupportArrTest::testItGetsABoolean", { case: TestCase }, async function () {
  const test_array = { string: "foo bar", boolean: true };

  // Test boolean values are returned as booleans
  this.assertTrue(
    Arr.boolean(test_array, "boolean"),
  );

  // Test that default boolean values are returned for missing keys
  this.assertTrue(
    Arr.boolean(test_array, "missing_key", true),
  );

  // Test that an exception is raised if the value is not a boolean
  this.expectException(InvalidArgumentException);
  this.expectExceptionMessageMatches(/^Array value for key \[string\] must be a boolean, (.*) found./); // adapted:DIV-10.1
  Arr.boolean(test_array, "string");
});

portedTest("Illuminate\\Tests\\Support\\SupportArrTest::testMapByReference", { case: TestCase }, async function () {
  const data = { first: "taylor", last: "otwell" };
  const mapped = Arr.map(data, "strrev");

  this.assertEquals({ first: "rolyat", last: "llewto" }, mapped);
  this.assertEquals({ first: "taylor", last: "otwell" }, data);
});

portedTest("Illuminate\\Tests\\Support\\SupportArrTest::testOnlyValues", { case: TestCase }, async function () {
  let array: unknown = { name: "taylor", age: 26, city: "austin" };
  this.assertEquals({ age: 26 }, Arr.onlyValues(array, [26]));
  this.assertEquals({ age: 26 }, Arr.onlyValues(array, 26));

  array = ["foo", "bar", "baz", "qux"];
  this.assertEquals(new PhpArray([[0, "foo"], [2, "baz"]]), Arr.onlyValues(array, ["foo", "baz"]));
  this.assertEquals(new PhpArray([[2, "baz"]]), Arr.onlyValues(array, "baz"));

  array = [1, 2, 3, 4, 5];
  this.assertEquals(new PhpArray([[2, 3], [3, 4]]), Arr.onlyValues(array, [3, 4]));

  array = { a: 1, b: 2, c: 1, d: 3 };
  this.assertEquals({ a: 1, c: 1 }, Arr.onlyValues(array, 1));

  this.assertSame([], Arr.onlyValues([], "foo"));
  this.assertSame([], Arr.onlyValues(["foo", "bar"], []));

  array = [1, "1", 2, "2", 3];
  this.assertEquals(new PhpArray([[0, 1], [2, 2], [4, 3]]), Arr.onlyValues(array, [1, 2, 3], true));
  this.assertEquals([1, "1", 2, "2", 3], Arr.onlyValues(array, [1, 2, 3]));

  array = { a: true, b: false, c: 1, d: 0 };
  this.assertEquals({ c: 1, d: 0 }, Arr.onlyValues(array, [1, 0], true));
  this.assertEquals({ a: true, b: false, c: 1, d: 0 }, Arr.onlyValues(array, [1, 0]));
});

portedTest("Illuminate\\Tests\\Support\\SupportArrTest::testRandomThrowsAnErrorWhenRequestingMoreItemsThanAreAvailable", { case: TestCase }, async function () {
  let exceptions = 0;

  try {
    Arr.random([]);
  } catch (e) {
    if (!(e instanceof InvalidArgumentException)) {
      throw e;
    }
    exceptions++;
  }

  try {
    Arr.random([], 1);
  } catch (e) {
    if (!(e instanceof InvalidArgumentException)) {
      throw e;
    }
    exceptions++;
  }

  try {
    Arr.random([], 2);
  } catch (e) {
    if (!(e instanceof InvalidArgumentException)) {
      throw e;
    }
    exceptions++;
  }

  this.assertSame(3, exceptions);
});

portedTest("Illuminate\\Tests\\Support\\SupportArrTest::testSelect", { case: TestCase }, async function () {
  const array = [
    {
      name: "Taylor",
      role: "Developer",
      age: 1,
    },
    {
      name: "Abigail",
      role: "Infrastructure",
      age: 2,
    },
  ];

  this.assertEquals([
    {
      name: "Taylor",
      age: 1,
    },
    {
      name: "Abigail",
      age: 2,
    },
  ], Arr.select(array, ["name", "age"]));

  this.assertEquals([
    {
      name: "Taylor",
    },
    {
      name: "Abigail",
    },
  ], Arr.select(array, "name"));

  this.assertEquals([
    [],
    [],
  ], Arr.select(array, "nonExistingKey"));

  this.assertEquals([
    [],
    [],
  ], Arr.select(array, null));
});

portedTest("Illuminate\\Tests\\Support\\SupportArrTest::testSoleThrowsExceptionIfMoreThanOneItemExists", { case: TestCase }, async function () {
  this.expectExceptionObject(new MultipleItemsFoundException(2));

  Arr.sole(["baz", "foo", "baz"], (value: string) => value === "baz");
});

portedTest("Illuminate\\Tests\\Support\\SupportArrTest::testSortRecursiveDesc", { case: TestCase }, async function () {
  const array = {
    empty: [],
    nested: {
      level1: {
        level2: {
          level3: [2, 3, 1],
        },
        values: [4, 5, 6],
      },
    },
    mixed: new PhpArray<string | number | null, unknown>([
      ["a", 1],
      [2, "b"],
      ["c", 3],
      [1, "d"],
    ]),
    numbered_index: new PhpArray([
      [1, "e"],
      [3, "c"],
      [4, "b"],
      [5, "a"],
      [2, "d"],
    ]),
  };

  const expect = {
    empty: [],
    mixed: new PhpArray<string | number | null, unknown>([
      ["c", 3],
      ["a", 1],
      [2, "b"],
      [1, "d"],
    ]),
    nested: {
      level1: {
        values: [6, 5, 4],
        level2: {
          level3: [3, 2, 1],
        },
      },
    },
    numbered_index: new PhpArray([
      [5, "a"],
      [4, "b"],
      [3, "c"],
      [2, "d"],
      [1, "e"],
    ]),
  };

  this.assertEquals(expect, Arr.sortRecursiveDesc(array));
});
