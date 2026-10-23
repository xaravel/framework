// Illuminate\Contracts\Queue\Queue, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { DateInterval } from "../psr/SimpleCache/DateInterval";
import type { DateTimeInterface } from "../structural/DateTimeInterface";
import type { Job } from "./Job";
import type { PhpArrayLike } from "../structural/PhpArrayLike";

declare const QueueBrand: unique symbol;

export interface Queue {
  readonly [Queue.brand]: true;

  /**
   * Get the size of the queue.
   * @asyncRoot Queue\Queue.size
   */
  size(queue?: string | null): Promise<number>;

  /**
   * Get the number of pending jobs.
   * @asyncRoot Queue\Queue.pendingSize
   */
  pendingSize(queue?: string | null): Promise<number>;

  /**
   * Get the number of delayed jobs.
   * @asyncRoot Queue\Queue.delayedSize
   */
  delayedSize(queue?: string | null): Promise<number>;

  /**
   * Get the number of reserved jobs.
   * @asyncRoot Queue\Queue.reservedSize
   */
  reservedSize(queue?: string | null): Promise<number>;

  /**
   * Get the creation timestamp of the oldest pending job, excluding delayed jobs.
   * @asyncRoot Queue\Queue.creationTimeOfOldestPendingJob
   */
  creationTimeOfOldestPendingJob(queue?: string | null): Promise<number | null>;

  /**
   * Push a new job onto the queue.
   * @asyncRoot Queue\Queue.push
   */
  push(job: string | object, data?: unknown, queue?: string | null): Promise<unknown>;
  push(job: string | object, options?: { data?: unknown; queue?: string | null }): Promise<unknown>;

  /**
   * Push a new job onto the queue.
   * @asyncRoot Queue\Queue.pushOn
   */
  pushOn(queue: string, job: string | object, data?: unknown): Promise<unknown>;

  /**
   * Push a raw payload onto the queue.
   * @asyncRoot Queue\Queue.pushRaw
   */
  pushRaw(payload: string, queue?: string | null, options?: PhpArrayLike): Promise<unknown>;
  pushRaw(payload: string, options?: { queue?: string | null; options?: PhpArrayLike }): Promise<unknown>;

  /**
   * Push a new job onto the queue after (n) seconds.
   * @asyncRoot Queue\Queue.later
   */
  later(delay: DateTimeInterface | DateInterval | number, job: string | object, data?: unknown, queue?: string | null): Promise<unknown>;
  later(delay: DateTimeInterface | DateInterval | number, job: string | object, options?: { data?: unknown; queue?: string | null }): Promise<unknown>;

  /**
   * Push a new job onto a specific queue after (n) seconds.
   * @asyncRoot Queue\Queue.laterOn
   */
  laterOn(queue: string, delay: DateTimeInterface | DateInterval | number, job: string | object, data?: unknown): Promise<unknown>;

  /**
   * Push an array of jobs onto the queue.
   * @asyncRoot Queue\Queue.bulk
   */
  bulk(jobs: PhpArrayLike, data?: unknown, queue?: string | null): Promise<unknown>;
  bulk(jobs: PhpArrayLike, options?: { data?: unknown; queue?: string | null }): Promise<unknown>;

  /**
   * Pop the next job off of the queue.
   * @asyncRoot Queue\Queue.pop
   */
  pop(queue?: string | null): Promise<Job | null>;

  /** Get the connection name for the queue. */
  getConnectionName(): string;

  /** Set the connection name for the queue. */
  setConnectionName(name: string): this;
}

export const Queue = contract<Queue, typeof QueueBrand>(
  "Illuminate\\Contracts\\Queue\\Queue",
  {
    bulk: ["jobs", "data", "queue"],
    creationTimeOfOldestPendingJob: ["queue"],
    delayedSize: ["queue"],
    getConnectionName: [],
    later: ["delay", "job", "data", "queue"],
    laterOn: ["queue", "delay", "job", "data"],
    pendingSize: ["queue"],
    pop: ["queue"],
    push: ["job", "data", "queue"],
    pushOn: ["queue", "job", "data"],
    pushRaw: ["payload", "queue", "options"],
    reservedSize: ["queue"],
    setConnectionName: ["name"],
    size: ["queue"],
  },
);
