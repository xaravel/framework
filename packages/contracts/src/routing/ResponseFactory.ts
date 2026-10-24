// Illuminate\Contracts\Routing\ResponseFactory, from laravel/framework v13.37.0.
// Upstream's `$default` is `defaultValue` in `redirectToIntended`, `default` being a reserved word.
import { contract } from "../Contract";
import type { BackedEnum } from "../structural/BackedEnum";
import type { BinaryFileResponse } from "../structural/BinaryFileResponse";
import type { Closure } from "../structural/Closure";
import type { HttpResponse } from "../structural/HttpResponse";
import type { JsonResponse } from "../structural/JsonResponse";
import type { PhpArrayLike } from "../structural/PhpArrayLike";
import type { RedirectResponse } from "../structural/RedirectResponse";
import type { SplFileInfo } from "../structural/SplFileInfo";
import type { StreamedEvent } from "../structural/StreamedEvent";
import type { StreamedJsonResponse } from "../structural/StreamedJsonResponse";
import type { StreamedResponse } from "../structural/StreamedResponse";

declare const ResponseFactoryBrand: unique symbol;

export interface ResponseFactory {
  readonly [ResponseFactory.brand]: true;

  /** Create a new response instance. */
  make(content?: PhpArrayLike | string, status?: number, headers?: PhpArrayLike): HttpResponse;
  make(options?: { content?: PhpArrayLike | string; status?: number; headers?: PhpArrayLike }): HttpResponse;

  /** Create a new "no content" response. */
  noContent(status?: number, headers?: PhpArrayLike): HttpResponse;
  noContent(options?: { status?: number; headers?: PhpArrayLike }): HttpResponse;

  /**
   * Create a new response for a given view.
   * Renders the view on `setContent` (AD-11, the spine's Compilation: each compiled view module exports `render(ctx): Promise<string>`; AD-11, Views as strings: the response awaits `render()`, never
   * `toString()`).
   * @asyncRoot callback
   */
  view(view: PhpArrayLike | string, data?: PhpArrayLike, status?: number, headers?: PhpArrayLike): Promise<HttpResponse>;
  view(view: PhpArrayLike | string, options?: { data?: PhpArrayLike; status?: number; headers?: PhpArrayLike }): Promise<HttpResponse>;

  /** Create a new JSON response instance. */
  json(data?: unknown, status?: number, headers?: PhpArrayLike, options?: number): JsonResponse;
  json(options?: { data?: unknown; status?: number; headers?: PhpArrayLike; options?: number }): JsonResponse;

  /** Create a new JSONP response instance. */
  jsonp(callback: string, data?: unknown, status?: number, headers?: PhpArrayLike, options?: number): JsonResponse;
  jsonp(callback: string, options?: { data?: unknown; status?: number; headers?: PhpArrayLike; options?: number }): JsonResponse;

  /** Create a new event stream response. */
  eventStream(callback: Closure, headers?: PhpArrayLike, endStreamWith?: StreamedEvent | string | null): StreamedResponse;
  eventStream(callback: Closure, options?: { headers?: PhpArrayLike; endStreamWith?: StreamedEvent | string | null }): StreamedResponse;

  /** Create a new streamed response instance. */
  stream(callback: Closure, status?: number, headers?: PhpArrayLike): StreamedResponse;
  stream(callback: Closure, options?: { status?: number; headers?: PhpArrayLike }): StreamedResponse;

  /** Create a new streamed JSON response instance. */
  streamJson(data: PhpArrayLike, status?: number, headers?: PhpArrayLike, encodingOptions?: number): StreamedJsonResponse;
  streamJson(data: PhpArrayLike, options?: { status?: number; headers?: PhpArrayLike; encodingOptions?: number }): StreamedJsonResponse;

  /** Create a new streamed response instance as a file download. */
  streamDownload(callback: Closure, name?: string | null, headers?: PhpArrayLike, disposition?: string | null): StreamedResponse;
  streamDownload(callback: Closure, options?: { name?: string | null; headers?: PhpArrayLike; disposition?: string | null }): StreamedResponse;

  /** Create a new file download response. */
  download(file: SplFileInfo | string, name?: string | null, headers?: PhpArrayLike, disposition?: string | null): BinaryFileResponse;
  download(file: SplFileInfo | string, options?: { name?: string | null; headers?: PhpArrayLike; disposition?: string | null }): BinaryFileResponse;

  /** Return the raw contents of a binary file. */
  file(file: SplFileInfo | string, headers?: PhpArrayLike): BinaryFileResponse;

  /** Create a new redirect response to the given path. */
  redirectTo(path: string, status?: number, headers?: PhpArrayLike, secure?: boolean | null): RedirectResponse;
  redirectTo(path: string, options?: { status?: number; headers?: PhpArrayLike; secure?: boolean | null }): RedirectResponse;

  /** Create a new redirect response to a named route. */
  redirectToRoute(route: BackedEnum | string, parameters?: unknown, status?: number, headers?: PhpArrayLike): RedirectResponse;
  redirectToRoute(route: BackedEnum | string, options?: { parameters?: unknown; status?: number; headers?: PhpArrayLike }): RedirectResponse;

  /** Create a new redirect response to a controller action. */
  redirectToAction(action: PhpArrayLike | string, parameters?: unknown, status?: number, headers?: PhpArrayLike): RedirectResponse;
  redirectToAction(action: PhpArrayLike | string, options?: { parameters?: unknown; status?: number; headers?: PhpArrayLike }): RedirectResponse;

  /** Create a new redirect response, while putting the current URL in the session. */
  redirectGuest(path: string, status?: number, headers?: PhpArrayLike, secure?: boolean | null): RedirectResponse;
  redirectGuest(path: string, options?: { status?: number; headers?: PhpArrayLike; secure?: boolean | null }): RedirectResponse;

  /** Create a new redirect response to the previously intended location. */
  redirectToIntended(defaultValue?: string, status?: number, headers?: PhpArrayLike, secure?: boolean | null): RedirectResponse;
  redirectToIntended(options?: { default?: string; status?: number; headers?: PhpArrayLike; secure?: boolean | null }): RedirectResponse;
}

export const ResponseFactory = contract<ResponseFactory, typeof ResponseFactoryBrand>(
  "Illuminate\\Contracts\\Routing\\ResponseFactory",
  {
    download: ["file", "name", "headers", "disposition"],
    eventStream: ["callback", "headers", "endStreamWith"],
    file: ["file", "headers"],
    json: ["data", "status", "headers", "options"],
    jsonp: ["callback", "data", "status", "headers", "options"],
    make: ["content", "status", "headers"],
    noContent: ["status", "headers"],
    redirectGuest: ["path", "status", "headers", "secure"],
    redirectTo: ["path", "status", "headers", "secure"],
    redirectToAction: ["action", "parameters", "status", "headers"],
    redirectToIntended: ["default", "status", "headers", "secure"],
    redirectToRoute: ["route", "parameters", "status", "headers"],
    stream: ["callback", "status", "headers"],
    streamDownload: ["callback", "name", "headers", "disposition"],
    streamJson: ["data", "status", "headers", "encodingOptions"],
    view: ["view", "data", "status", "headers"],
  },
);
