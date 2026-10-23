// Psr\Container\NotFoundExceptionInterface, from psr/container 2.0.2 (ESC-10.1-4).
import { contract } from "../../Contract";
import { ContainerExceptionInterface } from "./ContainerExceptionInterface";

declare const NotFoundExceptionInterfaceBrand: unique symbol;

/** No entry was found in the container. */
export interface NotFoundExceptionInterface extends ContainerExceptionInterface {
  readonly [NotFoundExceptionInterface.brand]: true;
}

export const NotFoundExceptionInterface = contract<NotFoundExceptionInterface, typeof NotFoundExceptionInterfaceBrand>("Psr\\Container\\NotFoundExceptionInterface");
