// Illuminate\Contracts\Image\Driver, from laravel/framework v13.37.0.
// Every method is sync: Image is no AD-6 root, and its drivers work on the contents in memory.
import { contract } from "../Contract";
import type { Closure } from "../structural/Closure";
import type { ImagePipeline } from "../structural/ImagePipeline";

declare const DriverBrand: unique symbol;

export interface Driver {
  readonly [Driver.brand]: true;

  /** Process the given image contents with the specified pipeline. */
  process(contents: string, pipeline: ImagePipeline): string;

  /** Get the dimensions of the given image contents: `[width, height]`. */
  dimensions(contents: string): readonly [number, number];

  /** Get the dominant (average) color of the image as a hex string. */
  dominantColor(contents: string): string;

  /** Register a transformation handler for the `Transformation` class named. */
  transformUsing(transformation: string, callback: Closure): this;
}

export const Driver = contract<Driver, typeof DriverBrand>(
  "Illuminate\\Contracts\\Image\\Driver",
  {
    dimensions: ["contents"],
    dominantColor: ["contents"],
    process: ["contents", "pipeline"],
    transformUsing: ["transformation", "callback"],
  },
);
