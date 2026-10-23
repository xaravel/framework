// Illuminate\Bus\PendingBatch, as a contract names it (AD-1.2): a subset of its public methods. It leaves out
// `then()` (PendingBatch is a thenable, AD-6) and the dispatch methods, which the later `@xaravel/bus` port declares.
import type { UnitEnum } from "./UnitEnum";

/** A batch of jobs not yet dispatched. */
export interface PendingBatch {
  /** Add jobs to the batch. */
  add(jobs: unknown): this;

  /** Indicate that the batch should not be cancelled when a job within the batch fails. */
  allowFailures(param?: unknown): this;

  /** Determine if the pending batch allows jobs to fail without cancelling the batch. */
  allowsFailures(): boolean;

  /** Specify the queue connection that the batched jobs should run on. */
  onConnection(connection: UnitEnum | string): this;

  /** Get the connection used by the pending batch. */
  connection(): string | null;

  /** Specify the queue that the batched jobs should run on. */
  onQueue(queue: UnitEnum | string | null): this;

  /** Get the queue used by the pending batch. */
  queue(): string | null;
}
