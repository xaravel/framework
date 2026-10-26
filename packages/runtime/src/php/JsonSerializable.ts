// PHP's `JsonSerializable` interface as a contract token (ESC-14.1-2), built by `phpInterface`. Its brand is
// `Symbol.for('JsonSerializable')`, the key `jsonEncode` already reads, so a class with
// `get [JsonSerializable.brand]() { return true }` encodes as its `jsonSerialize()` result.
import { phpInterface } from "./phpInterface";

declare const JsonSerializableBrand: unique symbol;

/** PHP's `JsonSerializable`. */
export interface JsonSerializable {
  readonly [JsonSerializable.brand]: true;
  jsonSerialize(): unknown;
}

export const JsonSerializable = phpInterface<JsonSerializable, typeof JsonSerializableBrand>("JsonSerializable", { jsonSerialize: [] });
