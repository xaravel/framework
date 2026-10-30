// PHP's PCRE functions vlucas/phpdotenv v5.7.0 calls (action item epic-15-item-2-runtime-pcre-functions, ESC-15.2-1
// part f, ESC-15.2-5): `preg_match`, `preg_match_all`, `preg_split`, `preg_replace_callback`, `preg_last_error` and
// `preg_last_error_msg`, ports of PHP 8.5.11's `ext/pcre/php_pcre.c` in coercive typing mode. Each takes the PHP
// pattern string and converts it by PORTING.md § PCRE conversion (DIV-10.1) through `pcre.ts`; offsets in and out are
// byte offsets, as PHP's are. A pattern PHP cannot compile gives PHP's failure value and error code with no warning
// (DIV-9.17); a form the rule does not cover throws a JS `TypeError` naming it and records nothing.
//
// The last error code lives in a Scope Frame slot (AD-5), as `jsonLastError.ts` keeps `json_last_error`'s: a call
// records only inside a frame, and outside one `preg_last_error()` reads 0.
import { currentFrame, frameSlot } from "../scope/scope";
import { ScopeFrameException } from "../scope/ScopeFrameException";
import { arrayEntries, toPhpString } from "./casts";
import { callableParameter } from "./callables";
import { arrayFromEntries, type PhpArrayKey } from "./PhpArray";
import { argumentTypeError, intParameter, stringParameter } from "./phpArguments";
import { compilePattern, pcreExec, pcreSubject, searchRegExp, type PcreMatch, type PcrePattern, type PcreSubject } from "./pcre";
import { INT_MIN } from "./phpInt";
import { Ref } from "./Ref";
import { toStringArgument } from "./throwableArguments";
import { is_array } from "./typeTests";
import { ValueError } from "./ValueError";
import { utf8 } from "./mangle";
import { decodeResult, wellFormed } from "./stringFunctions";

/** `PREG_PATTERN_ORDER`: `preg_match_all`'s `$matches` grouped by subpattern (the default). */
export const PREG_PATTERN_ORDER = 1;
/** `PREG_SET_ORDER`: `preg_match_all`'s `$matches` grouped by match. */
export const PREG_SET_ORDER = 2;
/** `PREG_OFFSET_CAPTURE`: each captured string comes with its byte offset, as `[string, offset]`. */
export const PREG_OFFSET_CAPTURE = 256;
/** `PREG_UNMATCHED_AS_NULL`: an unmatched group is null, and every group is present. */
export const PREG_UNMATCHED_AS_NULL = 512;
/** `PREG_SPLIT_NO_EMPTY`: `preg_split` leaves out empty pieces. */
export const PREG_SPLIT_NO_EMPTY = 1;
/** `PREG_SPLIT_DELIM_CAPTURE`: `preg_split` returns the delimiter's captured groups too. */
export const PREG_SPLIT_DELIM_CAPTURE = 2;
/** `PREG_SPLIT_OFFSET_CAPTURE`: each piece comes with its byte offset. */
export const PREG_SPLIT_OFFSET_CAPTURE = 4;
/** `PREG_NO_ERROR`. */
export const PREG_NO_ERROR = 0;
/** `PREG_INTERNAL_ERROR`: a pattern PHP cannot compile, or an offset past the subject. */
export const PREG_INTERNAL_ERROR = 1;
/** `PREG_BACKTRACK_LIMIT_ERROR`. */
export const PREG_BACKTRACK_LIMIT_ERROR = 2;
/** `PREG_RECURSION_LIMIT_ERROR`. */
export const PREG_RECURSION_LIMIT_ERROR = 3;
/** `PREG_BAD_UTF8_ERROR`. */
export const PREG_BAD_UTF8_ERROR = 4;
/** `PREG_BAD_UTF8_OFFSET_ERROR`: a `u` pattern's offset inside a UTF-8 sequence. */
export const PREG_BAD_UTF8_OFFSET_ERROR = 5;
/** `PREG_JIT_STACKLIMIT_ERROR`. */
export const PREG_JIT_STACKLIMIT_ERROR = 6;

