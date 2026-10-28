import { readFileSync } from "node:fs";
import { Assert, xaravelTest } from "@xaravel/assert";
import { offsetAssign as rootAssign, registerClass } from "@xaravel/runtime";
import * as p from "@xaravel/runtime/php";
import { offsetReferenceTarget } from "../../src/php/offsetReference";

function failure(action: () => unknown, klass: typeof p.Error, message: string): void {
  let caught: unknown = null;
  try { action(); } catch (error) { caught = error; }
  Assert.assertTrue(caught instanceof klass);
  Assert.assertSame(message, (caught as p.Error).getMessage());
}

xaravelTest("XT-runtime-107", "Offset assignments match pinned PHP receivers, string bytes, results and errors", () => {
  Assert.assertTrue(rootAssign === p.offsetAssign);
  const rows = ["PHP 8.5.11"];
  const row = (name: string, input: unknown, key: unknown, value: unknown): void => {
    const ref = new p.Ref(input);
    try { const result = p.offsetAssign(ref, key, value); rows.push(`${name} ${p.jsonEncode([ref.value, result], p.JSON_UNESCAPED_UNICODE)}`); }
    catch (error) { rows.push(`${name} ${error instanceof p.TypeError ? "TypeError" : "Error"}: ${(error as p.Error).getMessage()} ${p.jsonEncode(ref.value)}`); }
  };
  [null, false, true, 12, 1.5].forEach((value, i) => row(`receiver${i}`, value, "y", [1]));
  [null, false].forEach((value, i) => row(`invalid${i}`, value, [], 1));
  const strings: [unknown, unknown, unknown][] = [["abc", 1, "XYZ"], ["abc", -1, 12], ["abc", 5, true], ["abc", -5, new p.stdClass()], ["abc", "1x", "Z"], ["abc", "1.5", "Z"], ["abc", [], 1], ["abc", 0, ""], ["abc", null, "Z"], ["é", 2, "Z"], ["abc", false, []], ["abc", true, false], ["abc", 1.75, 2.5], ["abc", 0, new p.stdClass()]];
  strings.forEach(([value, key, rhs], i) => row(`string${i}`, value, key, rhs));
  row("object", new p.stdClass(), "x", 1);
  const evidence = readFileSync(`${import.meta.dir}/php-offset-assign.probe.txt`, "utf8").trim().split("\n");
  Assert.assertSame(evidence.slice(0, evidence.findIndex((line) => line.startsWith("bytes "))), rows);
  // ESC-9.7-1 §2: the PHP byte outputs in the final two rows have no AD-9
  // JS-string representation. The limit is explicit, never replacement decoded.
  for (const [input, rhs] of [["abc", "é"], ["é", "X"]]) {
    const ref = new p.Ref<unknown>(input);
    let caught: unknown = null;
    try { p.offsetAssign(ref, 0, rhs); } catch (error) { caught = error; }
    Assert.assertTrue(caught instanceof TypeError);
    Assert.assertSame("offsetAssign(): the result splits a UTF-8 sequence, which JS cannot hold", (caught as TypeError).message);
    Assert.assertSame(input, ref.value);
  }
  const coercions = [p.float(1), NaN, Infinity, -Infinity, "1e0", " 1 ", -9223372036854775808n, "-9223372036854775808", "9223372036854775808", "-9223372036854775809"];
  const coercionRows: string[] = [];
  for (const [i, key] of coercions.entries()) {
    const ref = new p.Ref<unknown>("abc");
    try { const result = p.offsetAssign(ref, key, "Z"); coercionRows.push(`coercion${i} ${p.jsonEncode([ref.value, result])}`); }
    catch (error) { coercionRows.push(`coercion${i} TypeError: ${(error as p.Error).getMessage()} ${p.jsonEncode(ref.value)}`); }
  }
  Assert.assertSame(evidence.filter((line) => line.startsWith("coercion")), coercionRows);
  for (const input of [true, 12, p.float(1.0)]) {
    const ref = new p.Ref<unknown>(input);
    failure(() => p.offsetAssign(ref, [], 1), p.Error, "Cannot use a scalar value as an array");
    Assert.assertTrue(ref.value === input);
  }
});

