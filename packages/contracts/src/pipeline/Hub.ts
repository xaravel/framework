// Illuminate\Contracts\Pipeline\Hub, from laravel/framework v13.37.0.
import { contract } from "../Contract";

declare const HubBrand: unique symbol;

export interface Hub {
  readonly [Hub.brand]: true;

  /**
   * Send an object through one of the available pipelines.
   * Runs a pipeline's pipes (middleware), which DIV-1 lets be async.
   * @asyncRoot callback
   */
  pipe(object: unknown, pipeline?: string | null): Promise<unknown>;
}

export const Hub = contract<Hub, typeof HubBrand>(
  "Illuminate\\Contracts\\Pipeline\\Hub",
  {
    pipe: ["object", "pipeline"],
  },
);