/** `php_pcre_get_error_msg`. */
const MESSAGES: Readonly<Record<number, string>> = {
  0: "No error",
  1: "Internal error",
  2: "Backtrack limit exhausted",
  3: "Recursion limit exhausted",
  4: "Malformed UTF-8 characters, possibly incorrectly encoded",
  5: "The offset did not correspond to the beginning of a valid UTF-8 code point",
  6: "JIT stack limit exhausted",
};

const LAST_ERROR = frameSlot<number>(Symbol.for("xaravel.php.preg-last-error"), () => PREG_NO_ERROR);

/** `PCRE_G(error_code) = code`, in the active frame; outside a frame (or in a narrow one) nothing is recorded. */
function record(code: number): void {
  if (currentFrame() === null) {
    return;
  }
  try {
    LAST_ERROR.set(code);
  } catch (error) {
    if (!(error instanceof ScopeFrameException)) {
      throw error;
    }
  }
}

/** PHP's `preg_last_error()`: the code of the last PCRE call recorded in the active frame, else 0. */
export function preg_last_error(): number {
  return LAST_ERROR.get();
}

/** PHP's `preg_last_error_msg()`: the message of `preg_last_error()`'s code (`No error` for 0). */
export function preg_last_error_msg(): string {
  return MESSAGES[LAST_ERROR.get()] ?? "Unknown error";
}

/** A by-reference argument: a `Ref`, or null / undefined for none; anything else is refused (DIV-9.2). */
function reference(fn: string, position: number, name: string, value: unknown): Ref<unknown> | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (!(value instanceof Ref)) {
    throw new TypeError(`${fn}(): Argument #${position} ($${name}) is by reference; pass a Ref (DIV-9.2)`);
  }
  return value;
}

/** An `int` parameter as a bigint. */
function longParameter(fn: string, position: number, name: string, value: unknown, fallback: bigint): bigint {
  return value === undefined ? fallback : BigInt(intParameter(fn, position, name, value));
}

/**
 * A captured value JS cannot hold: its bytes split a UTF-8 sequence (a pattern without `u` that captures one byte of a
 * multi-byte character, as phpdotenv's Lexer does in a group it never reads). It stands in its array slot until the
 * slot is read, and reading it throws the limit.
 */
interface Unholdable {
  readonly unholdable: TypeError;
}

function isUnholdable(value: unknown): value is Unholdable {
  return typeof value === "object" && value !== null && Object.getPrototypeOf(value) === null && Object.hasOwn(value, "unholdable");
}

/** The subject between two JS indices as a PHP string (`""` when unset), or an `Unholdable`. */
function text(s: PcreSubject, start: number, end: number): string | Unholdable {
  if (start === -1) {
    return "";
  }
  try {
    return s.slice(start, end);
  } catch (error) {
    if (error instanceof TypeError) {
      const unholdable: Unholdable = Object.create(null) as Unholdable;
      Object.defineProperty(unholdable, "unholdable", { value: error, enumerable: true });
      return unholdable;
    }
    throw error;
  }
}

/** `add_offset_pair`: `[string, byte offset]`, `[null|"", -1]` when unset. */
function offsetPair(s: PcreSubject, start: number, end: number, unmatchedAsNull: boolean): unknown[] {
  return start === -1 ? [unmatchedAsNull ? null : "", -1] : [text(s, start, end), s.byteOffset(start)];
}

/** `list` with each `Unholdable` slot (an offset pair's too) made a slot whose read throws the limit. */
function holdable(list: unknown[]): unknown[] {
  list.forEach((value, index) => {
    if (Array.isArray(value)) {
      holdable(value);
    } else if (isUnholdable(value)) {
      Object.defineProperty(list, index, {
        get: (): never => {
          throw value.unholdable;
        },
        set: (replacement: unknown): void => {
          Object.defineProperty(list, index, { value: replacement, writable: true, enumerable: true, configurable: true });
        },
        enumerable: true,
        configurable: true,
      });
    }
  });
  return list;
}

/** `arrayFromEntries` of match entries: a list keeps an `Unholdable` slot for its read; a keyed array throws at once. */
function matchArray(entries: [PhpArrayKey, unknown][]): unknown {
  const array = arrayFromEntries(entries);
  if (Array.isArray(array)) {
    return holdable(array);
  }
  for (const [, value] of entries) {
    if (isUnholdable(value) || (Array.isArray(value) && isUnholdable(value[0]))) {
      throw (isUnholdable(value) ? value : value[0] as Unholdable).unholdable;
    }
  }
  return array;
}

