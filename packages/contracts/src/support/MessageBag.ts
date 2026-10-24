// Illuminate\Contracts\Support\MessageBag, from laravel/framework v13.37.0.
// PHP's built-in `Countable` parent is no contract token: the interface extends the structural
// form from `src/structural/`, and the token records no parent for it; it lists `count` as a built-in
// (decisions/ESC-10.2-4.md), so a test double can configure it.
import { contract } from "../Contract";
import { Arrayable } from "./Arrayable";
import type { Countable } from "../structural/Countable";
import type { MessageProvider } from "./MessageProvider";
import type { PhpArrayLike } from "../structural/PhpArrayLike";

declare const MessageBagBrand: unique symbol;

export interface MessageBag extends Arrayable, Countable {
  readonly [MessageBag.brand]: true;

  /** Get the keys present in the message bag. */
  keys(): PhpArrayLike;

  /** Add a message to the bag. */
  add(key: string, message: string): this;

  /** Merge a new array of messages into the bag. */
  merge(messages: MessageProvider | PhpArrayLike): this;

  /** Determine if messages exist for a given key. */
  has(key: string | PhpArrayLike): boolean;

  /** Get the first message from the bag for a given key. */
  first(key?: string | null, format?: string | null): string;
  first(options?: { key?: string | null; format?: string | null }): string;

  /** Get all of the messages from the bag for a given key. */
  get(key: string, format?: string | null): PhpArrayLike;

  /** Get all of the messages for every key in the bag. */
  all(format?: string | null): PhpArrayLike;

  /** Remove a message from the bag. */
  forget(key: string): this;

  /** Get the raw messages in the container. */
  getMessages(): PhpArrayLike;

  /** Get the default message format. */
  getFormat(): string;

  /** Set the default message format. */
  setFormat(format?: string): this;

  /** Determine if the message bag has any messages. */
  isEmpty(): boolean;

  /** Determine if the message bag has any messages. */
  isNotEmpty(): boolean;
}

export const MessageBag = contract<MessageBag, typeof MessageBagBrand>(
  "Illuminate\\Contracts\\Support\\MessageBag",
  {
    add: ["key", "message"],
    all: ["format"],
    first: ["key", "format"],
    forget: ["key"],
    get: ["key", "format"],
    getFormat: [],
    getMessages: [],
    has: ["key"],
    isEmpty: [],
    isNotEmpty: [],
    keys: [],
    merge: ["messages"],
    setFormat: ["format"],
  },
  [Arrayable],
  {},
  ["count"],
);
