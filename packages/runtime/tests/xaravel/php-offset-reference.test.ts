import { readFileSync } from "node:fs";
import { Assert, xaravelTest } from "@xaravel/assert";
import { offsetReference as rootOffsetReference, registerClass, type OffsetReference } from "@xaravel/runtime";
import * as p from "@xaravel/runtime/php";

class InheritedGet extends p.ArrayObject {}
registerClass("InheritedOffsetReference", InheritedGet);
class ValueGet extends p.ArrayObject {
  override offsetGet(key: p.PhpKeyInput): unknown { return super.offsetGet(key); }
}
class UserAccess implements p.ArrayAccess {
  readonly stored = { x: [] as unknown[] };
  writes = 0;
  reads = 0;
  get [p.ArrayAccess.brand](): true { return true; }
  offsetExists(): boolean { return true; }
  offsetGet(): unknown { this.reads++; return this.stored.x; }
  offsetSet(): void { this.writes++; }
  offsetUnset(): void {}
}

// This only writes a reference; it does not emulate Arr or depend on collections.
function nestedWrite(reference: p.Ref<unknown>): unknown {
  reference.value = { y: [1] };
  return reference.value;
}

xaravelTest("XT-runtime-101", "Builtin and inherited ArrayObject offset references write through without replacing handles", () => {
  Assert.assertTrue(rootOffsetReference === p.offsetReference);
  for (const object of [new p.ArrayObject({ x: [] }), new InheritedGet({ x: [] })]) {
    const root = new p.Ref(object);
    const reference: OffsetReference = p.offsetReference(object, "x");
    Assert.assertTrue(reference instanceof p.Ref);
    Assert.assertSame({ y: [1] }, nestedWrite(reference));
    Assert.assertTrue(root.value === object);
    Assert.assertSame({ x: { y: [1] } }, object.getArrayCopy());
  }
});

xaravelTest("XT-runtime-102", "Userland offsetGet references retain local arrays and never call offsetSet", () => {
  const overridden = new ValueGet({ x: [] });
  const custom = new UserAccess();
  for (const object of [overridden, custom]) {
    const reference = p.offsetReference(object, "x");
    // Mutating the returned array itself also stays local, even if offsetGet
    // handed out its original JS array rather than a PHP-style value copy.
    (reference.value as unknown[]).push("local");
    Assert.assertSame([], object instanceof ValueGet ? object.offsetGet("x") : custom.stored.x);
    Assert.assertSame({ y: [1] }, nestedWrite(reference));
    Assert.assertSame([], object instanceof ValueGet ? object.offsetGet("x") : custom.stored.x);
    const assigned = { child: [1], handle: new p.stdClass() };
    reference.value = assigned;
    assigned.child.push(2);
    Assert.assertSame([1], (reference.value as typeof assigned).child);
    Assert.assertTrue((reference.value as typeof assigned).handle === assigned.handle);
  }
  Assert.assertSame(0, custom.writes);
  Assert.assertSame(1, custom.reads);
  Assert.assertSame({ x: [] }, overridden.getArrayCopy());
});

xaravelTest("XT-runtime-103", "Runtime leaf and null operations preserve the pinned Arr probe prerequisites", () => {
  // Preserve the exact PHP 8.5.11 evidence, including consumer-only errors and
  // the notice deliberately omitted by this runtime seam (DIV-9.17).
  const evidence = readFileSync(`${import.meta.dir}/php-offset-reference.probe.txt`, "utf8").trim().split("\n");
  const builtin = new p.ArrayObject({ x: [] });
  const result = nestedWrite(p.offsetReference(builtin, "x"));
  Assert.assertSame(evidence[0], `ArrayObject nested root=${p.jsonEncode(builtin.getArrayCopy())} return=${p.jsonEncode(result)}`);
  const overridden = new ValueGet({ x: [] });
  const local = nestedWrite(p.offsetReference(overridden, "x"));
  Assert.assertSame(evidence[2], `ValueGetArrayObject nested root=${p.jsonEncode(overridden.getArrayCopy())} return=${p.jsonEncode(local)}`);
  // A direct offsetSet reaches the root even with userland offsetGet. Arr's
  // subsequent return-type validation is Story 14.6's responsibility.
  for (const object of [builtin, overridden]) {
    object.offsetSet("x", [1]);
    Assert.assertSame(evidence[4], `root-leaf mutation=${p.jsonEncode(object.getArrayCopy())}`);
  }
  const root = new p.Ref<unknown>({ x: [] });
  p.arrayAppend(root, 1);
  Assert.assertSame(evidence[5], `null-key root=array ${p.jsonEncode(root.value)} return=${p.jsonEncode(root.value)}`);
  // Null-key selection of the whole ArrayObject is consumer policy: Arr rejects
  // the object before mutation. The seam itself references PHP's "" offset.
  const object = new p.ArrayObject({ x: [] });
  Assert.assertSame(evidence[7], `null-key ArrayObject unchanged=${p.jsonEncode(object.getArrayCopy())}`);
  p.arrayAppend(p.offsetReference(object, null), 1);
  Assert.assertSame({ x: [], "": [1] }, object.getArrayCopy());
});

