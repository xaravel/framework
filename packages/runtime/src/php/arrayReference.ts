// PHP array references capture a cell, independently of any array's later lifetime.
import { arrayCells, attachArrayCells, type ArrayCell } from "./arrayReferenceCells";
import { toPhpArray } from "./arrayFunctions";
import type { PhpArrayKey } from "./PhpArray";
import type { Ref } from "./Ref";
import { valueCopy } from "./valueCopy";

/** Internal: offset assignment writes through an existing cell, preserving sibling cells. */
export function assignedArray(_owner: Ref<unknown>, previous: object, next: object, key: PhpArrayKey, value: unknown): void {
  const cells = arrayCells(previous);
  const cell = cells?.get(key);
  if (cell !== undefined) cell.value = value;
  if (cells !== null) attachArrayCells(next, new Map(cells));
}

/** Internal: acquire a slot in an already separated array. */
export function arrayReference(owner: Ref<unknown>, key: PhpArrayKey): { cell: ArrayCell; write: (value: unknown) => void } {
  const array = owner.value as object;
  const cells = arrayCells(array) ?? new Map<PhpArrayKey, ArrayCell>();
  let cell = cells.get(key);
  if (cell === undefined) {
    cell = { value: toPhpArray(array).get(key) };
    cells.set(key, cell);
    attachArrayCells(array, cells);
  }
  const captured = cell;
  return { cell, write: (value) => { captured.value = valueCopy(value); } };
}
