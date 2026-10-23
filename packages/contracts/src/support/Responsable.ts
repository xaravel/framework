// Illuminate\Contracts\Support\Responsable, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { Request } from "../structural/Request";
import type { Response } from "../structural/Response";

declare const ResponsableBrand: unique symbol;

export interface Responsable {
  readonly [Responsable.brand]: true;

  /** Create an HTTP response that represents the object. */
  toResponse(request: Request): Response;
}

export const Responsable = contract<Responsable, typeof ResponsableBrand>(
  "Illuminate\\Contracts\\Support\\Responsable",
  {
    toResponse: ["request"],
  },
);
