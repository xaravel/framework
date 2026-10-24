// Illuminate\Routing\Route, as a contract names it (AD-1.2): a subset of its public methods that run nothing, so the
// later `@xaravel/routing` port satisfies it without contracts importing it.
import type { BackedEnum } from "./BackedEnum";
import type { PhpArrayLike } from "./PhpArrayLike";

/** A registered route. */
export interface Route {
  /** Get the URI associated with the route. */
  uri(): string;

  /** Get the HTTP verbs the route responds to. */
  methods(): PhpArrayLike;

  /** Get the name of the route instance. */
  getName(): string | null;

  /** Add or change the route name. */
  name(name: BackedEnum | string): this;

  /** Set a regular expression requirement on the route. */
  where(name: PhpArrayLike | string, expression?: string | null): this;

  /** Determine a given parameter exists from the route. */
  hasParameter(name: string): boolean;

  /**
   * Get a given parameter from the route.
   * Upstream's `$default` is `defaultValue`, `default` being a reserved word.
   */
  parameter(name: string, defaultValue?: string | object | null): string | object | null;

  /** Get the key / value list of parameters for the route. */
  parameters(): PhpArrayLike;

  /** Get the action name for the route. */
  getActionName(): string;

  /** Get the prefix of the route instance. */
  getPrefix(): string | null;

  /** Get the domain defined for the route. */
  getDomain(): string | null;
}
