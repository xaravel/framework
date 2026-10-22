// PHP's `TypeError` (Story 9.10, AD-19): a value of the wrong type. A module that needs the JS `TypeError` too
// imports this one under an alias (`TypeError as PhpTypeError`).
import { registerClass } from "../registry/registry";
import { Error } from "./Error";

export class TypeError extends Error {}

registerClass("TypeError", TypeError);
