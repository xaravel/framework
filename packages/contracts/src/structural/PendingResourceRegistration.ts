// Illuminate\Routing\PendingResourceRegistration, as a contract names it (AD-1.2): a subset of its public methods.
// It leaves out `register()` and the destructor that calls it, which the later `@xaravel/routing` port declares.
import type { Closure } from "./Closure";
import type { PhpArrayLike } from "./PhpArrayLike";

/** A resource route registration not yet made. */
export interface PendingResourceRegistration {
  /** Set the methods the controller should apply to. */
  only(methods: unknown): this;

  /** Set the methods the controller should exclude. */
  except(methods: unknown): this;

  /** Set the route names for controller actions. */
  names(names: PhpArrayLike | string): this;

  /** Add middleware to the resource routes. */
  middleware(middleware: unknown): this;

  /** Specify middleware that should be removed from the resource routes. */
  withoutMiddleware(middleware: PhpArrayLike | string): this;

  /** Add "where" constraints to the resource routes. */
  where(wheres: unknown): this;

  /** Indicate that the resource routes should have "shallow" nesting. */
  shallow(shallow?: boolean): this;

  /** Indicate that the resource routes should be scoped using the given binding fields. */
  scoped(fields?: PhpArrayLike): this;

  /** Define the callable that should be invoked on a missing model exception. */
  missing(callback: Closure): this;
}