xaravelTest("XT-runtime-104", "Offset references reuse wrapped storage, copy arrays and preserve object handles", () => {
  const inner = new p.ArrayObject({ x: [] });
  const wrapper = new p.ArrayObject(inner);
  const reference = p.offsetReference(wrapper, "x");
  p.arrayAppend(reference, 1);
  Assert.assertSame({ x: [1] }, inner.getArrayCopy());
  Assert.assertSame({ x: [1] }, wrapper.getArrayCopy());
  const handle = new p.stdClass();
  const assigned = { child: [1], handle };
  reference.value = assigned;
  assigned.child.push(2);
  Assert.assertSame([1], (reference.value as typeof assigned).child);
  Assert.assertTrue((reference.value as typeof assigned).handle === handle);
  const missing = p.offsetReference(inner, "missing");
  Assert.assertNull(missing.value);
  Assert.assertTrue(inner.offsetExists("missing"));
  p.arrayAppend(missing, 2);
  Assert.assertSame([2], inner.offsetGet("missing"));
  // The captured reference belongs to the original slot if the wrapper detaches.
  wrapper.exchangeArray([]);
  p.arrayAppend(missing, 3);
  Assert.assertSame([2, 3], inner.offsetGet("missing"));
  Assert.assertSame([], wrapper.getArrayCopy());
});

xaravelTest("XT-runtime-105", "Captured offsets preserve PHP slot identity across reference writes, replacement and unset", () => {
  const rows: string[] = [];
  const row = (name: string, ...values: unknown[]): void => { rows.push(`${name} ${p.jsonEncode(values)}`); };
  for (const object of [new p.ArrayObject({ x: { sibling: [2] } }), new InheritedGet({ x: { sibling: [2] } })]) {
    const reference = p.offsetReference(object, "x");
    (reference.value as Record<string, unknown>).y = [1];
    row("nested", object.getArrayCopy(), reference.value);
  }
  const object = new p.ArrayObject({ x: [1] });
  const first = p.offsetReference(object, "x");
  const second = p.offsetReference(object, "x");
  // Assigning through the reference preserves the shared cell.
  first.value = [7];
  Assert.assertSame([7], second.value);
  Assert.assertSame([7], object.offsetGet("x"));
  first.value = [1];
  object.offsetSet("x", [2]);
  row("overwrite", first.value, second.value);
  object.offsetUnset("x");
  p.arrayAppend(first, 3);
  row("unset", object.getArrayCopy(), first.value, second.value);
  object.offsetSet("x", [4]);
  p.arrayAppend(second, 5);
  row("reinsert", object.getArrayCopy(), first.value, second.value);
  // Capture while attached, then unset without an intervening overwrite.
  const removed = p.offsetReference(object, "x");
  const removedSibling = p.offsetReference(object, "x");
  removed.value = [7];
  row("reference-write", object.getArrayCopy(), removedSibling.value);
  object.offsetUnset("x");
  p.arrayAppend(removed, 6);
  row("direct-unset", object.getArrayCopy(), removedSibling.value);
  Assert.assertSame([], object.getArrayCopy());
  object.offsetSet("x", [8]);
  p.arrayAppend(removed, 7);
  Assert.assertSame([8], object.offsetGet("x"));
  Assert.assertSame([7, 6, 7], removed.value);
  row("direct-reinsert", object.getArrayCopy(), removed.value);
  const direct = new p.ArrayObject({ x: [1] });
  const directReference = p.offsetReference(direct, "x");
  direct.offsetSet("x", [2]);
  p.arrayAppend(directReference, 3);
  row("offsetSet", direct.getArrayCopy(), directReference.value);
  const inner = new p.ArrayObject({ x: [] });
  const wrapper = new p.ArrayObject(inner);
  const missing = p.offsetReference(wrapper, "missing");
  row("missing", inner.getArrayCopy(), missing.value);
  wrapper.exchangeArray([]);
  p.arrayAppend(missing, 2);
  row("exchange", inner.getArrayCopy(), wrapper.getArrayCopy(), missing.value);
  const handle = new p.stdClass();
  const handles = new p.ArrayObject({ x: handle });
  const initial = p.offsetReference(handles, "x");
  (initial.value as p.stdClass).child = [1];
  row("handle", initial.value === handle, handles.offsetGet("x") === handle, handles.getArrayCopy());
  for (const key of ["2", "02", true, false, 2.75, null, -2, 9007199254740993n, "__proto__"]) {
    const keyed = new p.ArrayObject();
    p.offsetReference(keyed, key).value = [1];
    row("key", keyed.getArrayCopy());
  }
  for (const invalid of [new p.ArrayObject({ x: [] }), new InheritedGet({ x: [] })]) {
    for (const key of [[], new p.stdClass()]) {
      let message: string | null = null;
      try { p.offsetReference(invalid, key); } catch (error) {
        Assert.assertTrue(error instanceof p.TypeError);
        message = (error as p.TypeError).getMessage();
      }
      Assert.assertNotNull(message);
      row("invalid", "TypeError", message, invalid.getArrayCopy());
    }
  }
  const evidence = readFileSync(`${import.meta.dir}/php-offset-reference-slots.probe.txt`, "utf8").trim().split("\n");
  // The final probe row records ArrayIterator's native behavior for scope
  // assessment. This item's explicit write-through contract is ArrayObject.
  Assert.assertSame(evidence.filter((line) => !line.startsWith("boundary-")).slice(0, -1), rows);
});

