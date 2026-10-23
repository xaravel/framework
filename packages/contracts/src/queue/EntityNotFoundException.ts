// Illuminate\Contracts\Queue\EntityNotFoundException, from laravel/framework v13.37.0.
import { InvalidArgumentException, toPhpString } from "@xaravel/runtime/php";
import { registerClass } from "@xaravel/runtime/registry";

/** A queued entity could not be found. */
export class EntityNotFoundException extends InvalidArgumentException {
  /** Create a new exception instance: `$id` is cast to a string as PHP's `(string) $id` does. */
  constructor(type: string, id: unknown) {
    super(`Queueable entity [${type}] not found for ID [${toPhpString(id)}].`);
  }
}

registerClass("Illuminate\\Contracts\\Queue\\EntityNotFoundException", EntityNotFoundException);