xaravelTest("XT-runtime-108", "Offset array writes preserve copies, normalized order and next-free state", () => {
  const handle = new p.stdClass();
  for (const input of [[], { old: [0] }, new p.PhpArray([[3, [0]]])]) {
    const before = p.valueCopy(input);
    const ref = new p.Ref<unknown>(input);
    const rhs = { child: [1], handle };
    const result = p.offsetAssign(ref, "02", rhs) as typeof rhs;
    rhs.child.push(2);
    result.child.push(3);
    Assert.assertSame(before, input);
    const stored = p.arrayEntries(ref.value as object).find(([key]) => key === "02")![1] as typeof rhs;
    Assert.assertSame([1], stored.child);
    Assert.assertTrue(stored.handle === handle);
    p.offsetAssign(ref, true, "bool");
    p.offsetAssign(ref, p.float(2.75), "float");
    p.offsetAssign(ref, "2", "replaced");
    const keys = p.arrayEntries(ref.value as object).map(([key]) => key);
    Assert.assertSame([1, 2], keys.slice(-2));
    Assert.assertSame("replaced", p.arrayEntries(ref.value as object).at(-1)![1]);
  }
  const sparse = new p.PhpArray([[5, 1]]); sparse.delete(5);
  const ref = new p.Ref<unknown>(sparse);
  p.offsetAssign(ref, null, "next");
  Assert.assertSame([[6, "next"]], p.arrayEntries(ref.value as object));
  const evidence = readFileSync(`${import.meta.dir}/php-offset-assign.probe.txt`, "utf8").trim().split("\n");
  Assert.assertTrue(evidence.includes(`next-free ${p.jsonEncode([ref.value, "next"])}`));
  const negative = new p.Ref<unknown>(new p.PhpArray([[-5, "a"]]));
  p.offsetAssign(negative, null, "b");
  Assert.assertSame([[-5, "a"], [-4, "b"]], p.arrayEntries(negative.value as object));
  Assert.assertTrue(evidence.includes(`negative-next ${p.jsonEncode([negative.value, "b"])}`));
  const max = new p.Ref<unknown>(new p.PhpArray([[9223372036854775807n, "max"]]));
  failure(() => p.offsetAssign(max, null, "x"), p.Error, "Cannot add element to the array as the next element is already occupied");
  Assert.assertSame([[9223372036854775807n, "max"]], p.arrayEntries(max.value as object));
  Assert.assertTrue(evidence.includes(`overflow Error: Cannot add element to the array as the next element is already occupied ${p.jsonEncode(max.value)}`));
  for (const append of [false, true]) {
    const pointer = new p.Ref<unknown>({ a: 1, b: 2 }); p.end(pointer);
    p.offsetAssign(pointer, append ? null : "a", 3);
    Assert.assertTrue(evidence.includes(`pointer${Number(append)} ${p.jsonEncode([pointer.value, p.key(pointer.value)])}`));
  }
  const exhausted = new p.Ref<unknown>(new p.PhpArray([[0, 1], [5, 2]])); p.end(exhausted);
  (exhausted.value as p.PhpArray).delete(5);
  Assert.assertTrue(evidence.includes(`pointer-exhausted-before ${p.jsonEncode([exhausted.value, p.key(exhausted.value)])}`));
  p.offsetAssign(exhausted, null, 3);
  Assert.assertTrue(evidence.includes(`pointer-exhausted-after ${p.jsonEncode([exhausted.value, p.key(exhausted.value)])}`));
  for (const [i, key] of [[], new p.stdClass()].entries()) {
    const held = new p.Ref<unknown>(new p.PhpArray([[0, 1], [5, 2]])); p.end(held);
    (held.value as p.PhpArray).delete(5);
    const message = `Cannot access offset of type ${i === 0 ? "array" : "stdClass"} on array`;
    failure(() => p.offsetAssign(held, key, 3), p.TypeError, message);
    Assert.assertTrue(evidence.includes(`retained${i} TypeError: ${message} ${p.jsonEncode([held.value, p.key(held.value)])}`));
    p.offsetAssign(held, null, 4);
    Assert.assertTrue(evidence.includes(`retained-next${i} ${p.jsonEncode([held.value, p.key(held.value)])}`));
  }
});

