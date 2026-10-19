// Story 6.1 fixture: fails `no-misused-promises` (checksVoidReturn) only.
import { each } from "./builder";

export function run(seen: string[]): void {
  each(["a", "b"], async (item) => {
    seen.push(item);
  });
}
