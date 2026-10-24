// Illuminate\Contracts\Mail\Attachable, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { Attachment } from "../structural/Attachment";

declare const AttachableBrand: unique symbol;

export interface Attachable {
  readonly [Attachable.brand]: true;

  /** Get an attachment instance for this entity. */
  toMailAttachment(): Attachment;
}

export const Attachable = contract<Attachable, typeof AttachableBrand>(
  "Illuminate\\Contracts\\Mail\\Attachable",
  {
    toMailAttachment: [],
  },
);
