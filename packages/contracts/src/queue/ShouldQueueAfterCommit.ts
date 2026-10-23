// Illuminate\Contracts\Queue\ShouldQueueAfterCommit, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import { ShouldQueue } from "./ShouldQueue";

declare const ShouldQueueAfterCommitBrand: unique symbol;

export interface ShouldQueueAfterCommit extends ShouldQueue {
  readonly [ShouldQueueAfterCommit.brand]: true;
}

export const ShouldQueueAfterCommit = contract<ShouldQueueAfterCommit, typeof ShouldQueueAfterCommitBrand>("Illuminate\\Contracts\\Queue\\ShouldQueueAfterCommit", {}, [ShouldQueue]);
