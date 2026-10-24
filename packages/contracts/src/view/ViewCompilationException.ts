// Illuminate\Contracts\View\ViewCompilationException, from laravel/framework v13.37.0.
import { Exception } from "@xaravel/runtime/php";
import { registerClass } from "@xaravel/runtime/registry";

/** A view failed to compile. */
export class ViewCompilationException extends Exception {}

registerClass("Illuminate\\Contracts\\View\\ViewCompilationException", ViewCompilationException);
