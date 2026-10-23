// Psr\Container\ContainerInterface, from psr/container 2.0.2 (ESC-10.1-4).
import { contract } from "../../Contract";

declare const ContainerInterfaceBrand: unique symbol;

/** Describes the interface of a container that exposes methods to read its entries. */
export interface ContainerInterface {
  readonly [ContainerInterface.brand]: true;

  /** Finds an entry of the container by its identifier and returns it. */
  get(id: string): unknown;

  /** Returns true if the container can return an entry for the given identifier. */
  has(id: string): boolean;
}

export const ContainerInterface = contract<ContainerInterface, typeof ContainerInterfaceBrand>("Psr\\Container\\ContainerInterface", {
  get: ["id"],
  has: ["id"],
});
