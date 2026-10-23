// Illuminate\Contracts\Events\ShouldHandleEventsAfterCommit, from laravel/framework v13.37.0.
import { contract } from "../Contract";

declare const ShouldHandleEventsAfterCommitBrand: unique symbol;

export interface ShouldHandleEventsAfterCommit {
  readonly [ShouldHandleEventsAfterCommit.brand]: true;
}

export const ShouldHandleEventsAfterCommit = contract<ShouldHandleEventsAfterCommit, typeof ShouldHandleEventsAfterCommitBrand>("Illuminate\\Contracts\\Events\\ShouldHandleEventsAfterCommit");
