// Illuminate\Contracts\Foundation\ExceptionRenderer, from laravel/framework v13.37.0.
import { contract } from "../Contract";

declare const ExceptionRendererBrand: unique symbol;

export interface ExceptionRenderer {
  readonly [ExceptionRenderer.brand]: true;

  /** Renders the given exception as HTML. */
  render(throwable: Error): string;
}

export const ExceptionRenderer = contract<ExceptionRenderer, typeof ExceptionRendererBrand>(
  "Illuminate\\Contracts\\Foundation\\ExceptionRenderer",
  {
    render: ["throwable"],
  },
);
