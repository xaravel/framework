// Illuminate\Contracts\Container\BindingResolutionException, from laravel/framework v13.37.0.
import { Exception } from "@xaravel/runtime/php";
import { registerClass } from "@xaravel/runtime/registry";
import { ContainerExceptionInterface } from "../psr/Container/ContainerExceptionInterface";

/** A container binding could not be resolved. It implements `Psr\Container\ContainerExceptionInterface`. */
export class BindingResolutionException extends Exception implements ContainerExceptionInterface {
  get [ContainerExceptionInterface.brand](): true {
    return true as const;
  }
}

registerClass("Illuminate\\Contracts\\Container\\BindingResolutionException", BindingResolutionException);
