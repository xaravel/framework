// Illuminate\Contracts\Redis\LimiterTimeoutException, from laravel/framework v13.37.0.
import { Exception } from "@xaravel/runtime/php";
import { registerClass } from "@xaravel/runtime/registry";

/** A Redis limiter could not be acquired in time. */
export class LimiterTimeoutException extends Exception {}

registerClass("Illuminate\\Contracts\\Redis\\LimiterTimeoutException", LimiterTimeoutException);
