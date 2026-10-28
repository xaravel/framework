import { readFileSync } from "node:fs";
import { Assert, xaravelTest } from "@xaravel/assert";
import { referenceAt as rootReferenceAt, registerClass } from "@xaravel/runtime";
import * as p from "@xaravel/runtime/php";

const evidence = readFileSync(`${import.meta.dir}/php-reference-at.probe.txt`, "utf8").trim().split("\n");
function record(rows: string[], name: string, ...values: unknown[]): void {
  rows.push(`${name} ${p.jsonEncode(values)}`);
}
function acquire(rows: string[], name: string, initial: unknown, key: unknown): void {
  const root = new p.Ref(initial);
  try {
    const reference = p.referenceAt(root, key);
    record(rows, name, root.value, reference.value);
    reference.value = [7];
    record(rows, `${name}-write`, root.value, reference.value);
  } catch (error) {
    Assert.assertTrue(error instanceof p.Error || error instanceof p.TypeError);
    record(rows, name, error instanceof p.TypeError ? "TypeError" : "Error", (error as p.Error).getMessage(), root.value);
  }
}

xaravelTest("XT-runtime-114", "referenceAt scalar, string and array acquisition matches independent PHP 8.5.11 evidence", () => {
  Assert.assertTrue(rootReferenceAt === p.referenceAt);
  const rows = ["PHP 8.5.11"];
  for (const [i, value] of [null, false, true, 12, 1.5].entries()) acquire(rows, `scalar${i}`, value, "x");
  for (const [i, value] of [null, false, []].entries()) acquire(rows, `invalid${i}`, value, []);
  for (const [i, key] of [0, 1, -1, 5, -5, "0", "01", "1x", "1.5", " 1 ", true, false, 1.75, [], new p.stdClass(), null, "9223372036854775808", "-9223372036854775809", "1e0", "1.0", "0x1", " 1x", "x1"].entries()) {
    acquire(rows, `string${i}`, "abc", key);
  }
  const arrays: [unknown, unknown][] = [[[], "x"], [[1], 0], [{ x: 1 }, "x"], [new p.PhpArray<p.PhpArrayKey, number>([["a", 1], [2, 3]]), 2], [[], null]];
  for (const [i, [value, key]] of arrays.entries()) acquire(rows, `array${i}`, value, key);
  for (const [i, key] of ["2", "02", true, false, 2.75, -2, 9223372036854775807n, "__proto__"].entries()) acquire(rows, `key${i}`, [], key);
  acquire(rows, "overflow", new p.PhpArray([[9223372036854775807n, "max"]]), null);
  acquire(rows, "object", new p.stdClass(), "x");
  Assert.assertSame(evidence.slice(0, evidence.findIndex((line) => line.startsWith("access0 "))), rows);
});

class ReferenceInherited extends p.ArrayObject {}
registerClass("ReferenceInherited", ReferenceInherited);
class ReferenceValue extends p.ArrayObject {
  override offsetGet(key: p.PhpKeyInput): unknown { return super.offsetGet(key); }
}
class ReferenceUser implements p.ArrayAccess {
  calls: unknown[] = [];
  get [p.ArrayAccess.brand](): true { return true; }
  offsetExists(key: unknown): boolean { this.calls.push(["exists", key]); return false; }
  offsetGet(key: unknown): unknown { this.calls.push(["get", key]); return []; }
  offsetSet(key: unknown, value: unknown): void { this.calls.push(["set", key, value]); }
  offsetUnset(): void {}
}

