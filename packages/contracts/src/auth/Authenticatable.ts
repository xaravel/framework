// Illuminate\Contracts\Auth\Authenticatable, from laravel/framework v13.37.0.
import { contract } from "../Contract";

declare const AuthenticatableBrand: unique symbol;

export interface Authenticatable {
  readonly [Authenticatable.brand]: true;

  /** Get the name of the unique identifier for the user. */
  getAuthIdentifierName(): string;

  /** Get the unique identifier for the user. */
  getAuthIdentifier(): unknown;

  /** Get the name of the password attribute for the user. */
  getAuthPasswordName(): string;

  /** Get the password for the user. */
  getAuthPassword(): string;

  /** Get the token value for the "remember me" session. */
  getRememberToken(): string | null;

  /** Set the token value for the "remember me" session. */
  setRememberToken(value: string): void;

  /** Get the column name for the "remember me" token. */
  getRememberTokenName(): string;
}

export const Authenticatable = contract<Authenticatable, typeof AuthenticatableBrand>(
  "Illuminate\\Contracts\\Auth\\Authenticatable",
  {
    getAuthIdentifier: [],
    getAuthIdentifierName: [],
    getAuthPassword: [],
    getAuthPasswordName: [],
    getRememberToken: [],
    getRememberTokenName: [],
    setRememberToken: ["value"],
  },
);
