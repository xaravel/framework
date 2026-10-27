// Internal array-value metadata. Copies carry the position; Ref writes separate before changing it.
const ARRAY_POINTER = Symbol("xaravel.php.array-pointer");
export function arrayPointer(array: object): number { return (array as Record<symbol, number>)[ARRAY_POINTER] ?? 0; }
export function setArrayPointer(array: object, index: number): void {
  Object.defineProperty(array, ARRAY_POINTER, { value: index, writable: true, configurable: true });
}
export function copyArrayPointer<T extends object>(source: object, target: T): T {
  setArrayPointer(target, arrayPointer(source));
  return target;
}
