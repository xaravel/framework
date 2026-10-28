// PHP reference cells embedded in native array representations. Internal.
import type { PhpArrayKey } from "./PhpArray";
export interface ArrayCell { value: unknown }
const slots = new WeakMap<object, Map<PhpArrayKey, ArrayCell>>();
const getters = new WeakMap<() => unknown, ArrayCell>();
export function arrayCells(array: object): Map<PhpArrayKey, ArrayCell> | null {
  const cells = slots.get(array) ?? null;
  if (cells !== null && !(Symbol.for("xaravel.php.array") in array)) {
    for (const [key, cell] of cells) {
      const descriptor = Object.getOwnPropertyDescriptor(array, String(key)) as { get?: (this: void) => unknown } | undefined;
      const getter = descriptor?.get;
      if (getter === undefined || getters.get(getter) !== cell) cells.delete(key);
    }
  }
  return cells;
}
export function attachArrayCells(array: object, cells: Map<PhpArrayKey, ArrayCell>): void {
  slots.set(array, cells);
  // PhpArray reads cells in its own storage methods. Lists and plain maps expose
  // ordinary enumerable properties, so every reader sees the cell's value.
  if (Symbol.for("xaravel.php.array") in array) return;
  for (const [key, cell] of cells) {
    const get = (): unknown => cell.value;
    getters.set(get, cell);
    Object.defineProperty(array, String(key), {
      enumerable: true, configurable: true,
      get,
      set: (value: unknown) => { cell.value = value ?? null; },
    });
  }
}
/** `zend_array_dup` preserves existing reference cells. */
export function copyArrayCells(source: object, target: object): void {
  const cells = arrayCells(source);
  if (cells !== null) attachArrayCells(target, new Map(cells));
}

// Entry metadata keeps references attached to their elements while keys change.
const entryCells = new WeakMap<object, ArrayCell>();
export function entryCell(entry: readonly unknown[]): ArrayCell | null {
  return entryCells.get(entry) ?? null;
}
export function referenceEntry<K, V>(key: K, value: V, cell: ArrayCell | null): [K, V] {
  const entry: [K, V] = [key, value];
  if (cell !== null) {
    entryCells.set(entry, cell);
    // PHP entries containing references read their current zval, including after user callbacks.
    Object.defineProperty(entry, "1", { enumerable: true, configurable: true, get: () => cell.value });
  }
  return entry;
}
export function rekeyEntry<K>(entry: readonly [unknown, unknown], key: K): [K, unknown] {
  return referenceEntry(key, entry[1], entryCell(entry));
}
/** Attach a surviving entry, or remove a replaced entry's old reference. */
export function setEntryCell(array: object, key: PhpArrayKey, entry: readonly unknown[]): void {
  const cell = entryCell(entry);
  const previous = arrayCells(array);
  if (previous === null && cell === null) return;
  const cells = previous ?? new Map<PhpArrayKey, ArrayCell>();
  cells.delete(key);
  if (cell !== null) cells.set(key, cell);
  attachArrayCells(array, cells);
}