/** `populate_subpat_array`: one match's `$matches` entries. */
function subpatterns(p: PcrePattern, s: PcreSubject, m: PcreMatch, flags: bigint): [PhpArrayKey, unknown][] {
  const offsetCapture = (flags & 256n) !== 0n;
  const unmatchedAsNull = (flags & 512n) !== 0n;
  const entries: [PhpArrayKey, unknown][] = [];
  const value = (i: number): unknown => {
    if (i >= m.count) {
      return offsetCapture ? [null, -1] : null;
    }
    const start = m.starts[i]!;
    if (offsetCapture) {
      return offsetPair(s, start, m.ends[i]!, unmatchedAsNull);
    }
    return start === -1 && unmatchedAsNull ? null : text(s, start, m.ends[i]!);
  };
  const last = unmatchedAsNull ? p.groups + 1 : m.count;
  for (let i = 0; i < last; i++) {
    const name = p.names[i] ?? null;
    if (name !== null) {
      entries.push([name, value(i)]);
    }
    entries.push([i, value(i)]);
  }
  return entries;
}

/** The compiled pattern, or null after recording PHP's compile failure (error 1). */
function compiled(fn: string, pattern: string): PcrePattern | null {
  const p = compilePattern(fn, pattern);
  if (p === null) {
    record(PREG_INTERNAL_ERROR);
  }
  return p;
}

/** `php_pcre_match_impl`. */
function matchImpl(fn: string, p: PcrePattern, subject: string, matches: Ref<unknown> | null, global: boolean, flags: bigint, offset: bigint): number | false {
  if (matches !== null) {
    matches.value = [];
  }
  let order = global ? PREG_PATTERN_ORDER : 0;
  const offsetCapture = (flags & 256n) !== 0n;
  const unmatchedAsNull = (flags & 512n) !== 0n;
  if ((flags & 0xffn) !== 0n) {
    order = Number(flags & 0xffn);
    if ((global && (order < PREG_PATTERN_ORDER || order > PREG_SET_ORDER)) || (!global && order !== 0)) {
      throw new ValueError(`${fn}(): Argument #4 ($flags) must be a PREG_* constant`);
    }
  }
  const s = pcreSubject(fn, p, subject);
  const length = BigInt(s.byteLength);
  const startByte = offset < 0n ? (-offset <= length ? length + offset : 0n) : offset;
  if (startByte > length) {
    record(PREG_INTERNAL_ERROR);
    return false;
  }
  const search = searchRegExp(p);
  const sets: unknown[][] | null = global && matches !== null && order === PREG_PATTERN_ORDER
    ? Array.from({ length: p.groups + 1 }, () => []) : null;
  const setOrder: unknown[] = [];
  let single: [PhpArrayKey, unknown][] | null = null;
  let matched = 0;
  // A `u` offset inside a UTF-8 sequence is PCRE2_ERROR_BADUTFOFFSET from the first match: error 5, and the
  // subpattern lists PHP allocated before it still fill `$matches`.
  const startIndex = s.indexOf(Number(startByte));
  let start = startIndex ?? 0;
  let m = startIndex === null ? null : pcreExec(p, s, search, start, false);
  outer: while (m !== null) {
    for (;;) {
      matched++;
      if (matches !== null) {
        if (!global) {
          single = subpatterns(p, s, m, flags);
          break outer;
        }
        if (sets !== null) {
          for (let i = 0; i <= p.groups; i++) {
            const begin = i < m.count ? m.starts[i]! : -1;
            const end = i < m.count ? m.ends[i]! : -1;
            sets[i]!.push(offsetCapture ? offsetPair(s, begin, end, unmatchedAsNull)
              : begin === -1 && unmatchedAsNull ? null : text(s, begin, end));
          }
        } else {
          setOrder.push(matchArray(subpatterns(p, s, m, flags)));
        }
      }
      start = m.ends[0]!;
      if (start === m.starts[0]) {
        const retry = pcreExec(p, s, search, start, true);
        if (retry !== null) {
          if (!global) {
            break outer;
          }
          m = retry;
          continue;
        }
        if (start < s.text.length) {
          start = s.next(start);
        } else {
          break outer;
        }
      }
      break;
    }
    if (!global) {
      break;
    }
    m = pcreExec(p, s, search, start, false);
  }
  if (matches !== null) {
    if (sets !== null) {
      const entries: [PhpArrayKey, unknown][] = [];
      for (let i = 0; i <= p.groups; i++) {
        const name = p.names[i] ?? null;
        if (name !== null) {
          // A keyed array throws at once for a value JS cannot hold, as `matchArray` does.
          const unholdable = sets[i]!.map((v) => Array.isArray(v) ? v[0] : v).find(isUnholdable);
          if (unholdable !== undefined) {
            throw unholdable.unholdable;
          }
          entries.push([name, holdable(sets[i]!.map((v) => Array.isArray(v) ? [...v] : v))]);
        }
        entries.push([i, holdable(sets[i]!)]);
      }
      matches.value = arrayFromEntries(entries);
    } else if (global) {
      matches.value = setOrder;
    } else if (single !== null) {
      matches.value = matchArray(single);
    }
  }
  if (startIndex === null) {
    record(PREG_BAD_UTF8_OFFSET_ERROR);
    return false;
  }
  record(PREG_NO_ERROR);
  return matched;
}

