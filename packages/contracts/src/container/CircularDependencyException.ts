// Illuminate\Contracts\Container\CircularDependencyException, from laravel/framework v13.37.0.
import { Exception } from "@xaravel/runtime/php";
import { registerClass } from "@xaravel/runtime/registry";
import { ContainerExceptionInterface } from "../psr/Container/ContainerExceptionInterface";

/** The container met a circular dependency while resolving. It implements `Psr\Container\ContainerExceptionInterface`. */
export class CircularDependencyException extends Exception implements ContainerExceptionInterface {
  get [ContainerExceptionInterface.brand](): true {
    return true as const;
  }
}

registerClass("Illuminate\\Contracts\\Container\\CircularDependencyException", CircularDependencyException);
