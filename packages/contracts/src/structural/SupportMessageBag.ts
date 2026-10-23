// Illuminate\Support\MessageBag, as a contract names it (AD-1.2): the methods of the
// `Illuminate\Contracts\Support\MessageBag` it implements, without the brand, and a subset of its own public methods.
import type { MessageProvider } from "../support/MessageProvider";
import type { PhpArrayLike } from "./PhpArrayLike";

/** A bag of messages. */
export interface SupportMessageBag {
  /** Get the keys present in the message bag. */
  keys(): PhpArrayLike;

  /** Add a message to the message bag. */
  add(key: string, message: string): this;

  /** Merge a new array of messages into the message bag. */
  merge(messages: MessageProvider | PhpArrayLike): this;

  /** Determine if messages exist for all of the given keys. */
  has(key: string | PhpArrayLike): boolean;

  /** Get the first message from the message bag for a given key. */
  first(key?: string | null, format?: string | null): string;
  first(options?: { key?: string | null; format?: string | null }): string;

  /** Get all of the messages from the message bag for a given key. */
  get(key: string, format?: string | null): PhpArrayLike;

  /** Get all of the messages for every key in the message bag. */
  all(format?: string | null): PhpArrayLike;

  /** Remove a message from the message bag. */
  forget(key: string): this;

  /** Get the raw messages in the message bag. */
  getMessages(): PhpArrayLike;

  /** Get the default message format. */
  getFormat(): string;

  /** Set the default message format. */
  setFormat(format?: string): this;

  /** Determine if the message bag has any messages. */
  isEmpty(): boolean;

  /** Determine if the message bag has any messages. */
  isNotEmpty(): boolean;

  /** Determine if the message bag has any messages. */
  any(): boolean;

  /** Determine if messages don't exist for all of the given keys. */
  missing(key: string | PhpArrayLike | null): boolean;

  /** Get the number of messages in the message bag. */
  count(): number;

  /** Get the instance as an array. */
  toArray(): PhpArrayLike;
}
