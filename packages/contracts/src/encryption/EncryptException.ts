// Illuminate\Contracts\Encryption\EncryptException, from laravel/framework v13.37.0.
import { RuntimeException } from "@xaravel/runtime/php";
import { registerClass } from "@xaravel/runtime/registry";

/** A value could not be encrypted. */
export class EncryptException extends RuntimeException {}

registerClass("Illuminate\\Contracts\\Encryption\\EncryptException", EncryptException);
