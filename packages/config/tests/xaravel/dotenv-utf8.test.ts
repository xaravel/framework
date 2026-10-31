// Xaravel Test for Epic 15 retrospective item 2 (finding S2 parts b and c; MAINT-2026-10-30-epic-15-items-2-5 item
// 2.1): the runtime holds a PHP string as a JS string, so it cannot hold bytes that are not valid UTF-8 (DIV-9.18).
// Where phpdotenv v5.7.0 in PHP would keep such bytes, the port throws a JS `TypeError` naming the limit, never a
// silently different value:
// - (b) a `.env` file that is not valid UTF-8 (a Latin-1 `A=caf\xe9`): PHP's `file_get_contents` returns its bytes and
//   `Str::utf8` with `$fileEncoding` converts them; the runtime's `file_get_contents` throws, through `load()` and
//   `safeLoad()` alike;
// - (c) an unquoted value whose Lexer `{1,1000}` token ends inside a multibyte character: PHP rejoins the tokens; the
//   runtime's `preg_match` throws.
// A control beside each shows that the same input without the limit's trigger loads as in PHP. No environment is
// written: every load goes through an array-backed repository.
import { join } from "node:path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { Assert, xaravelTest } from "@xaravel/assert";
import { Dotenv, Lexer } from "@xaravel/config";

const FILE_LIMIT = "file_get_contents(): the result splits a UTF-8 sequence, which JS cannot hold";
const PCRE_LIMIT = "preg_match(): the result splits a UTF-8 sequence, which JS cannot hold";

/** The error `fn` throws, or `null` when it returns. */
function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return null;
}

xaravelTest(
  "XT-config-8",
  "a .env file that is not valid UTF-8, or an unquoted value whose 1,000-byte Lexer token ends inside a multibyte character, throws a TypeError naming the runtime's UTF-8 limit where PHP's phpdotenv v5.7.0 keeps the bytes (FR-20.1, DIV-9.18): a Latin-1 file through load(), load() with fileEncoding ISO-8859-1 and safeLoad() throws file_get_contents()'s TypeError, Dotenv::parse and a file load of 999 a's then é throw preg_match()'s TypeError (the Lexer tokenises the value after NAME=, so its 1,000-byte token ends inside é, as Lexer::lex shows directly), while a UTF-8 file and a token ending on a character boundary load as in PHP",
  () => {
    const dir = mkdtempSync(join(tmpdir(), "xt-config-8-"));
    try {
      // (b) A Latin-1 `.env` file, bytes `A=caf\xe9\n`: PHP reads its 7 bytes; the runtime cannot hold them.
      const latin1 = join(dir, "latin1");
      mkdirSync(latin1);
      writeFileSync(join(latin1, ".env"), Buffer.from([0x41, 0x3d, 0x63, 0x61, 0x66, 0xe9, 0x0a]));
      const loads: [string, () => unknown][] = [
        ["load()", () => Dotenv.createArrayBacked(latin1).load()],
        ["load() with fileEncoding ISO-8859-1", () => Dotenv.createArrayBacked(latin1, null, true, "ISO-8859-1").load()],
        ["safeLoad()", () => Dotenv.createArrayBacked(latin1).safeLoad()],
      ];
      for (const [how, load] of loads) {
        const thrown = thrownBy(load);
        Assert.assertInstanceOf(TypeError, thrown, `a Latin-1 .env through ${how} throws TypeError`); // adapted:DIV-9.18
        Assert.assertSame(FILE_LIMIT, (thrown as Error).message, `naming file_get_contents()'s UTF-8 limit (${how})`); // adapted:DIV-9.18
      }

      // (b) control: the same value as a UTF-8 file loads as in PHP.
      const utf8 = join(dir, "utf8");
      mkdirSync(utf8);
      writeFileSync(join(utf8, ".env"), "A=café\n");
      Assert.assertSame({ A: "café" }, Dotenv.createArrayBacked(utf8).load(), "a UTF-8 .env loads its value");

      // (c) The Lexer runs on the value alone: `EntryParser::splitStringIntoParts` cuts off `A=` and `parseValue` calls
      // `Lexer::lex($value)` (packages/config/src/Dotenv/Parser/EntryParser.ts, `parseValue` -> `Lexer.lex(value)`, as
      // phpdotenv's EntryParser.php does). So the value's bytes 1,000 and 1,001 are `é`'s two bytes, and the Lexer's
      // `{1,1000}` token ends inside `é` with 999 a's and on the character boundary after `é` with 998.
      Assert.assertSame(["a".repeat(998) + "é", "b"], [...Lexer.lex("a".repeat(998) + "éb")], "with 998 a's the Lexer's first token is exactly 1,000 bytes, ending after é");
      const lexed = thrownBy(() => [...Lexer.lex("a".repeat(999) + "éb")]);
      Assert.assertInstanceOf(TypeError, lexed, "with 999 a's the Lexer's 1,000-byte token ends inside é and throws TypeError"); // adapted:DIV-9.18
      Assert.assertSame(PCRE_LIMIT, (lexed as Error).message, "naming preg_match()'s UTF-8 limit from the Lexer"); // adapted:DIV-9.18
      const capped = "A=" + "a".repeat(999) + "éb";
      let thrown = thrownBy(() => Dotenv.parse(capped));
      Assert.assertInstanceOf(TypeError, thrown, "Dotenv::parse with the token cap inside é throws TypeError"); // adapted:DIV-9.18
      Assert.assertSame(PCRE_LIMIT, (thrown as Error).message, "naming preg_match()'s UTF-8 limit"); // adapted:DIV-9.18

      const cap = join(dir, "cap");
      mkdirSync(cap);
      writeFileSync(join(cap, ".env"), capped);
      thrown = thrownBy(() => Dotenv.createArrayBacked(cap).load());
      Assert.assertInstanceOf(TypeError, thrown, "a UTF-8 .env file with the token cap inside é throws TypeError"); // adapted:DIV-9.18
      Assert.assertSame(PCRE_LIMIT, (thrown as Error).message, "naming preg_match()'s UTF-8 limit from a file load"); // adapted:DIV-9.18

      // (c) control: with 998 a's the first token ends on a character boundary, and the tokens rejoin as in PHP.
      const value = "a".repeat(998) + "éb";
      Assert.assertSame({ A: value }, Dotenv.parse("A=" + value), "a token ending on a character boundary parses to the whole value");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