class Access implements p.ArrayAccess {
  calls: unknown[][] = [];
  get [p.ArrayAccess.brand](): true { return true; }
  offsetExists(key: unknown): boolean { this.calls.push(["exists", key]); return false; }
  offsetGet(key: unknown): unknown { this.calls.push(["get", key]); return 12; }
  offsetSet(key: unknown, value: unknown): void { this.calls.push(["set", key, value]); }
  offsetUnset(): void {}
}
class Inherited extends p.ArrayObject {}
class Overridden extends p.ArrayObject { override offsetGet(key: p.PhpKeyInput): unknown { return super.offsetGet(key); } }
registerClass("OffsetAssignAccess", Access);

xaravelTest("XT-runtime-109", "ArrayAccess keeps original keys, copied arguments, handles and reference composition", () => {
  const object = new Access();
  const root = new p.Ref<unknown>(object);
  const key = [1]; const value = { child: [1] };
  p.offsetAssign(root, key, value);
  key.push(2); value.child.push(2);
  Assert.assertSame([["set", [1], { child: [1] }]], object.calls);
  Assert.assertTrue(root.value === object);
  p.offsetAssign(root, null, 2);
  Assert.assertSame(["set", null, 2], object.calls[1]);
  const probe = readFileSync(`${import.meta.dir}/php-offset-assign.probe.txt`, "utf8").trim().split("\n");
  for (const [i, builtin] of [new p.ArrayObject({ x: [] }), new Inherited({ x: [] })].entries()) {
    const ref = p.offsetReference(builtin, "x");
    p.offsetAssign(ref, "y", [1]);
    Assert.assertSame({ x: { y: [1] } }, builtin.getArrayCopy());
    Assert.assertTrue(probe.includes(`composition${i} ${p.jsonEncode([builtin.getArrayCopy(), ref.value])}`));
  }
  const overridden = new Overridden({ x: [] });
  const local = p.offsetReference(overridden, "x");
  p.offsetAssign(local, "y", [1]);
  Assert.assertSame({ x: [] }, overridden.getArrayCopy());
  Assert.assertSame({ y: [1] }, local.value);
  Assert.assertTrue(probe.includes(`composition2 ${p.jsonEncode([overridden.getArrayCopy(), local.value])}`));
  for (const [i, initial] of [null, false].entries()) {
    const builtin = new p.ArrayObject({ x: initial }); const slot = p.offsetReference(builtin, "x");
    failure(() => p.offsetAssign(slot, [], 1), p.TypeError, "Cannot access offset of type array on array");
    Assert.assertTrue(probe.includes(`slot-invalid${i} TypeError: Cannot access offset of type array on array ${p.jsonEncode([builtin.getArrayCopy(), slot.value])}`));
  }
  // Exact ESC-14.6-8 order: explicit initialization survives a detached scalar error.
  const scalar = new Access();
  Assert.assertFalse(scalar.offsetExists("x"));
  p.offsetAssign(new p.Ref<unknown>(scalar), "x", []);
  const ref = p.offsetReference(scalar, "x");
  failure(() => p.offsetAssign(ref, "y", 1), p.Error, "Cannot use a scalar value as an array");
  Assert.assertSame(12, ref.value);
  const evidence = readFileSync(`${import.meta.dir}/php-offset-assign.probe.txt`, "utf8").trim().split("\n");
  Assert.assertTrue(evidence.includes(`scalar-reference Error: Cannot use a scalar value as an array ${p.jsonEncode([scalar.calls, ref.value])}`));
  Assert.assertSame([["exists", "x"], ["set", "x", []], ["get", "x"]], scalar.calls);
  const source = { child: [1] };
  class Mutating extends Access {
    override offsetSet(key: unknown, value: unknown): void {
      (value as typeof source).child.push(2); source.child.push(3); super.offsetSet(key, value);
    }
  }
  const mutating = new Mutating();
  const result = p.offsetAssign(new p.Ref<unknown>(mutating), "x", source);
  Assert.assertTrue(evidence.includes(`argument-copy ${p.jsonEncode([source, result, mutating.calls])}`));
  class Throwing extends Access {
    override offsetSet(key: unknown, value: unknown): void { super.offsetSet(key, value); throw new p.Error("write failed"); }
  }
  const throwing = new Throwing();
  failure(() => p.offsetAssign(new p.Ref<unknown>(throwing), "x", [1]), p.Error, "write failed");
  Assert.assertSame([["set", "x", [1]]], throwing.calls);
});

