// Illuminate\Bus\Batch, as a contract names it (AD-1.2): a subset of its public properties and of its public methods
// that read no storage.

/** A batch of queued jobs. */
export interface Batch {
  /** The batch ID. */
  readonly id: string;

  /** The batch name. */
  readonly name: string;

  /** The total number of jobs that belong to the batch. */
  readonly totalJobs: number;

  /** The total number of jobs that are still pending. */
  readonly pendingJobs: number;

  /** The total number of jobs that have failed. */
  readonly failedJobs: number;

  /** Get the total number of jobs that have been processed by the batch thus far. */
  processedJobs(): number;

  /** Get the percentage of jobs that have been processed (between 0-100). */
  progress(): number;

  /** Determine if the batch has finished executing. */
  finished(): boolean;

  /** Determine if the batch has job failures. */
  hasFailures(): boolean;

  /** Determine if the batch has been cancelled. */
  cancelled(): boolean;
}
