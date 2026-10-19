// Story 6.1 fixture: fails `no-floating-promises` (checkThenables) only.
import { q } from "./builder";

export function run(): void {
  q().where("id");
}
