// Illuminate\Contracts\Filesystem\LockTimeoutException, from laravel/framework v13.37.0.
import { Exception } from "@xaravel/runtime/php";
import { registerClass } from "@xaravel/runtime/registry";

/** A file lock could not be acquired in time. */
export class LockTimeoutException extends Exception {}

registerClass("Illuminate\\Contracts\\Filesystem\\LockTimeoutException", LockTimeoutException);