xaravelTest("XT-runtime-115", "referenceAt delegates ArrayAccess and preserves array value copies and object handles", () => {
  const rows: string[] = [];
  for (const [i, object] of [new p.ArrayObject({ x: [] }), new ReferenceInherited({ x: [] }), new ReferenceValue({ x: [] })].entries()) {
    const reference = p.referenceAt(new p.Ref<unknown>(object), "x");
    p.arrayAppend(reference, 7);
    record(rows, `access${i}`, object.getArrayCopy(), reference.value);
  }
  const appended = new p.ArrayObject();
  const appendedReference = p.referenceAt(new p.Ref<unknown>(appended), null);
  p.arrayAppend(appendedReference, 7);
  record(rows, "access-null", appended.getArrayCopy(), appendedReference.value);
  const user = new ReferenceUser();
  const local = p.referenceAt(new p.Ref<unknown>(user), null);
  p.arrayAppend(local, 7);
  record(rows, "user", user.calls, local.value);
  Assert.assertSame(evidence.filter((line) => /^(access\d|access-null|user) /.test(line)), rows);
  for (const initial of [[], { x: null }, new p.PhpArray([["x", null]])]) {
    const root = new p.Ref<unknown>(initial);
    const slot = p.referenceAt(root, "x");
    const handle = new p.stdClass();
    const assigned = { child: [1], handle };
    slot.value = assigned;
    assigned.child.push(2);
    Assert.assertSame([1], (slot.value as typeof assigned).child);
    Assert.assertTrue((slot.value as typeof assigned).handle === handle);
    (slot.value as typeof assigned).child.push(3);
    Assert.assertSame([1, 3], (p.referenceAt(root, "x").value as typeof assigned).child);
  }
});

xaravelTest("XT-runtime-116", "referenceAt captured array slots retain aliases across sibling writes, overwrite, unset and root replacement", () => {
  const rows: string[] = [];
  const root = new p.Ref<unknown>({ x: [1], y: [2] });
  const a = p.referenceAt(root, "x");
  const b = p.referenceAt(root, "x");
  a.value = [3];
  record(rows, "shared", root.value, a.value, b.value);
  p.offsetAssign(root, "y", [4]);
  p.offsetAssign(root, "x", [5]);
  record(rows, "overwrite", root.value, a.value, b.value);
  // unset has no public arbitrary-receiver helper; deleting the captured key
  // models the PHP operation directly on this plain-map array representation.
  delete (root.value as Record<string, unknown>).x;
  p.arrayAppend(a, 6);
  record(rows, "unset", root.value, a.value, b.value);
  p.offsetAssign(root, "x", [7]);
  p.arrayAppend(b, 8);
  record(rows, "reinsert", root.value, a.value, b.value);
  root.value = [];
  p.arrayAppend(a, 9);
  record(rows, "replace", root.value, a.value, b.value);
  Assert.assertSame(evidence.filter((line) => /^(shared|overwrite|unset|reinsert|replace) /.test(line)), rows);
  const copies: string[] = [];
  for (const after of [true, false]) {
    const original = new p.Ref<unknown>({ x: [1] });
    let reference: p.Ref<unknown>;
    let copy: unknown;
    if (after) {
      reference = p.referenceAt(original, "x");
      copy = p.valueCopy(original.value);
    } else {
      copy = p.valueCopy(original.value);
      reference = p.referenceAt(original, "x");
    }
    p.arrayAppend(reference, 2);
    record(copies, `copy-${after ? "after" : "before"}-reference`, original.value, copy, reference.value);
  }
  Assert.assertSame(evidence.filter((line) => line.startsWith("copy-")), copies);
});

xaravelTest("XT-runtime-117", "referenceAt composition retains PHP's earlier string offset assignments before reference failure", () => {
  const rows: string[] = [];
  for (const path of ["0.z", "1.z", "y.z", "0"]) {
    const root = new p.Ref<unknown>("abc");
    try {
      let reference = root;
      for (const key of path.split(".")) {
        p.offsetAssign(reference, key, []);
        reference = p.referenceAt(reference, key);
      }
      p.arrayAppend(reference, 7);
      record(rows, `chain-${path}`, root.value, reference.value);
    } catch (error) {
      Assert.assertTrue(error instanceof p.Error || error instanceof p.TypeError);
      record(rows, `chain-${path}`, error instanceof p.TypeError ? "TypeError" : "Error", (error as p.Error).getMessage(), root.value);
    }
  }
  Assert.assertSame(evidence.filter((line) => line.startsWith("chain-")), rows);
});

