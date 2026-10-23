// Illuminate\Contracts\Debug\ExceptionHandler, from laravel/framework v13.37.0.
// Upstream's docblock `@method` lines (`isReporting`, `buildContextForException`, `shouldStopRetries`) are not
// interface members and have no API-surface rows.
import { contract } from "../Contract";
import type { OutputInterface } from "../structural/OutputInterface";
import type { Request } from "../structural/Request";
import type { Response } from "../structural/Response";

declare const ExceptionHandlerBrand: unique symbol;

export interface ExceptionHandler {
  readonly [ExceptionHandler.brand]: true;

  /** Report or log an exception. */
  report(e: Error): void;

  /** Determine if the exception should be reported. */
  shouldReport(e: Error): boolean;

  /** Render an exception into an HTTP response. */
  render(request: Request, e: Error): Response;

  /** Render an exception to the console. */
  renderForConsole(output: OutputInterface, e: Error): void;
}

export const ExceptionHandler = contract<ExceptionHandler, typeof ExceptionHandlerBrand>(
  "Illuminate\\Contracts\\Debug\\ExceptionHandler",
  {
    render: ["request", "e"],
    renderForConsole: ["output", "e"],
    report: ["e"],
    shouldReport: ["e"],
  },
);
