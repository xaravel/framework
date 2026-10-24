// Illuminate\Contracts\Pipeline\Pipeline, from laravel/framework v13.37.0.
// Upstream's `then(Closure $destination)` keeps its name, and a Pipeline is a declared thenable
// (decisions/ESC-10.2-2.md): the interface also declares the `PromiseLike` form of `then`, so it is
// `PromiseLike`-compatible, and an awaited pipeline runs with an identity destination (the Pipeline Story's to build).
import { contract } from "../Contract";
import type { Closure } from "../structural/Closure";

declare const PipelineBrand: unique symbol;

export interface Pipeline {
  readonly [Pipeline.brand]: true;

  /** Set the object being sent through the pipeline. */
  send(passable: unknown): this;

  /** Set the array of pipes. */
  through(pipes: unknown): this;

  /** Set the method to call on the pipes. */
  via(method: string): this;

  /**
   * Run the pipeline with a final destination callback.
   * Runs the pipes (middleware), which DIV-1 lets be async.
   * @asyncRoot callback
   */
  then(destination: Closure): Promise<unknown>;
  /** Await the pipeline: it runs with an identity destination and settles with its result (ESC-10.2-2). */
  then<R1 = unknown, R2 = never>(
    onfulfilled?: ((value: unknown) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2>;
}

export const Pipeline = contract<Pipeline, typeof PipelineBrand>(
  "Illuminate\\Contracts\\Pipeline\\Pipeline",
  {
    send: ["passable"],
    then: ["destination"],
    through: ["pipes"],
    via: ["method"],
  },
);
