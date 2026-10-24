// Illuminate\Contracts\Routing\Registrar, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { Closure } from "../structural/Closure";
import type { PendingResourceRegistration } from "../structural/PendingResourceRegistration";
import type { PhpArrayLike } from "../structural/PhpArrayLike";
import type { Route } from "../structural/Route";

declare const RegistrarBrand: unique symbol;

export interface Registrar {
  readonly [Registrar.brand]: true;

  /** Register a new GET route with the router. */
  get(uri: string, action: PhpArrayLike | Closure | string): Route;

  /** Register a new POST route with the router. */
  post(uri: string, action: PhpArrayLike | Closure | string): Route;

  /** Register a new PUT route with the router. */
  put(uri: string, action: PhpArrayLike | Closure | string): Route;

  /** Register a new DELETE route with the router. */
  delete(uri: string, action: PhpArrayLike | Closure | string): Route;

  /** Register a new PATCH route with the router. */
  patch(uri: string, action: PhpArrayLike | Closure | string): Route;

  /** Register a new OPTIONS route with the router. */
  options(uri: string, action: PhpArrayLike | Closure | string): Route;

  /** Register a new route with the given verbs. */
  match(methods: PhpArrayLike | string, uri: string, action: PhpArrayLike | Closure | string): Route;

  /** Route a resource to a controller. */
  resource(name: string, controller: string, options?: PhpArrayLike): PendingResourceRegistration;

  /** Create a route group with shared attributes. */
  group(attributes: PhpArrayLike, routes: Closure | string): void;

  /**
   * Substitute the route bindings onto the route.
   * Runs the explicit binding callbacks, which DIV-1 lets be async.
   * @asyncRoot callback
   */
  substituteBindings(route: Route): Promise<Route>;

  /**
   * Substitute the implicit Eloquent model bindings for the route.
   * Resolves each bound model through its query.
   * @asyncRoot Database\ConnectionInterface.select
   */
  substituteImplicitBindings(route: Route): Promise<void>;
}

export const Registrar = contract<Registrar, typeof RegistrarBrand>(
  "Illuminate\\Contracts\\Routing\\Registrar",
  {
    delete: ["uri", "action"],
    get: ["uri", "action"],
    group: ["attributes", "routes"],
    match: ["methods", "uri", "action"],
    options: ["uri", "action"],
    patch: ["uri", "action"],
    post: ["uri", "action"],
    put: ["uri", "action"],
    resource: ["name", "controller", "options"],
    substituteBindings: ["route"],
    substituteImplicitBindings: ["route"],
  },
);
