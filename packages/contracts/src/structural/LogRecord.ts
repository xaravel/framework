// Monolog\LogRecord, as a contract names it (AD-1.2): a subset of its documented public properties.
import type { DateTimeInterface } from "./DateTimeInterface";
import type { PhpArrayLike } from "./PhpArrayLike";

/** One log record passed through Monolog's handlers and processors. */
export interface LogRecord {
  /** When the record was made. */
  readonly datetime: DateTimeInterface;

  /** The logging channel. */
  readonly channel: string;

  /** The log message. */
  readonly message: string;

  /** The context data. */
  readonly context: PhpArrayLike;

  /** The extra data processors add. */
  extra: PhpArrayLike;
}
