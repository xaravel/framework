// Illuminate\Contracts\View\Engine, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { PhpArrayLike } from "../structural/PhpArrayLike";

declare const EngineBrand: unique symbol;

export interface Engine {
  readonly [Engine.brand]: true;

  /**
   * Get the evaluated contents of the view.
   * Runs the compiled template module (AD-11, the spine's Compilation: each compiled view module exports `render(ctx): Promise<string>`).
   * @asyncRoot callback
   */
  get(path: string, data?: PhpArrayLike): Promise<string>;
}

export const Engine = contract<Engine, typeof EngineBrand>(
  "Illuminate\\Contracts\\View\\Engine",
  {
    get: ["path", "data"],
  },
);
