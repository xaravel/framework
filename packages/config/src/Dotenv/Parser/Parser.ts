// `Dotenv\Parser\Parser` (vlucas/phpdotenv v5.7.0), ported line for line.
import { registerClass } from "@xaravel/runtime";
import { sprintf } from "@xaravel/runtime/php";
import { Error } from "../../GrahamCampbell/ResultType/Error";
import type { Result } from "../../GrahamCampbell/ResultType/Result";
import { Success } from "../../GrahamCampbell/ResultType/Success";
import { InvalidFileException } from "../Exception/InvalidFileException";
import { Regex } from "../Util/Regex";
import type { Entry } from "./Entry";
import { EntryParser } from "./EntryParser";
import { Lines } from "./Lines";
import { ParserInterface } from "./ParserInterface";

/** phpdotenv's parser: content into entries. */
export class Parser implements ParserInterface {
  get [ParserInterface.brand](): true {
    return true;
  }

  /** Parse content into an entry array. */
  parse(content: string): Entry[] {
    return Regex.split("/(\r\n|\n|\r)/", content).mapError(() => {
      return "Could not split into separate lines.";
    }).flatMap((lines: string[]) => {
      return Parser.process(Lines.process(lines));
    }).mapError((error: string): never => {
      throw new InvalidFileException(sprintf("Failed to parse dotenv file. %s", error));
    }).success().get();
  }

  /** Convert the raw entries into proper entries. */
  private static process(entries: readonly string[]): Result<Entry[], string> {
    const output: Entry[] = [];

    for (const raw of entries) {
      const entry = EntryParser.parse(raw);

      if (entry.error().isDefined()) {
        return Error.create(entry.error().get());
      }

      output.push(entry.success().get());
    }

    return Success.create(output);
  }
}

registerClass("Dotenv\\Parser\\Parser", Parser);
