// Illuminate\Contracts\Image\Transformation, from laravel/framework v13.37.0.
import { contract } from "../Contract";

declare const TransformationBrand: unique symbol;

export interface Transformation {
  readonly [Transformation.brand]: true;
}

export const Transformation = contract<Transformation, typeof TransformationBrand>("Illuminate\\Contracts\\Image\\Transformation");
