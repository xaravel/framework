// Illuminate\Contracts\Queue\EntityResolver, from laravel/framework v13.37.0.
import { contract } from "../Contract";

declare const EntityResolverBrand: unique symbol;

export interface EntityResolver {
  readonly [EntityResolver.brand]: true;

  /**
   * Resolve the entity for the given ID.
   * @asyncRoot Database\ConnectionInterface.select
   */
  resolve(type: string, id: unknown): Promise<unknown>;
}

export const EntityResolver = contract<EntityResolver, typeof EntityResolverBrand>(
  "Illuminate\\Contracts\\Queue\\EntityResolver",
  {
    resolve: ["type", "id"],
  },
);
