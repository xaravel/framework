// Illuminate\Contracts\Filesystem\Cloud, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import { Filesystem } from "./Filesystem";

declare const CloudBrand: unique symbol;

export interface Cloud extends Filesystem {
  readonly [Cloud.brand]: true;

  /** Get the URL for the file at the given path. */
  url(path: string): string;
}

export const Cloud = contract<Cloud, typeof CloudBrand>(
  "Illuminate\\Contracts\\Filesystem\\Cloud",
  {
    url: ["path"],
  },
  [Filesystem],
);
