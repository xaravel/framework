// Illuminate\Foundation\Bus\PendingDispatch, as a contract names it (AD-1.2): a subset of its public methods. It
// leaves out `then()` (PendingDispatch is a thenable, AD-6: awaiting it dispatches the job), which the later
// `@xaravel/foundation` port declares, as `PendingBatch.ts` leaves out its own.
import type { DateInterval } from "../psr/SimpleCache/DateInterval";
import type { BackedEnum } from "./BackedEnum";
import type { DateTimeInterface } from "./DateTimeInterface";
import type { PhpArrayLike } from "./PhpArrayLike";

/** A job dispatch not yet sent. */
export interface PendingDispatch {
  /** Set the desired connection for the job. */
  onConnection(connection: BackedEnum | string | null): this;

  /** Set the desired queue for the job. */
  onQueue(queue: BackedEnum | string | null): this;

  /** Set the desired connection for the chain. */
  allOnConnection(connection: BackedEnum | string | null): this;

  /** Set the desired queue for the chain. */
  allOnQueue(queue: BackedEnum | string | null): this;

  /** Set the desired delay in seconds for the job. */
  delay(delay: DateTimeInterface | DateInterval | number | null): this;

  /** Set the delay for the job to zero seconds. */
  withoutDelay(): this;

  /** Indicate that the job should be dispatched after all database transactions have committed. */
  afterCommit(): this;

  /** Indicate that the job should not wait until database transactions have been committed before dispatching. */
  beforeCommit(): this;

  /** Set the jobs that should run if this job is successful. */
  chain(chain: PhpArrayLike): this;

  /** Indicate that the job should be dispatched after the response is sent to the browser. */
  afterResponse(afterResponse?: boolean): this;

  /** Get the underlying job instance. */
  getJob(): unknown;
}
