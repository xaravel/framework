// Illuminate\Contracts\Cache\LockTimeoutException, from laravel/framework v13.37.0.
import { Exception } from "@xaravel/runtime/php";
import { registerClass } from "@xaravel/runtime/registry";

/** A cache lock could not be acquired in time. */
export class LockTimeoutException extends Exception {}

registerClass("Illuminate\\Contracts\\Cache\\LockTimeoutException", LockTimeoutException);