xaravelTest("XT-runtime-118", "Nested reference acquisition and copied mixed arrays preserve PHP slot sharing boundaries", () => {
  const rows: string[] = [];
  const root = new p.Ref<unknown>({ x: { y: [1] } });
  const a = p.referenceAt(p.referenceAt(root, "x"), "y");
  const b = p.referenceAt(p.referenceAt(root, "x"), "y");
  p.arrayAppend(a, 2);
  record(rows, "nested-shared", root.value, a.value, b.value);
  const sibling = p.referenceAt(p.referenceAt(root, "x"), "sibling");
  sibling.value = [3];
  p.arrayAppend(b, 4);
  record(rows, "nested-sibling", root.value, a.value, b.value, sibling.value);
  for (const after of [true, false]) {
    const original = new p.Ref<unknown>(new p.PhpArray<p.PhpArrayKey, unknown>([["x", [1]], [2, "mixed"]]));
    let reference: p.Ref<unknown>;
    let copy: p.Ref<unknown>;
    if (after) {
      reference = p.referenceAt(original, "x");
      copy = new p.Ref(p.valueCopy(original.value));
    } else {
      copy = new p.Ref(p.valueCopy(original.value));
      reference = p.referenceAt(original, "x");
    }
    p.arrayAppend(reference, 2);
    record(rows, `mixed-copy-${after ? "after" : "before"}`, original.value, copy.value, reference.value);
    p.offsetAssign(copy, "x", [8]);
    record(rows, `mixed-copy-write-${after ? "after" : "before"}`, original.value, copy.value, reference.value);
  }
  Assert.assertSame(evidence.filter((line) => /^(nested-|mixed-copy-)/.test(line)), rows);
});

xaravelTest("XT-runtime-119", "Array mutators retain captured references with surviving entries and detach removed entries", () => {
  const operations: [string, (root: p.Ref<unknown>) => unknown][] = [
    ["append", (root) => p.arrayAppend(root, 4)],
    ["pop", (root) => p.array_pop(root)],
    ["sort", (root) => p.sort(root)],
    ["shift", (root) => p.array_shift(root)],
    ["unshift", (root) => p.array_unshift(root, 4)],
    ["splice", (root) => p.array_splice(root, 1, 1, [4])],
  ];
  for (const mixed of [false, true]) {
    const rows: string[] = [];
    for (const [operation, mutate] of operations) {
      const root = new p.Ref<unknown>(mixed ? new p.PhpArray([[0, 2], [1, 1], [2, 9]]) : [2, 1, 9]);
      const slot = p.referenceAt(root, 0);
      mutate(root);
      slot.value = 7;
      record(rows, `repair-${operation}`, root.value, slot.value);
    }
    Assert.assertSame(evidence.filter((line) => /^repair-(append|pop|sort|shift|unshift|splice) /.test(line)), rows);
  }
  const rows: string[] = [];
  const shifted = new p.Ref<unknown>([2, 1, 9]);
  const shiftedSlot = p.referenceAt(shifted, 1);
  p.array_shift(shifted);
  shiftedSlot.value = 7;
  record(rows, "repair-shift-survivor", shifted.value, shiftedSlot.value);
  const popped = new p.Ref<unknown>([2, 1, 9]);
  const poppedSlot = p.referenceAt(popped, 2);
  const poppedValue = p.array_pop(popped);
  poppedSlot.value = 7;
  record(rows, "repair-pop-removed", popped.value, poppedValue, poppedSlot.value);
  const spliced = new p.Ref<unknown>([2, 1, 9]);
  const splicedSlot = p.referenceAt(spliced, 1);
  const splicedValues = p.array_splice(spliced, 1, 1, [4]);
  splicedSlot.value = 7;
  record(rows, "repair-splice-removed", spliced.value, splicedValues, splicedSlot.value);
  Assert.assertSame(evidence.filter((line) => /^repair-(shift-survivor|pop-removed|splice-removed) /.test(line)), rows);
});

