// Illuminate\Contracts\Translation\Loader, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { PhpArrayLike } from "../structural/PhpArrayLike";

declare const LoaderBrand: unique symbol;

export interface Loader {
  readonly [Loader.brand]: true;

  /** Load the messages for the given locale. */
  load(locale: string, group: string, namespace?: string | null): PhpArrayLike;

  /** Add a new namespace to the loader. */
  addNamespace(namespace: string, hint: string): void;

  /** Add a new JSON path to the loader. */
  addJsonPath(path: string): void;

  /** Get an array of all the registered namespaces. */
  namespaces(): PhpArrayLike;
}

export const Loader = contract<Loader, typeof LoaderBrand>(
  "Illuminate\\Contracts\\Translation\\Loader",
  {
    addJsonPath: ["path"],
    addNamespace: ["namespace", "hint"],
    load: ["locale", "group", "namespace"],
    namespaces: [],
  },
);
