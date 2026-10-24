// Illuminate\Contracts\Events\ShouldBeDiscovered, from laravel/framework v13.37.0.
// Upstream's only member is the static `shouldBeDiscovered(): bool`. A TypeScript interface cannot declare a static
// member, so it is `ShouldBeDiscoveredStatic`, the constructor side an implementing class satisfies
// (`class L { static shouldBeDiscovered() {…} }`, `L satisfies ShouldBeDiscoveredStatic`; decisions/ESC-10.2-1.md).
import { contract } from "../Contract";

declare const ShouldBeDiscoveredBrand: unique symbol;

export interface ShouldBeDiscovered {
  readonly [ShouldBeDiscovered.brand]: true;
}

/** The static side of `ShouldBeDiscovered`, satisfied by an implementing class's constructor. */
export interface ShouldBeDiscoveredStatic {
  /** Determine if the listener should be registered during event discovery. */
  shouldBeDiscovered(): boolean;
}

export const ShouldBeDiscovered = contract<ShouldBeDiscovered, typeof ShouldBeDiscoveredBrand>("Illuminate\\Contracts\\Events\\ShouldBeDiscovered");