xaravelTest("XT-runtime-120", "Array conversions share referenced slots while deleted and truncated slots stay absent from copies", () => {
  const rows: string[] = [];
  const conversions: [string, (array: unknown) => unknown][] = [
    ["cast", p.toPhpArray], ["filter", p.array_filter],
    ["slice", (array) => p.array_slice(array, 0, 2)], ["values", p.array_values],
  ];
  for (const [name, convert] of conversions) {
    const root = new p.Ref<unknown>({ x: 2, y: 1, z: 9 });
    const slot = p.referenceAt(root, "x");
    const copy = convert(root.value);
    slot.value = 7;
    record(rows, `repair-${name}`, root.value, copy, slot.value);
  }
  const truncated = new p.Ref<unknown>([2, 1, 9]);
  const removed = p.referenceAt(truncated, 2);
  // PHP array_splice($x, 1) is the list representation's direct truncation.
  (truncated.value as unknown[]).length = 1;
  const truncatedCopy = p.valueCopy(truncated.value);
  removed.value = 7;
  record(rows, "repair-truncate", truncated.value, truncatedCopy, removed.value);
  const mixed = new p.Ref<unknown>(new p.PhpArray<p.PhpArrayKey, unknown>([["x", 1], [2, "mixed"]]));
  const deletedMixed = p.referenceAt(mixed, "x");
  (mixed.value as p.PhpArray).delete("x");
  const mixedCopy = p.valueCopy(mixed.value);
  deletedMixed.value = 7;
  record(rows, "repair-delete-mixed", mixed.value, mixedCopy, deletedMixed.value);
  const map = new p.Ref<unknown>({ x: 1, y: 2 });
  const deletedMap = p.referenceAt(map, "x");
  delete (map.value as Record<string, unknown>).x;
  const mapCopy = p.valueCopy(map.value);
  deletedMap.value = 7;
  record(rows, "repair-delete-map", map.value, mapCopy, deletedMap.value);
  Assert.assertSame(evidence.filter((line) => /^repair-(cast|filter|slice|values|truncate|delete-mixed|delete-map) /.test(line)), rows);
  const list = new p.Ref<unknown>([2, 1, 9]);
  const listSlot = p.referenceAt(list, 0);
  const castList = p.toPhpArray(list.value);
  listSlot.value = 7;
  const castRows: string[] = [];
  record(castRows, "repair-cast-list", list.value, castList, listSlot.value);
  Assert.assertSame(evidence.filter((line) => line.startsWith("repair-cast-list ")), castRows);
});

xaravelTest("XT-runtime-121", "Copy reference acquisition shares existing cells, separates new siblings and bypasses referenced recursion", () => {
  const rows: string[] = [];
  const root = new p.Ref<unknown>({ x: 1, y: 2 });
  const slot = p.referenceAt(root, "x");
  const copy = new p.Ref<unknown>(p.valueCopy(root.value));
  const shared = p.referenceAt(copy, "x");
  const left = p.referenceAt(root, "y");
  const right = p.referenceAt(copy, "y");
  shared.value = 7;
  left.value = 8;
  right.value = 9;
  record(rows, "repair-copy-acquire", root.value, copy.value, slot.value, shared.value, left.value, right.value);
  const recursiveRoot = new p.Ref<unknown>({ slot: null });
  const recursiveSlot = p.referenceAt(recursiveRoot, "slot");
  recursiveSlot.value = {};
  const recursive = recursiveSlot.value as Record<string, unknown>;
  // The raw cycle represents PHP $r['self'] =& $r inside an already referenced value.
  // Copying its parent must share that value without descending into it.
  recursive.self = recursive;
  const recursiveCopy = p.valueCopy(recursiveRoot.value) as { slot: Record<string, unknown> };
  recursive.tag = 7;
  const self = recursiveCopy.slot.self as Record<string, unknown>;
  record(rows, "repair-recursive", self.self === self, recursiveCopy.slot.tag, self.tag);
  Assert.assertSame(evidence.filter((line) => /^repair-(copy-acquire|recursive) /.test(line)), rows);
});

