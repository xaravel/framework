// Illuminate\Image\ImagePipeline, as a contract names it (AD-1.2): a subset of its public methods.
import type { Transformation } from "../image/Transformation";

/** An ordered set of image transformations. */
export interface ImagePipeline {
  /** Add a transformation to the pipeline. */
  add(transformation: Transformation): void;

  /** Determine if the pipeline has any changes to apply. */
  hasChanges(): boolean;
}
