// Illuminate\Contracts\Support\MessageProvider, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { MessageBag } from "./MessageBag";

declare const MessageProviderBrand: unique symbol;

export interface MessageProvider {
  readonly [MessageProvider.brand]: true;

  /** Get the messages for the instance. */
  getMessageBag(): MessageBag;
}

export const MessageProvider = contract<MessageProvider, typeof MessageProviderBrand>(
  "Illuminate\\Contracts\\Support\\MessageProvider",
  {
    getMessageBag: [],
  },
);
