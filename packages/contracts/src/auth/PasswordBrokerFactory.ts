// Illuminate\Contracts\Auth\PasswordBrokerFactory, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { PasswordBroker } from "./PasswordBroker";

declare const PasswordBrokerFactoryBrand: unique symbol;

export interface PasswordBrokerFactory {
  readonly [PasswordBrokerFactory.brand]: true;

  /** Get a password broker instance by name. */
  broker(name?: string | null): PasswordBroker;
}

export const PasswordBrokerFactory = contract<PasswordBrokerFactory, typeof PasswordBrokerFactoryBrand>(
  "Illuminate\\Contracts\\Auth\\PasswordBrokerFactory",
  {
    broker: ["name"],
  },
);
