// Story 6.3 fixture: fails `xaravel/no-boot-only-write` only, at any placement.
// `Router::$groupStack` is boot-only in tools/lint-rules/singletons.json, written by group() and updateGroupStack().
import { registerClass } from "./support";

export class Router {
  groupStack: string[][] = [];

  dispatch(request: string): void {
    this.groupStack.push([request]);
  }
}

registerClass("Illuminate\\Routing\\Router", Router);