/** `php_do_pcre_match`'s argument parsing, shared by `preg_match` and `preg_match_all`. */
function doMatch(fn: string, global: boolean, pattern: unknown, subject: unknown, matches: unknown, flags: unknown, offset: unknown): number | false {
  const ref = reference(fn, 3, "matches", matches);
  const regex = wellFormed(fn, stringParameter(fn, 1, "pattern", pattern));
  const string = wellFormed(fn, stringParameter(fn, 2, "subject", subject));
  const flagBits = longParameter(fn, 4, "flags", flags, 0n);
  const start = longParameter(fn, 5, "offset", offset, 0n);
  const p = compiled(fn, regex);
  if (p === null) {
    return false;
  }
  if (start === INT_MIN) {
    throw new ValueError(`${fn}(): Argument #5 ($offset) must be greater than ${INT_MIN}`);
  }
  return matchImpl(fn, p, string, ref, global, flagBits, start);
}

/**
 * PHP's `preg_match($pattern, $subject, &$matches = null, $flags = 0, $offset = 0)`: 1 when `pattern` matches
 * `subject` from the byte `offset` (negative counts from the end), else 0, and `false` (with `preg_last_error()` 1)
 * for a pattern PHP cannot compile or an offset past the end (5 for a `u` offset inside a UTF-8 sequence).
 * `matches`, a `Ref`, receives PHP's array: the whole match at 0, each group at its number and a named group under
 * its name first; without `PREG_UNMATCHED_AS_NULL` trailing unmatched groups are dropped and middle ones are `""`,
 * with `PREG_OFFSET_CAPTURE` each entry is `[string, byte offset]`. PHP's `ValueError` for another `flags`.
 */
export function preg_match(pattern: unknown, subject: unknown, matches: Ref<unknown> | null = null, flags: unknown = 0, offset: unknown = 0): number | false {
  return doMatch("preg_match", false, pattern, subject, matches, flags, offset);
}

/**
 * PHP's `preg_match_all($pattern, $subject, &$matches = null, $flags = 0, $offset = 0)`: the number of matches, found
 * as PHP iterates (after an empty match, a non-empty match anchored at the same place, else one character on), or
 * `false` as `preg_match` gives it. `matches` is grouped by subpattern (`PREG_PATTERN_ORDER`, trailing unmatched
 * groups `""`) or by match (`PREG_SET_ORDER`, each as `preg_match` gives it).
 */
export function preg_match_all(pattern: unknown, subject: unknown, matches: Ref<unknown> | null = null, flags: unknown = 0, offset: unknown = 0): number | false {
  return doMatch("preg_match_all", true, pattern, subject, matches, flags, offset);
}

/**
 * PHP's `preg_split($pattern, $subject, $limit = -1, $flags = 0)`: the pieces of `subject` between matches of
 * `pattern`, at most `limit` (-1 or 0 for no limit), with `PREG_SPLIT_NO_EMPTY`, `PREG_SPLIT_DELIM_CAPTURE` and
 * `PREG_SPLIT_OFFSET_CAPTURE`; `false` for a pattern PHP cannot compile.
 */
