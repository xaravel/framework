// Psr\Log\LoggerInterface, from psr/log 3.0.2 (ESC-10.1-4). `Stringable|string` maps to `string | { toString(): string }`
// (AD-26), and `array` to its three forms (AD-9).
import type { PhpArray } from "@xaravel/runtime/php";
import { contract } from "../../Contract";

declare const LoggerInterfaceBrand: unique symbol;

type Message = string | { toString(): string };
type Context = readonly unknown[] | Readonly<Record<string, unknown>> | PhpArray;

/** Describes a logger instance. */
export interface LoggerInterface {
  readonly [LoggerInterface.brand]: true;

  /** System is unusable. */
  emergency(message: Message, context?: Context): void;

  /** Action must be taken immediately. */
  alert(message: Message, context?: Context): void;

  /** Critical conditions. */
  critical(message: Message, context?: Context): void;

  /** Runtime errors that do not require immediate action but should typically be logged and monitored. */
  error(message: Message, context?: Context): void;

  /** Exceptional occurrences that are not errors. */
  warning(message: Message, context?: Context): void;

  /** Normal but significant events. */
  notice(message: Message, context?: Context): void;

  /** Interesting events. */
  info(message: Message, context?: Context): void;

  /** Detailed debug information. */
  debug(message: Message, context?: Context): void;

  /** Logs with an arbitrary level. */
  log(level: unknown, message: Message, context?: Context): void;
}

export const LoggerInterface = contract<LoggerInterface, typeof LoggerInterfaceBrand>("Psr\\Log\\LoggerInterface", {
  alert: ["message", "context"],
  critical: ["message", "context"],
  debug: ["message", "context"],
  emergency: ["message", "context"],
  error: ["message", "context"],
  info: ["message", "context"],
  log: ["level", "message", "context"],
  notice: ["message", "context"],
  warning: ["message", "context"],
});
