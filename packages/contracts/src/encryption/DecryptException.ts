// Illuminate\Contracts\Encryption\DecryptException, from laravel/framework v13.37.0.
import { RuntimeException } from "@xaravel/runtime/php";
import { registerClass } from "@xaravel/runtime/registry";

/** A payload could not be decrypted. */
export class DecryptException extends RuntimeException {}

registerClass("Illuminate\\Contracts\\Encryption\\DecryptException", DecryptException);
