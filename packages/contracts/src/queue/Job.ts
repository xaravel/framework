// Illuminate\Contracts\Queue\Job, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { PhpArrayLike } from "../structural/PhpArrayLike";

declare const JobBrand: unique symbol;

export interface Job {
  readonly [Job.brand]: true;

  /** Get the UUID of the job. */
  uuid(): string | null;

  /** Get the job identifier. */
  getJobId(): string;

  /** Get the decoded body of the job. */
  payload(): PhpArrayLike;

  /**
   * Fire the job.
   * Runs the job's handler, which DIV-1 lets be async.
   * @asyncRoot callback
   */
  fire(): Promise<void>;

  /**
   * Release the job back into the queue after (n) seconds.
   * @asyncRoot Redis\Connection.command
   */
  release(delay?: number): Promise<void>;

  /** Determine if the job was released back into the queue. */
  isReleased(): boolean;

  /**
   * Delete the job from the queue.
   * @asyncRoot Redis\Connection.command
   */
  delete(): Promise<void>;

  /** Determine if the job has been deleted. */
  isDeleted(): boolean;

  /** Determine if the job has been deleted or released. */
  isDeletedOrReleased(): boolean;

  /** Get the number of times the job has been attempted. */
  attempts(): number;

  /** Determine if the job has been marked as a failure. */
  hasFailed(): boolean;

  /** Mark the job as "failed". */
  markAsFailed(): void;

  /**
   * Delete the job, call the "failed" method, and raise the failed job event.
   * @asyncRoot Redis\Connection.command
   */
  fail(e?: Error | null): Promise<void>;

  /** Get the number of times to attempt a job. */
  maxTries(): number | null;

  /** Get the maximum number of exceptions allowed, regardless of attempts. */
  maxExceptions(): number | null;

  /** Get the number of seconds the job can run. */
  timeout(): number | null;

  /** Get the timestamp indicating when the job should timeout. */
  retryUntil(): number | null;

  /** Get the name of the queued job class. */
  getName(): string;

  /**
   * Get the display name of the queued job class.
   * Resolves the name of "wrapped" jobs such as class-based handlers.
   */
  resolveName(): string;

  /**
   * Get the class of the queued job.
   * Resolves the class of "wrapped" jobs such as class-based handlers.
   */
  resolveQueuedJobClass(): string;

  /** Get the name of the connection the job belongs to. */
  getConnectionName(): string;

  /** Get the name of the queue the job belongs to. */
  getQueue(): string;

  /** Get the raw body string for the job. */
  getRawBody(): string;
}

export const Job = contract<Job, typeof JobBrand>(
  "Illuminate\\Contracts\\Queue\\Job",
  {
    attempts: [],
    delete: [],
    fail: ["e"],
    fire: [],
    getConnectionName: [],
    getJobId: [],
    getName: [],
    getQueue: [],
    getRawBody: [],
    hasFailed: [],
    isDeleted: [],
    isDeletedOrReleased: [],
    isReleased: [],
    markAsFailed: [],
    maxExceptions: [],
    maxTries: [],
    payload: [],
    release: ["delay"],
    resolveName: [],
    resolveQueuedJobClass: [],
    retryUntil: [],
    timeout: [],
    uuid: [],
  },
);