xaravelTest("XT-runtime-110", "String RHS coercion observes every receiver write and restores Ref descriptors", () => {
  const evidence = readFileSync(`${import.meta.dir}/php-offset-assign.probe.txt`, "utf8").trim().split("\n");
  for (const mode of ["ordinary", "builtin", "detached"]) {
    for (const action of ["mutate", "throw", "same", "unchanged", "nested", "empty", "multibyte"]) {
      const object = mode === "builtin" ? new p.ArrayObject({ x: "abc" }) : new Overridden({ x: "abc" });
      const reference = mode === "ordinary" ? new p.Ref<unknown>("abc") : p.offsetReference(object, "x");
      const before = Object.getOwnPropertyDescriptor(reference, "value")!;
      class Conversion {
        calls = 0;
        toString(): string {
          this.calls++;
          if (action === "mutate" || action === "throw") reference.value = "longer";
          if (["same", "empty", "multibyte"].includes(action)) reference.value = "abc";
          if (action === "nested") p.offsetAssign(reference, 0, "Q");
          if (action === "throw") throw new p.Error("conversion failed");
          return action === "empty" ? "" : action === "multibyte" ? "é" : "Z";
        }
      }
      const conversion = new Conversion();
      if (action === "throw") {
        failure(() => p.offsetAssign(reference, 1, conversion), p.Error, "conversion failed");
        Assert.assertTrue(evidence.includes(`conversion1 Error: conversion failed ${p.jsonEncode([reference.value, conversion.calls])}`));
      } else {
        const result = p.offsetAssign(reference, 1, conversion);
        const label = action === "mutate" ? "conversion0" : `conversion-${action}`;
        Assert.assertTrue(evidence.includes(`${label} ${p.jsonEncode([reference.value, result, conversion.calls])}`));
      }
      Assert.assertSame(1, conversion.calls);
      const after = Object.getOwnPropertyDescriptor(reference, "value")!;
      Assert.assertSame(before.configurable, after.configurable);
      Assert.assertSame(before.enumerable, after.enumerable);
      Assert.assertTrue(before.get === after.get);
      Assert.assertTrue(before.set === after.set);
      Assert.assertSame(before.writable, after.writable);
      if (mode === "builtin") Assert.assertSame(reference.value, object.offsetGet("x"));
      if (mode === "detached") Assert.assertSame("abc", object.offsetGet("x"));
      p.offsetAssign(reference, 2, "X");
      Assert.assertSame("X", (reference.value as string)[2]);
    }
  }
});

