// Illuminate\Contracts\Encryption\Encrypter, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { PhpArrayLike } from "../structural/PhpArrayLike";

declare const EncrypterBrand: unique symbol;

export interface Encrypter {
  readonly [Encrypter.brand]: true;

  /** Encrypt the given value. */
  encrypt(value: unknown, serialize?: boolean): string;

  /** Decrypt the given value. */
  decrypt(payload: string, unserialize?: boolean): unknown;

  /** Get the encryption key that the encrypter is currently using. */
  getKey(): string;

  /** Get the current encryption key and all previous encryption keys. */
  getAllKeys(): PhpArrayLike;

  /** Get the previous encryption keys. */
  getPreviousKeys(): PhpArrayLike;
}

export const Encrypter = contract<Encrypter, typeof EncrypterBrand>(
  "Illuminate\\Contracts\\Encryption\\Encrypter",
  {
    decrypt: ["payload", "unserialize"],
    encrypt: ["value", "serialize"],
    getAllKeys: [],
    getKey: [],
    getPreviousKeys: [],
  },
);
