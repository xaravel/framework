// PHP's `JsonException` (Story 9.10, AD-19): what `jsonEncode` / `jsonDecode` throw under `JSON_THROW_ON_ERROR`, with the `JSON_ERROR_*` code.
import { registerClass } from "../registry/registry";
import { Exception } from "./Exception";

export class JsonException extends Exception {}

registerClass("JsonException", JsonException);
