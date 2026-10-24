// Illuminate\Contracts\Routing\UrlGenerator, from laravel/framework v13.37.0.
// Every method is sync: it reads the current request, held per frame (AD-5), and signs URLs locally.
import { contract } from "../Contract";
import type { DateInterval } from "../psr/SimpleCache/DateInterval";
import type { DateTimeInterface } from "../structural/DateTimeInterface";
import type { PhpArrayLike } from "../structural/PhpArrayLike";

declare const UrlGeneratorBrand: unique symbol;

export interface UrlGenerator {
  readonly [UrlGenerator.brand]: true;

  /** Get the current URL for the request. */
  current(): string;

  /** Get the URL for the previous request. */
  previous(fallback?: unknown): string;

  /** Generate an absolute URL to the given path. */
  to(path: string, extra?: unknown, secure?: boolean | null): string;
  to(path: string, options?: { extra?: unknown; secure?: boolean | null }): string;

  /** Generate a secure, absolute URL to the given path. */
  secure(path: string, parameters?: PhpArrayLike): string;

  /** Generate the URL to an application asset. */
  asset(path: string, secure?: boolean | null): string;

  /** Get the URL to a named route; throws an `InvalidArgumentException` for an unknown route. */
  route(name: string, parameters?: unknown, absolute?: boolean): string;
  route(name: string, options?: { parameters?: unknown; absolute?: boolean }): string;

  /** Create a signed route URL for a named route; throws an `InvalidArgumentException` for a reserved parameter. */
  signedRoute(name: string, parameters?: unknown, expiration?: DateTimeInterface | DateInterval | number | null, absolute?: boolean): string;
  signedRoute(name: string, options?: { parameters?: unknown; expiration?: DateTimeInterface | DateInterval | number | null; absolute?: boolean }): string;

  /** Create a temporary signed route URL for a named route. */
  temporarySignedRoute(name: string, expiration: DateTimeInterface | DateInterval | number, parameters?: PhpArrayLike, absolute?: boolean): string;
  temporarySignedRoute(name: string, expiration: DateTimeInterface | DateInterval | number, options?: { parameters?: PhpArrayLike; absolute?: boolean }): string;

  /** Generate an absolute URL with the given query parameters. */
  query(path: string, query?: PhpArrayLike, extra?: unknown, secure?: boolean | null): string;
  query(path: string, options?: { query?: PhpArrayLike; extra?: unknown; secure?: boolean | null }): string;

  /** Get the URL to a controller action. */
  action(action: PhpArrayLike | string, parameters?: unknown, absolute?: boolean): string;
  action(action: PhpArrayLike | string, options?: { parameters?: unknown; absolute?: boolean }): string;

  /** Get the root controller namespace. */
  getRootControllerNamespace(): string;

  /** Set the root controller namespace. */
  setRootControllerNamespace(rootNamespace: string): this;
}

export const UrlGenerator = contract<UrlGenerator, typeof UrlGeneratorBrand>(
  "Illuminate\\Contracts\\Routing\\UrlGenerator",
  {
    action: ["action", "parameters", "absolute"],
    asset: ["path", "secure"],
    current: [],
    getRootControllerNamespace: [],
    previous: ["fallback"],
    query: ["path", "query", "extra", "secure"],
    route: ["name", "parameters", "absolute"],
    secure: ["path", "parameters"],
    setRootControllerNamespace: ["rootNamespace"],
    signedRoute: ["name", "parameters", "expiration", "absolute"],
    temporarySignedRoute: ["name", "expiration", "parameters", "absolute"],
    to: ["path", "extra", "secure"],
  },
);