xaravelTest("XT-runtime-111", "Shared builtin slot coercion preserves sibling writes, descriptors and PHP copy boundaries", () => {
  const evidence = readFileSync(`${import.meta.dir}/php-offset-assign.probe.txt`, "utf8").trim().split("\n");
  for (const action of ["same", "changed", "nested", "throw"]) {
    const object = new p.ArrayObject({ x: "abc" });
    const wrapper = new p.ArrayObject(object);
    const first = p.offsetReference(object, "x");
    const sibling = p.offsetReference(wrapper, "x");
    const target = offsetReferenceTarget(first);
    Assert.assertTrue(target === offsetReferenceTarget(sibling));
    const slotDescriptor = Object.getOwnPropertyDescriptor(target, "value")!;
    const descriptor = Object.getOwnPropertyDescriptor(first, "value")!;
    class Conversion {
      calls = 0;
      toString(): string {
        this.calls++;
        if (action === "nested") p.offsetAssign(sibling, 0, "Q");
        else sibling.value = action === "same" ? "abc" : "longer";
        if (action === "throw") throw new p.Error("sibling failed");
        return "Z";
      }
    }
    const conversion = new Conversion();
    if (action === "throw") {
      failure(() => p.offsetAssign(first, 1, conversion), p.Error, "sibling failed");
      Assert.assertTrue(evidence.includes(`sibling-throw Error: sibling failed ${p.jsonEncode([first.value, sibling.value, object.getArrayCopy(), conversion.calls])}`));
    } else {
      const result = p.offsetAssign(first, 1, conversion);
      Assert.assertTrue(evidence.includes(`sibling-${action} ${p.jsonEncode([first.value, sibling.value, object.getArrayCopy(), result, conversion.calls])}`));
    }
    const restoredSlot = Object.getOwnPropertyDescriptor(target, "value")!;
    Assert.assertSame(slotDescriptor.configurable, restoredSlot.configurable);
    Assert.assertSame(slotDescriptor.enumerable, restoredSlot.enumerable);
    Assert.assertSame(slotDescriptor.writable, restoredSlot.writable);
    Assert.assertFalse("get" in restoredSlot);
    Assert.assertFalse("set" in restoredSlot);
    const restored = Object.getOwnPropertyDescriptor(first, "value")!;
    Assert.assertTrue(descriptor.get === restored.get);
    Assert.assertTrue(descriptor.set === restored.set);
    Assert.assertSame(1, conversion.calls);
    // A subsequent coercion with no writes must commit, so no stale observer
    // may survive either the successful conversion or the throwing callback.
    class Unchanged { toString(): string { return "X"; } }
    Assert.assertSame("X", p.offsetAssign(sibling, 0, new Unchanged()));
    Assert.assertSame("X", (first.value as string)[0]);
    Assert.assertSame(first.value, wrapper.offsetGet("x"));
  }
  const sealed = Object.seal(new p.Ref<unknown>("abc"));
  Assert.assertSame("Z", p.offsetAssign(sealed, 1, "Z"));
  Assert.assertSame("aZc", sealed.value);
  const negative = new p.Ref<unknown>("abc");
  class NegativeConversion { calls = 0; toString(): string { this.calls++; return "Z"; } }
  const conversion = new NegativeConversion();
  const ignored = p.offsetAssign(negative, -5, conversion);
  Assert.assertSame(0, conversion.calls);
  Assert.assertTrue(evidence.includes(`negative-no-conversion ${p.jsonEncode([negative.value, ignored, conversion.calls])}`));
  const source = { child: [1] };
  const self = new p.Ref<unknown>(source);
  const result = p.offsetAssign(self, "self", self.value) as typeof source;
  (self.value as typeof source).child.push(2);
  Assert.assertSame({ child: [1] }, source);
  Assert.assertSame({ child: [1] }, result);
  Assert.assertTrue(evidence.includes(`self-copy ${p.jsonEncode([self.value, result])}`));
  result.child.push(3);
  Assert.assertSame([1], (self.value as { self: typeof source }).self.child);
  const access = new Access(); const key = new p.stdClass(); const value = new p.stdClass();
  const returned = p.offsetAssign(new p.Ref<unknown>(access), key, value);
  const handles = [access.calls[0]![1] === key, access.calls[0]![2] === value, returned === value];
  Assert.assertSame([true, true, true], handles);
  Assert.assertTrue(evidence.includes(`object-handles ${p.jsonEncode(handles)}`));
});

