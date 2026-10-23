// Illuminate\Contracts\Pipeline\Pipeline, from laravel/framework v13.37.0.
// Upstream's `then(Closure $destination)` keeps its name, so a pipeline is structurally a thenable: await
// `pipeline.then(destination)`, never the pipeline itself.
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