export function preg_split(pattern: unknown, subject: unknown, limit: unknown = -1, flags: unknown = 0): unknown[] | false {
  const fn = "preg_split";
  const regex = wellFormed(fn, stringParameter(fn, 1, "pattern", pattern));
  const string = wellFormed(fn, stringParameter(fn, 2, "subject", subject));
  let limitVal = longParameter(fn, 3, "limit", limit, -1n);
  const flagBits = longParameter(fn, 4, "flags", flags, 0n);
  const p = compiled(fn, regex);
  if (p === null) {
    return false;
  }
  const noEmpty = (flagBits & 1n) !== 0n;
  const delimCapture = (flagBits & 2n) !== 0n;
  const offsetCapture = (flagBits & 4n) !== 0n;
  const s = pcreSubject(fn, p, string);
  const pieces: unknown[] = [];
  const piece = (start: number, end: number): void => {
    pieces.push(offsetCapture ? offsetPair(s, start, end, false) : text(s, start, end));
  };
  let lastMatch = 0;
  let skip = false;
  if (limitVal === -1n) {
    // No limit.
  } else if (limitVal === 0n) {
    limitVal = -1n;
  } else if (limitVal <= 1n) {
    skip = true;
  }
  if (!skip) {
    const search = searchRegExp(p);
    let start = 0;
    let m = pcreExec(p, s, search, start, false);
    outer: while (m !== null) {
      for (;;) {
        if (!noEmpty || m.starts[0] !== lastMatch) {
          piece(lastMatch, m.starts[0]!);
          if (limitVal !== -1n) {
            limitVal--;
          }
        }
        if (delimCapture) {
          for (let i = 1; i < m.count; i++) {
            if (!noEmpty || m.starts[i] !== m.ends[i]) {
              piece(m.starts[i]!, m.ends[i]!);
            }
          }
        }
        start = lastMatch = m.ends[0]!;
        if (start === m.starts[0]) {
          if (limitVal !== -1n && limitVal <= 1n) {
            break outer;
          }
          const retry = pcreExec(p, s, search, start, true);
          if (retry !== null) {
            m = retry;
            continue;
          }
          if (start < s.text.length) {
            start = s.next(start);
          } else {
            break outer;
          }
        }
        break;
      }
      if (limitVal !== -1n && limitVal <= 1n) {
        break;
      }
      m = pcreExec(p, s, search, start, false);
    }
  }
  record(PREG_NO_ERROR);
  if (!noEmpty || lastMatch < s.text.length) {
    piece(lastMatch, s.text.length);
  }
  return holdable(pieces);
}

/** An `array|string` parameter (`Z_PARAM_ARRAY_HT_OR_STR`): an array's entries, else its string. */
function arrayOrString(fn: string, position: number, name: string, value: unknown): { entries: [PhpArrayKey, unknown][] } | { string: string } {
  if (is_array(value)) {
    return { entries: arrayEntries(value as object) };
  }
  const string = toStringArgument(value);
  if (string === null) {
    throw argumentTypeError(fn, position, name, "array|string", value);
  }
  return { string: wellFormed(fn, string) };
}

/** The replacement count, and an exception a callback threw, which PHP leaves pending while it finishes the call. */
interface Counter {
  n: number;
  pending: { readonly error: unknown } | null;
  /** The error code to record once the call ends without a limit thrown (a limit records nothing). */
  code: number;
}

