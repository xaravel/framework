// Illuminate\Contracts\Filesystem\FileNotFoundException, from laravel/framework v13.37.0.
import { Exception } from "@xaravel/runtime/php";
import { registerClass } from "@xaravel/runtime/registry";

/** A file does not exist. */
export class FileNotFoundException extends Exception {}

registerClass("Illuminate\\Contracts\\Filesystem\\FileNotFoundException", FileNotFoundException);
