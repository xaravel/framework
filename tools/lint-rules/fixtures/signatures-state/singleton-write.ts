// Story 6.3 fixture: fails `xaravel/no-singleton-field-write` only, at any placement.
// `Illuminate\Routing\Router` is a singleton in tools/lint-rules/singletons.json.
import { registerClass } from "./support";

export class Router {
  current: string | null = null;

  dispatch(request: string): void {
    this.current = request;
  }
}

registerClass("Illuminate\\Routing\\Router", Router);
