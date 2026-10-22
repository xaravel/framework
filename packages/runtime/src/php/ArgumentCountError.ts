// PHP's `ArgumentCountError` (Story 9.10, AD-19): too few arguments passed to a function.
import { registerClass } from "../registry/registry";
import { TypeError } from "./TypeError";

export class ArgumentCountError extends TypeError {}

registerClass("ArgumentCountError", ArgumentCountError);
