// PHP's `ValueError` (Story 9.10, AD-19): an argument of the right type with a wrong value.
import { registerClass } from "../registry/registry";
import { Error } from "./Error";

export class ValueError extends Error {}

registerClass("ValueError", ValueError);
