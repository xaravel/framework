// Psr\Log\LoggerAwareInterface, from psr/log 3.0.2 (ESC-10.1-4).
import { contract } from "../../Contract";
import type { LoggerInterface } from "./LoggerInterface";

declare const LoggerAwareInterfaceBrand: unique symbol;

/** Describes a logger-aware instance. */
export interface LoggerAwareInterface {
  readonly [LoggerAwareInterface.brand]: true;

  /** Sets a logger instance on the object. */
  setLogger(logger: LoggerInterface): void;
}

export const LoggerAwareInterface = contract<LoggerAwareInterface, typeof LoggerAwareInterfaceBrand>("Psr\\Log\\LoggerAwareInterface", {
  setLogger: ["logger"],
});
