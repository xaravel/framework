// Illuminate\Contracts\Events\ShouldDispatchAfterCommit, from laravel/framework v13.37.0.
import { contract } from "../Contract";

declare const ShouldDispatchAfterCommitBrand: unique symbol;

export interface ShouldDispatchAfterCommit {
  readonly [ShouldDispatchAfterCommit.brand]: true;
}

export const ShouldDispatchAfterCommit = contract<ShouldDispatchAfterCommit, typeof ShouldDispatchAfterCommitBrand>("Illuminate\\Contracts\\Events\\ShouldDispatchAfterCommit");
