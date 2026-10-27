// Internal array-value metadata. Copies carry the position; Ref writes separate before changing it.
const ARRAY_POINTER = Symbol("xaravel.php.array-pointer");
const POINTER_KEYS = Symbol("xaravel.php.array-pointer-keys");
export function arrayPointer(array: object): number {
  const index = (array as Record<symbol, number>)[ARRAY_POINTER] ?? 0;
  const previous = (array as Record<symbol, string[] | undefined>)[POINTER_KEYS];
  if (previous === undefined) return index;
  const keys = Object.keys(array);
  // Native map deletion cannot notify us. Follow the selected bucket or its next surviving successor.
  const remaining = new Set(keys);
  for (let i = index; i < previous.length; i++) {
    if (remaining.has(previous[i]!)) return keys.indexOf(previous[i]!);
  }
  return index - previous.slice(0, index).filter((key) => !remaining.has(key)).length;
}
export function setArrayPointer(array: object, index: number): void {
  Object.defineProperty(array, ARRAY_POINTER, { value: index, writable: true, configurable: true });
  if (!Array.isArray(array) && !(Symbol.for("xaravel.php.array") in array)) {
    Object.defineProperty(array, POINTER_KEYS, { value: Object.keys(array), configurable: true });
  }
}
export function copyArrayPointer<T extends object>(source: object, target: T): T {
  setArrayPointer(target, arrayPointer(source));
  return target;
}