xaravelTest("XT-runtime-112", "Nested object coercion restores observers across shared detached slots and preserves copy boundaries", () => {
  const evidence = readFileSync(`${import.meta.dir}/php-offset-assign.probe.txt`, "utf8").trim().split("\n");
  for (const mode of ["ordinary", "shared"]) for (const throws of [false, true]) {
    const object = new p.ArrayObject({ x: "abc" });
    const first = mode === "shared" ? p.offsetReference(object, "x") : new p.Ref<unknown>("abc");
    const sibling = mode === "shared" ? p.offsetReference(object, "x") : first;
    const target = offsetReferenceTarget(first);
    const before = Object.getOwnPropertyDescriptor(target, "value")!;
    const firstBefore = Object.getOwnPropertyDescriptor(first, "value")!;
    class Inner {
      calls = 0;
      toString(): string {
        this.calls++;
        if (throws) { sibling.value = "longer"; throw new p.Error("inner failed"); }
        return "Q";
      }
    }
    const inner = new Inner();
    class Outer {
      calls = 0;
      innerResult: unknown = null;
      toString(): string { this.calls++; this.innerResult = p.offsetAssign(sibling, 0, inner); return "Z"; }
    }
    const outer = new Outer();
    if (throws) {
      failure(() => p.offsetAssign(first, 1, outer), p.Error, "inner failed");
      Assert.assertTrue(evidence.includes(`nested-object-${mode}-1 Error: inner failed ${p.jsonEncode([first.value, sibling.value, outer.innerResult, outer.calls, inner.calls])}`));
    } else {
      const result = p.offsetAssign(first, 1, outer);
      Assert.assertNull(result);
      Assert.assertTrue(evidence.includes(`nested-object-${mode}-0 ${p.jsonEncode([first.value, sibling.value, result, outer.innerResult, outer.calls, inner.calls])}`));
    }
    const after = Object.getOwnPropertyDescriptor(target, "value")!;
    Assert.assertSame(before.configurable, after.configurable);
    Assert.assertSame(before.enumerable, after.enumerable);
    Assert.assertSame(before.writable, after.writable);
    Assert.assertTrue(before.get === after.get);
    Assert.assertTrue(before.set === after.set);
    const firstAfter = Object.getOwnPropertyDescriptor(first, "value")!;
    Assert.assertSame(firstBefore.configurable, firstAfter.configurable);
    Assert.assertSame(firstBefore.enumerable, firstAfter.enumerable);
    Assert.assertSame(firstBefore.writable, firstAfter.writable);
    Assert.assertTrue(firstBefore.get === firstAfter.get);
    Assert.assertTrue(firstBefore.set === firstAfter.set);
    class Unchanged { toString(): string { return "X"; } }
    Assert.assertSame("X", p.offsetAssign(sibling, 0, new Unchanged()));
    Assert.assertSame("X", (first.value as string)[0]);
    if (mode === "shared") Assert.assertSame(first.value, object.offsetGet("x"));
  }
  for (const action of ["replace", "reinsert", "exchange"]) {
    const object = new p.ArrayObject({ x: "abc" });
    const first = p.offsetReference(object, "x"); const sibling = p.offsetReference(object, "x");
    if (action === "replace") object.offsetSet("x", "replacement");
    else if (action === "reinsert") { object.offsetUnset("x"); object.offsetSet("x", "replacement"); }
    else object.exchangeArray({ x: "replacement" });
    class DetachedConversion { toString(): string { sibling.value = "longer"; return "Z"; } }
    const result = p.offsetAssign(first, 1, new DetachedConversion());
    Assert.assertNull(result);
    Assert.assertSame("longer", first.value);
    Assert.assertSame("replacement", object.offsetGet("x"));
    Assert.assertTrue(evidence.includes(`detached-coercion-${action} ${p.jsonEncode([first.value, sibling.value, object.getArrayCopy(), result])}`));
  }
  for (const [i, initial] of [null, false].entries()) {
    const ref = new p.Ref<unknown>(initial);
    const result = p.offsetAssign(ref, null, "value");
    const keys = p.arrayEntries(ref.value as object).map(([key]) => key);
    Assert.assertSame([0], keys);
    Assert.assertSame("value", result);
    Assert.assertTrue(evidence.includes(`convert-append${i} ${p.jsonEncode([ref.value, keys, result])}`));
  }
  const handle = new p.stdClass();
  const direct = new p.Ref<unknown>([]);
  Assert.assertTrue(p.offsetAssign(direct, null, handle) === handle);
  const nested = p.offsetAssign(direct, null, { child: { handle } }) as { child: { handle: p.stdClass } };
  Assert.assertTrue(nested.child.handle === handle);
  const old = { existing: { child: [1] } };
  const separated = new p.Ref<unknown>(old);
  p.offsetAssign(separated, "added", 2);
  (separated.value as typeof old).existing.child.push(3);
  Assert.assertSame({ existing: { child: [1] } }, old);
  for (const action of ["object-key", "append"]) {
    const ref = new p.Ref<unknown>("abc");
    class Conversion { calls = 0; toString(): string { this.calls++; return "Z"; } }
    const value = new Conversion();
    const message = action === "append" ? "[] operator not supported for strings" : "Cannot access offset of type stdClass on string";
    const klass = action === "append" ? p.Error : p.TypeError;
    failure(() => p.offsetAssign(ref, action === "append" ? null : new p.stdClass(), value), klass, message);
    Assert.assertSame("abc", ref.value);
    Assert.assertSame(0, value.calls);
    Assert.assertTrue(evidence.includes(`reject-before-conversion-${action} ${action === "append" ? "Error" : "TypeError"}: ${message} ${p.jsonEncode([ref.value, value.calls])}`));
  }
});
