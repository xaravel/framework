// Xaravel Test for the Epic 10 retrospective's action item 10 (XT-runtime-41; L1, L2), as the Maintainer ruled it
// (decisions/MAINT-2026-10-24-epic-10-items.md, Item 2 and "Item 10's route"): as a PHP value a contract token is its
// FQCN class-string, as PHP's `Arrayable::class` is (AD-9.8), so `jsonEncode` and `phpSerialize` write it as that
// string. It needs no Oracle fixture: each expected encoding is the codec's own encoding of the FQCN string, and the
// literal bytes PHP writes for that string.
//
// @xaravel/contracts depends on this package, so the token here is a stand-in built as `contract()` builds one:
// frozen, with an own non-writable `Symbol.for('xaravel.class.fqcn')` and a `Symbol.toPrimitive` giving its brand.
import { Assert, xaravelTest } from "@xaravel/assert";
import { JSON_FORCE_OBJECT, JSON_PRETTY_PRINT, JSON_UNESCAPED_SLASHES, jsonEncode, jsonLastError, phpSerialize, stdClass } from "@xaravel/runtime/php";
import { fqcn, isContractToken } from "@xaravel/runtime/registry";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");
const FQCN = "Illuminate\\Contracts\\Support\\Arrayable";

/** A stand-in contract token. */
function token(name: string): object {
  const brand = Symbol.for(name);
  return Object.freeze({
    brand,
    [CLASS_FQCN]: name,
    [Symbol.toPrimitive]: (): symbol => brand,
    [Symbol.hasInstance]: (value: unknown): boolean => typeof value === "object" && value !== null && (value as Record<symbol, unknown>)[brand] === true,
  });
}

xaravelTest(
  "XT-runtime-41",
  "a contract token is its FQCN class-string as a PHP value (AD-9.8, MAINT-2026-10-24 Item 2): jsonEncode writes it as json_encode writes that string under each flag, alone, in a list and as a map or object value, recording no error; phpSerialize writes s:<len>:\"<FQCN>\"; in one slot each, so a later object back-reference counts it; JS coercion still gives the brand",
  () => {
    const Arrayable = token(FQCN);
    const Jsonable = token("Illuminate\\Contracts\\Support\\Jsonable");
    Assert.assertTrue(isContractToken(Arrayable));
    Assert.assertSame(FQCN, fqcn(Arrayable));

    // jsonEncode: the string's encoding, with the flags.
    // json_encode escapes each backslash; an FQCN has no `/`, so no flag changes the string's bytes.
    Assert.assertSame('"Illuminate\\\\Contracts\\\\Support\\\\Arrayable"', jsonEncode(Arrayable));
    Assert.assertSame(jsonEncode(FQCN), jsonEncode(Arrayable));
    Assert.assertSame(0, jsonLastError());
    for (const flags of [JSON_UNESCAPED_SLASHES, JSON_PRETTY_PRINT, JSON_FORCE_OBJECT, JSON_PRETTY_PRINT | JSON_FORCE_OBJECT]) {
      Assert.assertSame(jsonEncode(FQCN, flags), jsonEncode(Arrayable, flags));
      Assert.assertSame(jsonEncode([FQCN, "Illuminate\\Contracts\\Support\\Jsonable"], flags), jsonEncode([Arrayable, Jsonable], flags));
    }
    Assert.assertSame('{"0":"Illuminate\\\\Contracts\\\\Support\\\\Arrayable"}', jsonEncode([Arrayable], JSON_FORCE_OBJECT));
    Assert.assertSame(jsonEncode([FQCN, "Illuminate\\Contracts\\Support\\Jsonable"]), jsonEncode([Arrayable, Jsonable]));
    Assert.assertSame(jsonEncode({ a: FQCN }), jsonEncode({ a: Arrayable }));
    Assert.assertSame(`{"a":${jsonEncode(FQCN)}}`, jsonEncode({ a: Arrayable }));
    const holder = Object.assign(new stdClass(), { t: Arrayable });
    Assert.assertSame(`{"t":${jsonEncode(FQCN, JSON_UNESCAPED_SLASHES)}}`, jsonEncode(holder, JSON_UNESCAPED_SLASHES));
    Assert.assertSame(0, jsonLastError());

    // phpSerialize: a string, one slot each.
    const serialized = `s:38:"${FQCN}";`;
    Assert.assertSame(serialized, phpSerialize(Arrayable));
    Assert.assertSame(phpSerialize(FQCN), phpSerialize(Arrayable));
    Assert.assertSame(`a:2:{i:0;${serialized}i:1;${serialized}}`, phpSerialize([Arrayable, Arrayable]));
    Assert.assertSame(`a:1:{s:1:"a";${serialized}}`, phpSerialize({ a: Arrayable }));
    Assert.assertSame(`O:8:"stdClass":1:{s:1:"t";${serialized}}`, phpSerialize(holder));
    // Slots: the array is 1, the two tokens 2 and 3, the object 4, so its second use is r:4.
    const shared = new stdClass();
    Assert.assertSame(`a:4:{i:0;${serialized}i:1;${serialized}i:2;O:8:"stdClass":0:{}i:3;r:4;}`, phpSerialize([Arrayable, Arrayable, shared, shared]));
    Assert.assertSame(phpSerialize([FQCN, FQCN, shared, shared]), phpSerialize([Arrayable, Arrayable, shared, shared]));

    // JS coercion is unchanged: the brand, never the FQCN.
    Assert.assertSame((Arrayable as { brand: symbol }).brand, (Arrayable as { [Symbol.toPrimitive]: () => symbol })[Symbol.toPrimitive]());
    let coerced: unknown = null;
    try {
      coerced = String(Arrayable as unknown);
    } catch (error) {
      coerced = error instanceof TypeError ? "TypeError" : error;
    }
    Assert.assertSame("TypeError", coerced);
  },
);
