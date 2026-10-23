// Illuminate\Contracts\Support\Renderable, from laravel/framework v13.37.0.
import { contract } from "../Contract";

declare const RenderableBrand: unique symbol;

export interface Renderable {
  readonly [Renderable.brand]: true;

  /** Get the evaluated contents of the object. */
  render(): string;
}

export const Renderable = contract<Renderable, typeof RenderableBrand>(
  "Illuminate\\Contracts\\Support\\Renderable",
  {
    render: [],
  },
);
