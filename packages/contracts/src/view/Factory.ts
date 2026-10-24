// Illuminate\Contracts\View\Factory, from laravel/framework v13.37.0.
// Every method is sync. `make` and `file` return the View at once, as AD-11's `view(...)` does; the `creating:`
// event they dispatch is the open question of conformance/escalations/ESC-10.3-1.md, ported here under its
// recommended option 1 (the View awaits that dispatch before it renders).
import { contract } from "../Contract";
import type { Arrayable } from "../support/Arrayable";
import type { Closure } from "../structural/Closure";
import type { PhpArrayLike } from "../structural/PhpArrayLike";
import type { View } from "./View";

declare const FactoryBrand: unique symbol;

export interface Factory {
  readonly [Factory.brand]: true;

  /** Determine if a given view exists. */
  exists(view: string): boolean;

  /** Get the evaluated view contents for the given path (ESC-10.3-1, option 1: sync). */
  file(path: string, data?: Arrayable | PhpArrayLike, mergeData?: PhpArrayLike): View;
  file(path: string, options?: { data?: Arrayable | PhpArrayLike; mergeData?: PhpArrayLike }): View;

  /** Get the evaluated view contents for the given view (ESC-10.3-1, option 1: sync). */
  make(view: string, data?: Arrayable | PhpArrayLike, mergeData?: PhpArrayLike): View;
  make(view: string, options?: { data?: Arrayable | PhpArrayLike; mergeData?: PhpArrayLike }): View;

  /** Add a piece of shared data to the environment. */
  share(key: PhpArrayLike | string, value?: unknown): unknown;

  /** Register a view composer event. */
  composer(views: PhpArrayLike | string, callback: Closure | string): PhpArrayLike;

  /** Register a view creator event. */
  creator(views: PhpArrayLike | string, callback: Closure | string): PhpArrayLike;

  /** Add a new namespace to the loader. */
  addNamespace(namespace: string, hints: PhpArrayLike | string): this;

  /** Replace the namespace hints for the given namespace. */
  replaceNamespace(namespace: string, hints: PhpArrayLike | string): this;
}

export const Factory = contract<Factory, typeof FactoryBrand>(
  "Illuminate\\Contracts\\View\\Factory",
  {
    addNamespace: ["namespace", "hints"],
    composer: ["views", "callback"],
    creator: ["views", "callback"],
    exists: ["view"],
    file: ["path", "data", "mergeData"],
    make: ["view", "data", "mergeData"],
    replaceNamespace: ["namespace", "hints"],
    share: ["key", "value"],
  },
);