xaravelTest("XT-runtime-122", "Array-returning operations preserve surviving reference cells and detach overwritten or reinserted slots", () => {
  const rows: string[] = [];
  const operations: [string, (array: unknown) => unknown][] = [
    ["combine", (array) => p.array_combine(["a", "b", "c"], array)],
    ["merge", (array) => p.array_merge(array, { extra: 4 })],
    ["merge-overwrite", (array) => p.array_merge(array, { x: 8 })],
    ["unique", p.array_unique], ["reverse", p.array_reverse],
    ["chunk", (array) => p.array_chunk(array, 2)],
    ["pad", (array) => p.array_pad(array, 4, 4)],
    ["union", (array) => p.arrayUnion(array, { x: 8, extra: 4 })],
    ["diff", (array) => p.array_diff(array, [1])],
    ["intersect", (array) => p.array_intersect(array, [2])],
    ["replace", (array) => p.array_replace(array, { y: 8 })],
    ["replace-recursive", (array) => p.array_replace_recursive(array, { y: 8 })],
  ];
  for (const [name, operation] of operations) {
    const root = new p.Ref<unknown>({ x: 2, y: 1, z: 2 });
    const slot = p.referenceAt(root, "x");
    const copy = operation(root.value);
    slot.value = 7;
    record(rows, `extended-${name}`, root.value, copy, slot.value);
  }
  const root = new p.Ref<unknown>({ x: 1, y: 2 });
  const slot = p.referenceAt(root, "x");
  const native = root.value as Record<string, unknown>;
  delete native.x;
  native.x = 8;
  const copy = p.valueCopy(root.value);
  slot.value = 7;
  record(rows, "extended-unset-reinsert", root.value, copy, slot.value);
  Assert.assertSame(evidence.filter((line) => line.startsWith("extended-")), rows);
});

xaravelTest("XT-runtime-123", "Recursive array combination detaches collided nested references while a single merge preserves them", () => {
  const rows: string[] = [];
  const operations: [string, (array: unknown) => unknown][] = [
    ["replace-recursive-collision", (array) => p.array_replace_recursive(array, { slot: { b: 2 } })],
    ["merge-recursive-collision", (array) => p.array_merge_recursive(array, { slot: { b: 2 } })],
    ["merge-recursive-single", (array) => p.array_merge_recursive(array)],
  ];
  for (const [name, operation] of operations) {
    const root = new p.Ref<unknown>({ slot: { a: 1 } });
    const slot = p.referenceAt(root, "slot");
    const copy = operation(root.value);
    p.offsetAssign(slot, "a", 7);
    record(rows, `deep-repair-${name}`, root.value, copy, slot.value);
  }
  Assert.assertSame(evidence.filter((line) => line.startsWith("deep-repair-")), rows);
});

xaravelTest("XT-runtime-124", "Array callbacks read live reference cells and multi-array map preserves captured cells", () => {
  const rows: string[] = [];
  const mapped = new p.Ref<unknown>([1]);
  const mappedSlot = p.referenceAt(mapped, 0);
  const mappedCopy = p.array_map(null, mapped.value, [2]);
  mappedSlot.value = 7;
  record(rows, "live-map-multiple", mapped.value, mappedCopy, mappedSlot.value);
  const combined = new p.Ref<unknown>([1]);
  const combinedSlot = p.referenceAt(combined, 0);
  class MutatingKey { toString(): string { combinedSlot.value = 7; return "key"; } }
  const combinedCopy = p.array_combine([new MutatingKey()], combined.value);
  record(rows, "live-combine-key", combined.value, combinedCopy, combinedSlot.value);
  const filtered = new p.Ref<unknown>([1, 2]);
  const filteredSlot = p.referenceAt(filtered, 1);
  const filterSeen: unknown[] = [];
  const filteredCopy = p.array_filter(filtered.value, (value: unknown) => { filterSeen.push(value); filteredSlot.value = 7; return true; });
  record(rows, "live-filter-callback", filtered.value, filteredCopy, filterSeen);
  const sorted = new p.Ref<unknown>([3, 1, 2]);
  const sortedSlot = p.referenceAt(sorted, 0);
  const sortSeen: unknown[] = [];
  p.uasort(sorted, (a: number, b: number) => { sortSeen.push([a, b]); sortedSlot.value = 7; return a - b; });
  record(rows, "live-sort-callback", sorted.value, sortedSlot.value, sortSeen);
  const zeroed = new p.Ref<unknown>([1, 2]);
  const firstSlot = p.referenceAt(zeroed, 0);
  const secondSlot = p.referenceAt(zeroed, 1);
  const zeroedCopy = p.array_filter(zeroed.value, (value: unknown) => { secondSlot.value = 0; return Boolean(value); });
  record(rows, "live-filter-future-zero", zeroed.value, zeroedCopy, firstSlot.value, secondSlot.value);
  Assert.assertSame(evidence.filter((line) => /^live-(map-multiple|combine-key|filter-callback|sort-callback|filter-future-zero) /.test(line)), rows);
});

