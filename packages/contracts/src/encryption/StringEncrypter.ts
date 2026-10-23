// Illuminate\Contracts\Encryption\StringEncrypter, from laravel/framework v13.37.0.
import { contract } from "../Contract";

declare const StringEncrypterBrand: unique symbol;

export interface StringEncrypter {
  readonly [StringEncrypter.brand]: true;

  /** Encrypt a string without serialization. */
  encryptString(value: string): string;

  /** Decrypt the given string without unserialization. */
  decryptString(payload: string): string;
}

export const StringEncrypter = contract<StringEncrypter, typeof StringEncrypterBrand>(
  "Illuminate\\Contracts\\Encryption\\StringEncrypter",
  {
    decryptString: ["payload"],
    encryptString: ["value"],
  },
);