/** `php_pcre_replace_func_impl` on one subject: the result, or null after an error. */
function replaceOne(fn: string, p: PcrePattern, subject: string, callback: (...args: unknown[]) => unknown, limitIn: number, counter: Counter, flags: bigint): string | null {
  const s = pcreSubject(fn, p, subject);
  const out: Uint8Array[] = [];
  let limit = limitIn;
  let start = 0;
  let lastEnd = 0;
  counter.code = PREG_NO_ERROR;
  const search = searchRegExp(p);
  let m = pcreExec(p, s, search, start, false);
  for (;;) {
    let finished = false;
    if (m !== null && limit > 0) {
      let piece = lastEnd;
      for (;;) {
        counter.n++;
        // With an exception pending PHP calls no further callback (`zend_call_function` fails): the call errors.
        if (counter.pending !== null) {
          counter.code = PREG_INTERNAL_ERROR;
          return null;
        }
        const argument = matchArray(subpatterns(p, s, m, flags));
        let result: string;
        try {
          result = toPhpString(callback(argument) ?? null);
        } catch (error) {
          counter.pending = { error };
          counter.code = PREG_INTERNAL_ERROR;
          return null;
        }
        const replacement = wellFormed(fn, result);
        out.push(s.bytes(piece, m.starts[0]!), utf8.encode(replacement));
        limit--;
        start = lastEnd = m.ends[0]!;
        if (start === m.starts[0]) {
          const retry = pcreExec(p, s, search, start, true);
          piece = start;
          if (retry !== null && limit > 0) {
            m = retry;
            continue;
          }
          if (start < s.text.length) {
            start = s.next(start);
          } else {
            finished = true;
          }
        }
        break;
      }
    } else {
      finished = true;
    }
    if (finished) {
      out.push(s.bytes(lastEnd, s.text.length));
      break;
    }
    m = pcreExec(p, s, search, start, false);
  }
  const total = out.reduce((sum, part) => sum + part.length, 0);
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const part of out) {
    bytes.set(part, at);
    at += part.length;
  }
  return decodeResult(fn, bytes);
}

/** `php_replace_in_subject_func`: each pattern in turn over one subject (null for one PHP cannot compile). */
function replaceInSubject(fn: string, patterns: readonly (PcrePattern | null)[], subject: string, callback: (...args: unknown[]) => unknown, limit: number, counter: Counter, flags: bigint): string | null {
  let result: string | null = subject;
  for (const p of patterns) {
    if (p === null) {
      counter.code = PREG_INTERNAL_ERROR;
      return null;
    }
    result = replaceOne(fn, p, result, callback, limit, counter, flags);
    if (result === null) {
      break;
    }
  }
  return result;
}

/**
 * PHP's `preg_replace_callback($pattern, $callback, $subject, $limit = -1, &$count = null, $flags = 0)`: `subject`
 * with each match of `pattern` (at most `limit` per pattern and subject; -1 or any negative for no limit) replaced by
 * `callback`'s result, converted as PHP's `(string)`. `callback` receives the match array `preg_match` gives (with
 * `PREG_OFFSET_CAPTURE` / `PREG_UNMATCHED_AS_NULL` from `flags`). An array `pattern` applies each in turn; an array
 * `subject` gives an array with its keys kept. A pattern PHP cannot compile gives null (an array subject drops that
 * key). `count`, a `Ref`, receives the number of replacements.
 */
export function preg_replace_callback(pattern: unknown, callback: unknown, subject: unknown, limit: unknown = -1, count: Ref<unknown> | null = null, flags: unknown = 0): unknown {
  const fn = "preg_replace_callback";
  const ref = reference(fn, 5, "count", count);
  const patterns = arrayOrString(fn, 1, "pattern", pattern);
  const target = callableParameter(fn, 2, callback)!;
  const subjects = arrayOrString(fn, 3, "subject", subject);
  const limitVal = longParameter(fn, 4, "limit", limit, -1n);
  const flagBits = longParameter(fn, 6, "flags", flags, 0n);
  // `size_t limit`: a negative limit is no limit.
  const most = limitVal < 0n ? Infinity : Number(limitVal);
  // Every pattern is converted before anything is replaced, so a form outside the rule throws its limit first.
  const compiledPatterns = ("string" in patterns ? [patterns.string] : patterns.entries.map(([, value]) => wellFormed(fn, toPhpString(value))))
    .map((regex) => compilePattern(fn, regex));
  const counter: Counter = { n: 0, pending: null, code: PREG_NO_ERROR };
  let result: unknown;
  if ("string" in subjects) {
    result = replaceInSubject(fn, compiledPatterns, subjects.string, target, most, counter, flagBits);
  } else {
    const out: [PhpArrayKey, unknown][] = [];
    for (const [key, value] of subjects.entries) {
      const replaced = replaceInSubject(fn, compiledPatterns, wellFormed(fn, toPhpString(value)), target, most, counter, flagBits);
      if (replaced !== null) {
        out.push([key, replaced]);
      }
    }
    result = arrayFromEntries(out);
  }
  if ("string" in subjects || subjects.entries.length > 0) {
    record(counter.code);
  }
  if (ref !== null) {
    ref.value = counter.n;
  }
  if (counter.pending !== null) {
    throw counter.pending.error;
  }
  return result;
}