xaravelTest("XT-runtime-125", "Array replacement detaches collided references and reconstruction preserves only surviving source cells", () => {
  const rows: string[] = [];
  for (const [name, replace] of [["replace", p.array_replace], ["replace-recursive", p.array_replace_recursive]] as const) {
    const root = new p.Ref<unknown>({ x: 1 });
    const slot = p.referenceAt(root, "x");
    const copy = replace(root.value, { x: 8 });
    record(rows, `live-${name}-before`, root.value, copy, slot.value);
    slot.value = 7;
    record(rows, `live-${name}-after`, root.value, copy, slot.value);
  }
  for (const [name, combine] of [["replace", p.array_replace_recursive], ["merge", p.array_merge_recursive]] as const) {
    const source = new p.Ref<unknown>({ x: { b: 2 } });
    const slot = p.referenceAt(source, "x");
    const copy = combine({ x: { a: 1 } }, source.value);
    p.offsetAssign(slot, "b", 7);
    record(rows, `live-source-${name}`, source.value, copy, slot.value);
  }
  const replacement = new p.Ref<unknown>([1]);
  const replacementSlot = p.referenceAt(replacement, 0);
  const target = new p.Ref<unknown>([8, 9]);
  const removed = p.array_splice(target, 0, 1, replacement.value);
  replacementSlot.value = 7;
  record(rows, "live-splice-replacement", replacement.value, target.value, removed, replacementSlot.value);
  const duplicate = new p.Ref<unknown>([1, 2]);
  const duplicateSlot = p.referenceAt(duplicate, 0);
  const duplicateCopy = p.array_combine(["same", "same"], duplicate.value);
  duplicateSlot.value = 7;
  record(rows, "live-combine-duplicate", duplicate.value, duplicateCopy, duplicateSlot.value);
  for (const operation of ["sort", "filter", "remove"]) {
    const root = new p.Ref<unknown>([1]);
    const slot = p.referenceAt(root, 0);
    const shared = new p.Ref<unknown>(p.array_merge(root.value, root.value));
    if (operation === "sort") p.sort(shared);
    else if (operation === "filter") shared.value = p.array_filter(shared.value);
    else p.array_shift(shared);
    slot.value = 7;
    record(rows, `live-shared-${operation}`, root.value, shared.value, slot.value);
  }
  const overflowing = new p.Ref<unknown>(new p.PhpArray([[9223372036854775807n, 1]]));
  const overflowSlot = p.referenceAt(overflowing, 9223372036854775807n);
  try { p.arrayAppend(overflowing, 2); Assert.fail("Append at PHP_INT_MAX must fail"); }
  catch (error) {
    Assert.assertTrue(error instanceof p.Error);
    record(rows, "live-overflow-error", "Error", (error as p.Error).getMessage(), overflowing.value, overflowSlot.value);
  }
  overflowSlot.value = 7;
  record(rows, "live-overflow-write", overflowing.value, overflowSlot.value);
  Assert.assertSame(evidence.filter((line) => /^live-(replace|source-|splice-replacement|combine-duplicate|shared-|overflow-)/.test(line)), rows);
});
