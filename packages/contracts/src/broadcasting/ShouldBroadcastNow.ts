// Illuminate\Contracts\Broadcasting\ShouldBroadcastNow, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import { ShouldBroadcast } from "./ShouldBroadcast";

declare const ShouldBroadcastNowBrand: unique symbol;

export interface ShouldBroadcastNow extends ShouldBroadcast {
  readonly [ShouldBroadcastNow.brand]: true;
}

export const ShouldBroadcastNow = contract<ShouldBroadcastNow, typeof ShouldBroadcastNowBrand>("Illuminate\\Contracts\\Broadcasting\\ShouldBroadcastNow", {}, [ShouldBroadcast]);
