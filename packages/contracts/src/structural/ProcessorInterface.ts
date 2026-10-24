// Monolog\Processor\ProcessorInterface, as a contract extends it (AD-1.2): its one method. It is no contract, so a
// contract that extends it extends this structural form and its token records no parent, as for a built-in parent.
import type { LogRecord } from "./LogRecord";

/** A Monolog record processor. */
export interface ProcessorInterface {
  /** Process the record, returning the processed record. */
  __invoke(record: LogRecord): LogRecord;
}
