// Psr\Container\ContainerExceptionInterface, from psr/container 2.0.2 (ESC-10.1-4). PHP's `Throwable` parent becomes
// `Error`: Xaravel's throwables are JS `Error`s.
import { contract } from "../../Contract";

declare const ContainerExceptionInterfaceBrand: unique symbol;

/** Base interface representing a generic exception in a container. */
export interface ContainerExceptionInterface extends Error {
  readonly [ContainerExceptionInterface.brand]: true;
}

export const ContainerExceptionInterface = contract<ContainerExceptionInterface, typeof ContainerExceptionInterfaceBrand>("Psr\\Container\\ContainerExceptionInterface");
