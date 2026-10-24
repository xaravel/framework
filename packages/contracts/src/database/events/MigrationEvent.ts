// Illuminate\Contracts\Database\Events\MigrationEvent, from laravel/framework v13.37.0.
import { contract } from "../../Contract";

declare const MigrationEventBrand: unique symbol;

export interface MigrationEvent {
  readonly [MigrationEvent.brand]: true;
}

export const MigrationEvent = contract<MigrationEvent, typeof MigrationEventBrand>("Illuminate\\Contracts\\Database\\Events\\MigrationEvent");