xaravelTest("XT-runtime-106", "Offset reference boundaries match PHP across wrappers, userland access and live iterators", () => {
  const rows: string[] = [];
  const row = (name: string, ...values: unknown[]): void => { rows.push(`boundary-${name} ${p.jsonEncode(values)}`); };
  const object = new p.ArrayObject({ x: [1] });
  const old = p.offsetReference(object, "x");
  object.offsetSet("x", [2]);
  const fresh = p.offsetReference(object, "x");
  p.arrayAppend(fresh, 3);
  row("fresh-overwrite", old.value, fresh.value, object.getArrayCopy());
  object.offsetUnset("x");
  object.offsetSet("x", [4]);
  const latest = p.offsetReference(object, "x");
  p.arrayAppend(latest, 5);
  row("fresh-reinsert", old.value, fresh.value, latest.value, object.getArrayCopy());
  const inner = new p.ArrayObject({ x: [] });
  const wrapper = new p.ArrayObject(inner);
  const wr = p.offsetReference(wrapper, "x");
  const ir = p.offsetReference(inner, "x");
  wr.value = [1];
  p.arrayAppend(ir, 2);
  row("wrapper-shared", wr.value, ir.value, inner.getArrayCopy(), wrapper.getArrayCopy());
  inner.exchangeArray({ x: [8] });
  p.arrayAppend(wr, 3);
  row("inner-exchange", wr.value, ir.value, inner.getArrayCopy(), wrapper.getArrayCopy());
  const handle = new p.stdClass();
  const user = new ValueGet({ x: handle });
  const userRef = p.offsetReference(user, "x");
  (userRef.value as p.stdClass).child = [1];
  row("user-handle", userRef.value === handle, user.offsetGet("x") === handle, user.getArrayCopy());
  class MissingAccess implements p.ArrayAccess {
    calls: unknown[] = [];
    get [p.ArrayAccess.brand](): true { return true; }
    offsetExists(key: unknown): boolean { this.calls.push(["exists", key]); return false; }
    offsetGet(key: unknown): unknown { this.calls.push(["get", key]); return null; }
    offsetSet(key: unknown): void { this.calls.push(["set", key]); }
    offsetUnset(key: unknown): void { this.calls.push(["unset", key]); }
  }
  for (const key of ["02", null, true]) {
    const access = new MissingAccess();
    const reference = p.offsetReference(access, key);
    reference.value = [1];
    row("user-missing", access.calls, reference.value);
  }
  // AD-9 normalizes only absence; userland receives the original PHP key.
  const absent = new MissingAccess();
  p.offsetReference(absent, undefined);
  Assert.assertSame([["get", null]], absent.calls);
  const builtinAbsent = new p.ArrayObject();
  p.offsetReference(builtinAbsent, undefined).value = [1];
  Assert.assertSame({ "": [1] }, builtinAbsent.getArrayCopy());
  const iterated = new p.ArrayObject({ x: [1], next: [2] });
  const reference = p.offsetReference(iterated, "x");
  const iterator = iterated.getIterator();
  iterator.offsetSet("x", [3]);
  p.arrayAppend(reference, 4);
  row("iterator-write", iterated.getArrayCopy(), reference.value);
  const current = p.offsetReference(iterated, "x");
  iterator.offsetUnset("x");
  p.arrayAppend(current, 5);
  row("iterator-delete", iterated.getArrayCopy(), current.value);
  const cursorRoot = new p.ArrayObject({ x: [1], next: [2] });
  const cursor = cursorRoot.getIterator();
  cursor.rewind();
  p.offsetReference(cursorRoot, "x").value = [3];
  row("cursor-write", cursor.key(), cursor.current());
  p.offsetReference(cursorRoot, "missing").value = [4];
  cursor.next();
  row("cursor-next", cursor.key(), cursor.current());
  cursor.next();
  row("cursor-missing", cursor.key(), cursor.current());
  cursor.next();
  row("cursor-end", cursor.valid());
  const evidence = readFileSync(`${import.meta.dir}/php-offset-reference-slots.probe.txt`, "utf8").trim().split("\n");
  Assert.assertSame(evidence.filter((line) => line.startsWith("boundary-")), rows);
});
