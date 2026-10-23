// Illuminate\Contracts\Events\ShouldBeDiscovered, from laravel/framework v13.37.0.
// Upstream's only member is the static `shouldBeDiscovered(): bool`. A TypeScript interface and a contract token
// cannot declare a static member, so it is left out here pending conformance/escalations/ESC-10.2-1.md.
import { contract } from "../Contract";

declare const ShouldBeDiscoveredBrand: unique symbol;

export interface ShouldBeDiscovered {
  readonly [ShouldBeDiscovered.brand]: true;
}

export const ShouldBeDiscovered = contract<ShouldBeDiscovered, typeof ShouldBeDiscoveredBrand>("Illuminate\\Contracts\\Events\\ShouldBeDiscovered");
