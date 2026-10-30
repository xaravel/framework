// `Dotenv\Store\StringStore` (vlucas/phpdotenv v5.7.0), ported line for line. Upstream's
// `substr($this->content, 0, 3) === "\xEF\xBB\xBF"` is `str_starts_with`, which never splits a UTF-8 sequence.
import { registerClass } from "@xaravel/runtime";
import { str_starts_with, substr } from "@xaravel/runtime/php";
import { StoreInterface } from "./StoreInterface";

/** A store over given content. */
export class StringStore implements StoreInterface {
  /** The file content. */
  private readonly content: string;

  get [StoreInterface.brand](): true {
    return true;
  }

  /** Create a new string store instance. */
  constructor(content: string) {
    this.content = content;
  }

  /** Read the content of the environment file(s). */
  read(): string {
    if (str_starts_with(this.content, "\u{FEFF}")) {
      return substr(this.content, 3);
    }

    return this.content;
  }
}

registerClass("Dotenv\\Store\\StringStore", StringStore);
