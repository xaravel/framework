// The Temporal and bcrypt spikes (Story 8.4; OQ-4, OQ-8, FR-25, FR-78;
// docs/ops/spikes.md documents usage and the CI round trip).
//
//   bun conformance/spikes/spikes.ts requests [--check] [--root <dir>]
//       (`bun run spikes:requests`) writes conformance/oracle-requests/8.4.jsonl
//       from the registries (`renderRequestsFile`): one `php-expr` request per
//       Carbon need (XT-conformance-157) and per bcrypt case
//       (XT-conformance-158), in registry order. With --check it writes
//       nothing and exits 1 when the file differs.
//   bun conformance/spikes/spikes.ts check [--root <dir>]
//       (`bun run spikes:check`) runs every Temporal mapping and the bcrypt
//       verifier live on this Bun, reads each request's signed fixture
//       conformance/fixtures/conformance/<sha256>.json (verified against
//       conformance/oracle/oracle.pub) and compares the three with
//       conformance/spikes/REPORT.md (`checkSpikes`). Prints one violation per
//       line on stderr and exits 1, or prints
//       `SPIKES OK: <c> covered, <g> gaps (of <n> needs); <v>/<k> bcrypt cases verify.`
//   bun conformance/spikes/spikes.ts generate [--root <dir>]
//       (`bun run spikes:generate`) rewrites REPORT.md wholly from the
//       registries, the fixtures and a live run (`renderReport`). Refuses
//       (exit 1, nothing written) on any violation other than report drift.
//
// The Oracle is the only source of expected values: a need's PHP expressions
// run in the Oracle (Carbon 3 at the Pin), and its `temporal()` mapping runs
// here. A need is `covered` when every Temporal string equals the Oracle's
// value, otherwise a `gap`; a mapping that returns null is a gap with its
// reason. A mapping uses only Temporal, Intl and plain arithmetic: no
// expected value and no zone table of its own. A bcrypt case's `$2y$` hash is
// PHP's (`crypt` with a fixed salt, so the Oracle's two evaluations match);
// Bun verifies the case's UTF-8 bytes truncated to 72, passed as bytes and
// never re-decoded, and the untruncated string as the control.
//
// `check` violations (one line each, naming the need or case id):
//   - `conformance/oracle-requests/8.4.jsonl: differs from the registry; run bun run spikes:requests`;
//   - `<id>: no signed fixture conformance/fixtures/conformance/<sha>.json`;
//   - `<id>: fixture <path>: <problem>` (verifyFixture, e.g. `the signature does not verify`);
//   - `<id>: the Oracle reports an error at <stage>: <class>: <message>`;
//   - `<id>: result <i> throws <class>: <message>` / `<id>: result <i> is not a string: <json>`
//     (a bcrypt case's results are a string, a bool and an int);
//   - `<id>: <n> result(s) for <m> expression(s)`;
//   - `<id>: Temporal returned <n> string(s) for <m> expression(s)`;
//   - a failed bcrypt measurement: `<id>: the Oracle hash <h> does not start with $2y$12$<salt>`,
//     `<id>: the Oracle's password_verify is <v>, not true`, `<id>: the Oracle's strlen is <n>, not
//     the UTF-8 byte count <m>`, `<id>: Bun does not verify the 72-byte truncation against PHP's hash`,
//     `<id>: the untruncated control verifies over 72 bytes (<n>)` or `<id>: the untruncated control
//     does not verify at <n> bytes`;
//   - `running Bun <Bun.version>, .bun-version <pin>`;
//   - `conformance/spikes/REPORT.md: drift at line <n>; run bun run spikes:generate`.
//
// Exit codes: 0 pass, 1 violations or any failure (fail closed), 2 usage error.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { FIXTURES_DIR, PUBLIC_KEY_FILE, verifyFixture } from "../../tools/oracle/fixtures";
import { makeRequest, renderRequest, type Json, type OracleRequest } from "../../tools/oracle/request";
import { UsageError } from "../../tools/expectations/expectations";
import { runningBunViolation } from "../probes/probes";

export const REQUESTS_FILE = "conformance/oracle-requests/8.4.jsonl";
export const REPORT_FILE = "conformance/spikes/REPORT.md";
/** The manifest's Component (`stories/8.4.md`): the `story` job writes its fixtures here. */
export const FIXTURE_DIR = `${FIXTURES_DIR}/conformance`;
export { PUBLIC_KEY_FILE };
export const NEEDS_TEST_ID = "XT-conformance-157";
export const BCRYPT_TEST_ID = "XT-conformance-158";
export const OQ12_TEST_ID = "XT-conformance-159";
const TOOL_ROOT = resolve(import.meta.dir, "..", "..");

// ---------------------------------------------------------------------------
// Temporal helpers (plain arithmetic over Temporal fields; no expected value)

type Zoned = Temporal.ZonedDateTime;

/** `Y-m-d H:i[:s[.u]]` in `zone`, as Carbon's `parse($text, $zone)` reads it (an ambiguous or skipped time resolves `compatible`). */
function at(text: string, zone: string): Zoned {
  return Temporal.PlainDateTime.from(text.replace(" ", "T")).toZonedDateTime(zone);
}

/** `\Carbon\CarbonImmutable::parse('<text>', '<zone>')`. */
function carbon(text: string, zone: string): string {
  return `\\Carbon\\CarbonImmutable::parse('${text}', '${zone}')`;
}

const pad = (n: number, width: number): string => (n < 0 ? `-${pad(-n, width)}` : String(n).padStart(width, "0"));

/** Floor division of bigints. */
function floorDiv(a: bigint, b: bigint): bigint {
  const q = a / b;
  return (a % b !== 0n && a < 0n !== b < 0n) ? q - 1n : q;
}

/** The epoch seconds and microseconds of an instant, as PHP's `U` and `u` print them (floor seconds, non-negative micro). */
function epochParts(z: Zoned | Temporal.Instant): { seconds: bigint; micro: bigint } {
  const ns = z.epochNanoseconds;
  const seconds = floorDiv(ns, 1_000_000_000n);
  return { seconds, micro: (ns - seconds * 1_000_000_000n) / 1000n };
}

/** The instant a `U.u` string names: `U` whole seconds plus `u` microseconds, as PHP's createFromFormat reads it. */
function fromUu(text: string): Temporal.Instant {
  const [seconds, micro] = text.split(".");
  return Temporal.Instant.fromEpochNanoseconds(BigInt(seconds!) * 1_000_000_000n + BigInt((micro ?? "0").padEnd(6, "0")) * 1000n);
}

const offsetSeconds = (z: Zoned): number => Math.trunc(z.offsetNanoseconds / 1e9);

/** `+hhmm` (with `colon`, `+hh:mm`) of the offset. */
function offsetText(z: Zoned, colon: boolean): string {
  const total = offsetSeconds(z);
  const abs = Math.abs(total);
  return `${total < 0 ? "-" : "+"}${pad(Math.floor(abs / 3600), 2)}${colon ? ":" : ""}${pad(Math.floor((abs % 3600) / 60), 2)}`;
}

/** Intl's short English name of the zone at the instant (Temporal itself has no abbreviation). */
const abbreviation = (z: Zoned): string =>
  new Intl.DateTimeFormat("en-US", { timeZone: z.timeZoneId, timeZoneName: "short" }).formatToParts(z.epochMilliseconds).find((part) => part.type === "timeZoneName")!.value;

const micro = (z: Zoned): number => z.millisecond * 1000 + z.microsecond;
const hour12 = (z: Zoned): number => z.hour % 12 || 12;
const ORDINAL: Record<string, string> = { one: "st", two: "nd", few: "rd", other: "th" };
const ordinalRules = new Intl.PluralRules("en-US", { type: "ordinal" });

/** The Temporal (or Intl) form of each PHP `date()` token; null where Temporal has no API for it. */
export const TOKENS: Readonly<Record<string, { what: string; map: ((z: Zoned) => string) | null; reason?: string }>> = {
  d: { what: "day of the month, 2 digits", map: (z) => pad(z.day, 2) },
  D: { what: "short English day name", map: (z) => z.toPlainDate().toLocaleString("en-US", { weekday: "short" }) },
  j: { what: "day of the month", map: (z) => String(z.day) },
  l: { what: "full English day name", map: (z) => z.toPlainDate().toLocaleString("en-US", { weekday: "long" }) },
  N: { what: "ISO day of the week, 1 (Monday) to 7", map: (z) => String(z.dayOfWeek) },
  S: { what: "English ordinal suffix of the day", map: (z) => ORDINAL[ordinalRules.select(z.day)]! },
  w: { what: "day of the week, 0 (Sunday) to 6", map: (z) => String(z.dayOfWeek % 7) },
  z: { what: "day of the year, from 0", map: (z) => String(z.dayOfYear - 1) },
  W: { what: "ISO week number, 2 digits", map: (z) => pad(z.weekOfYear!, 2) },
  F: { what: "full English month name", map: (z) => z.toPlainDate().toLocaleString("en-US", { month: "long" }) },
  m: { what: "month, 2 digits", map: (z) => pad(z.month, 2) },
  M: { what: "short English month name", map: (z) => z.toPlainDate().toLocaleString("en-US", { month: "short" }) },
  n: { what: "month", map: (z) => String(z.month) },
  t: { what: "days in the month", map: (z) => String(z.daysInMonth) },
  L: { what: "leap year flag", map: (z) => (z.inLeapYear ? "1" : "0") },
  o: { what: "ISO week-numbering year", map: (z) => String(z.yearOfWeek!) },
  X: { what: "expanded year, always signed", map: (z) => `${z.year < 0 ? "-" : "+"}${pad(Math.abs(z.year), 4)}` },
  x: { what: "expanded year, signed only when needed", map: (z) => (z.year < 0 ? `-${pad(-z.year, 4)}` : z.year >= 10000 ? `+${z.year}` : pad(z.year, 4)) },
  Y: { what: "full year, at least 4 digits", map: (z) => pad(z.year, 4) },
  y: { what: "2-digit year", map: (z) => pad(Math.abs(z.year) % 100, 2) },
  a: { what: "am or pm", map: (z) => (z.hour < 12 ? "am" : "pm") },
  A: { what: "AM or PM", map: (z) => (z.hour < 12 ? "AM" : "PM") },
  B: {
    what: "Swatch Internet time",
    map: (z) => {
      // PHP's own arithmetic over the epoch seconds (C `%` truncates, as JS `%` does).
      let beat = ((Number(epochParts(z).seconds) % 86400) + 3600) * 10;
      if (beat < 0) {
        beat += 864000;
      }
      return pad(Math.floor(beat / 864) % 1000, 3);
    },
  },
  g: { what: "12-hour hour", map: (z) => String(hour12(z)) },
  G: { what: "24-hour hour", map: (z) => String(z.hour) },
  h: { what: "12-hour hour, 2 digits", map: (z) => pad(hour12(z), 2) },
  H: { what: "24-hour hour, 2 digits", map: (z) => pad(z.hour, 2) },
  i: { what: "minutes, 2 digits", map: (z) => pad(z.minute, 2) },
  s: { what: "seconds, 2 digits", map: (z) => pad(z.second, 2) },
  u: { what: "microseconds, 6 digits", map: (z) => pad(micro(z), 6) },
  v: { what: "milliseconds, 3 digits", map: (z) => pad(z.millisecond, 3) },
  e: { what: "timezone identifier", map: (z) => z.timeZoneId },
  I: { what: "daylight saving time flag", map: null, reason: "no DST flag in Temporal" },
  O: { what: "UTC offset `+hhmm`", map: (z) => offsetText(z, false) },
  P: { what: "UTC offset `+hh:mm`", map: (z) => offsetText(z, true) },
  // PHP prints `Z` only when the zone's abbreviation is UTC, not for every zero offset (Europe/London in winter is `+00:00`).
  p: { what: "UTC offset `+hh:mm`, `Z` for UTC", map: (z) => (abbreviation(z) === "UTC" ? "Z" : offsetText(z, true)) },
  T: { what: "timezone abbreviation", map: (z) => abbreviation(z) },
  Z: { what: "UTC offset in seconds", map: (z) => String(offsetSeconds(z)) },
  c: { what: "ISO 8601 date (`Y-m-d\\TH:i:sP`)", map: (z) => phpFormat(z, "Y-m-d\\TH:i:sP") },
  r: { what: "RFC 2822 date (`D, d M Y H:i:s O`)", map: (z) => phpFormat(z, "D, d M Y H:i:s O") },
  U: { what: "seconds since the Unix epoch", map: (z) => String(epochParts(z).seconds) },
};

/** `z` formatted as PHP's `DateTimeInterface::format($format)` would, from TOKENS (a `\` escapes the next character). */
export function phpFormat(z: Zoned, format: string): string {
  let out = "";
  for (let i = 0; i < format.length; i++) {
    const char = format[i]!;
    if (char === "\\") {
      out += format[++i] ?? "";
      continue;
    }
    const token = TOKENS[char];
    if (token === undefined) {
      out += char;
    } else if (token.map === null) {
      throw new Error(`token ${char} has no Temporal mapping`);
    } else {
      out += token.map(z);
    }
  }
  return out;
}

/** Carbon 3's month arithmetic with overflow (PHP `modify('+n month')`): the day overflows into the next month. */
function addMonthsOverflow(z: Zoned, months: number): Zoned {
  const date = z.toPlainDate().with({ day: 1 }).add({ months }).add({ days: z.day - 1 });
  return date.toPlainDateTime(z.toPlainTime()).toZonedDateTime(z.timeZoneId);
}

// ---------------------------------------------------------------------------
// The Carbon needs registry (XT-conformance-157)

export const GROUPS = ["tz", "month", "bounds", "instant", "format"] as const;
export type Group = (typeof GROUPS)[number];

export interface Need {
  /** `<group>.<name>`. */
  id: string;
  group: Group;
  /** What Carbon needs, in one phrase. */
  what: string;
  /** One PHP expression per sample, each returning a string. */
  exprs: string[];
  /** The Temporal strings, one per expression, or null when Temporal has no API for the need. */
  temporal: () => string[] | null;
  /** Why `temporal()` returns null; null when it returns strings. */
  reason: string | null;
}

/** The full-instant form the timezone needs compare: wall time with microseconds, offset and zone. */
const FULL = "Y-m-d H:i:s.u P e";
const NY = "America/New_York";

function need(group: Group, name: string, what: string, exprs: string[], temporal: () => string[] | null, reason: string | null = null): Need {
  return { id: `${group}.${name}`, group, what, exprs, temporal, reason };
}

const TZ_NEEDS: Need[] = [
  need("tz", "addHours-spring-gap", "`addHours(1)` across the spring-forward gap (America/New_York 2026-03-08 01:30)", [`${carbon("2026-03-08 01:30:00", NY)}->addHours(1)->format('${FULL}')`], () => [phpFormat(at("2026-03-08 01:30:00", NY).add({ hours: 1 }), FULL)]),
  need("tz", "addDay-into-gap", "`addDay()` landing in the spring-forward gap (America/New_York 2026-03-07 02:30)", [`${carbon("2026-03-07 02:30:00", NY)}->addDay()->format('${FULL}')`], () => [phpFormat(at("2026-03-07 02:30:00", NY).add({ days: 1 }), FULL)]),
  need("tz", "parse-ambiguous", "an ambiguous fall-back wall time (America/New_York 2026-11-01 01:30)", [`${carbon("2026-11-01 01:30:00", NY)}->format('${FULL}')`], () => [phpFormat(at("2026-11-01 01:30:00", NY), FULL)]),
  need("tz", "addHours-fall-back", "`addHours(2)` across fall-back (America/New_York 2026-11-01 00:30)", [`${carbon("2026-11-01 00:30:00", NY)}->addHours(2)->format('${FULL}')`], () => [phpFormat(at("2026-11-01 00:30:00", NY).add({ hours: 2 }), FULL)]),
  need(
    "tz",
    "diffInHours-23h-day",
    "`(int) diffInHours` over the 23-hour day (America/New_York 2026-03-08)",
    [`(string) (int) ${carbon("2026-03-08 00:00:00", NY)}->diffInHours(${carbon("2026-03-09 00:00:00", NY)})`],
    () => [String(at("2026-03-08 00:00:00", NY).until(at("2026-03-09 00:00:00", NY), { largestUnit: "hours" }).hours)],
  ),
  need("tz", "setTimezone", "`setTimezone('Asia/Kolkata')` (a +05:30 offset) from America/New_York", [`${carbon("2026-10-18 08:34:56.789012", NY)}->setTimezone('Asia/Kolkata')->format('${FULL}')`], () => [phpFormat(at("2026-10-18 08:34:56.789012", NY).withTimeZone("Asia/Kolkata"), FULL)]),
  need("tz", "startOfDay-no-midnight", "`startOfDay()` on a day without midnight (America/Sao_Paulo 2018-11-04)", [`${carbon("2018-11-04 12:00:00", "America/Sao_Paulo")}->startOfDay()->format('${FULL}')`], () => [phpFormat(at("2018-11-04 12:00:00", "America/Sao_Paulo").startOfDay(), FULL)]),
];

const DAY = "Y-m-d H:i:s";
const MONTH_NEEDS: Need[] = [
  need("month", "addMonth", "`addMonth()` from 2026-01-31 overflows into March", [`${carbon("2026-01-31 10:00:00", "UTC")}->addMonth()->format('${DAY}')`], () => [phpFormat(addMonthsOverflow(at("2026-01-31 10:00:00", "UTC"), 1), DAY)]),
  need("month", "addMonthNoOverflow", "`addMonthNoOverflow()` from 2026-01-31 clamps to February", [`${carbon("2026-01-31 10:00:00", "UTC")}->addMonthNoOverflow()->format('${DAY}')`], () => [phpFormat(at("2026-01-31 10:00:00", "UTC").add({ months: 1 }), DAY)]),
  need("month", "subMonth", "`subMonth()` from 2026-03-31 overflows past February", [`${carbon("2026-03-31 10:00:00", "UTC")}->subMonth()->format('${DAY}')`], () => [phpFormat(addMonthsOverflow(at("2026-03-31 10:00:00", "UTC"), -1), DAY)]),
  need("month", "subMonthNoOverflow", "`subMonthNoOverflow()` from 2026-03-31 clamps to February", [`${carbon("2026-03-31 10:00:00", "UTC")}->subMonthNoOverflow()->format('${DAY}')`], () => [phpFormat(at("2026-03-31 10:00:00", "UTC").subtract({ months: 1 }), DAY)]),
  need("month", "addYear", "`addYear()` from 2024-02-29 overflows into March", [`${carbon("2024-02-29 10:00:00", "UTC")}->addYear()->format('${DAY}')`], () => [phpFormat(addMonthsOverflow(at("2024-02-29 10:00:00", "UTC"), 12), DAY)]),
  need("month", "addYearNoOverflow", "`addYearNoOverflow()` from 2024-02-29 clamps to February 28", [`${carbon("2024-02-29 10:00:00", "UTC")}->addYearNoOverflow()->format('${DAY}')`], () => [phpFormat(at("2024-02-29 10:00:00", "UTC").add({ years: 1 }), DAY)]),
];

const BOUNDS_AT = "2026-10-14 15:47:23.123456";
const MICRO = "Y-m-d H:i:s.u";
const START = { hour: 0, minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 };
const END = { hour: 23, minute: 59, second: 59, millisecond: 999, microsecond: 999, nanosecond: 0 };
type Plain = Temporal.PlainDateTime;
/** Each unit's start and end, on the wall clock (Carbon sets wall time, then the zone resolves it). */
const BOUNDS: readonly [string, (p: Plain) => [Plain, Plain]][] = [
  ["minute", (p) => [p.with({ second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 }), p.with({ second: 59, millisecond: 999, microsecond: 999, nanosecond: 0 })]],
  ["hour", (p) => [p.with({ minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 }), p.with({ minute: 59, second: 59, millisecond: 999, microsecond: 999, nanosecond: 0 })]],
  ["day", (p) => [p.with(START), p.with(END)]],
  [
    "week",
    (p) => {
      // Carbon's week starts on its locale's first day; its `en` locale says Monday, Temporal's ISO day 1.
      const start = p.with(START).subtract({ days: p.dayOfWeek - 1 });
      return [start, start.add({ days: 6 }).with(END)];
    },
  ],
  ["month", (p) => [p.with({ ...START, day: 1 }), p.with({ ...END, day: p.daysInMonth })]],
  [
    "quarter",
    (p) => {
      const first = p.with({ ...START, day: 1, month: 3 * Math.floor((p.month - 1) / 3) + 1 });
      const last = first.add({ months: 2 });
      return [first, last.with({ ...END, day: last.daysInMonth })];
    },
  ],
  ["year", (p) => [p.with({ ...START, month: 1, day: 1 }), p.with({ ...END, month: 12, day: 31 })]],
];
const BOUNDS_NEEDS: Need[] = BOUNDS.map(([unit, bounds]) => {
  const method = unit[0]!.toUpperCase() + unit.slice(1);
  return need(
    "bounds",
    unit,
    `\`startOf${method}()\` and \`endOf${method}()\` (America/New_York ${BOUNDS_AT})`,
    [`${carbon(BOUNDS_AT, NY)}->startOf${method}()->format('${MICRO}')`, `${carbon(BOUNDS_AT, NY)}->endOf${method}()->format('${MICRO}')`],
    () => bounds(at(BOUNDS_AT, NY).toPlainDateTime()).map((p) => phpFormat(p.toZonedDateTime(NY), MICRO)),
  );
});

/** PHP's round(): half away from zero (Math.round rounds half up). */
const phpRound = (n: number): number => Math.sign(n) * Math.round(Math.abs(n));

const UU = "1760790896.789012";
const PRE_EPOCH = "1969-12-31 23:59:59.250000";
const uu = (z: Zoned | Temporal.Instant): string => {
  const { seconds, micro: us } = epochParts(z);
  return `${seconds}.${String(us).padStart(6, "0")}`;
};
const INSTANT_NEEDS: Need[] = [
  need(
    "instant",
    "createFromFormat-U-u",
    "a `U.u` microsecond round-trip through `createFromFormat`",
    [`\\Carbon\\CarbonImmutable::createFromFormat('U.u', '${UU}')->format('U.u')`, `\\Carbon\\CarbonImmutable::createFromFormat('U.u', '${UU}')->format('${MICRO}')`],
    () => [uu(fromUu(UU)), phpFormat(fromUu(UU).toZonedDateTimeISO("UTC"), MICRO)],
  ),
  need(
    "instant",
    "pre-epoch-U-u",
    `a pre-epoch \`U.u\` (${PRE_EPOCH} UTC) and its round-trip`,
    [`${carbon(PRE_EPOCH, "UTC")}->format('U.u')`, `\\Carbon\\CarbonImmutable::createFromFormat('U.u', ${carbon(PRE_EPOCH, "UTC")}->format('U.u'))->format('${MICRO}')`],
    () => [uu(at(PRE_EPOCH, "UTC")), phpFormat(fromUu(uu(at(PRE_EPOCH, "UTC"))).toZonedDateTimeISO("UTC"), MICRO)],
  ),
  need(
    "instant",
    "getTimestampMs",
    "`getTimestampMs()`, after and before the epoch",
    [`(string) ${carbon("2026-10-18 08:34:56.789012", NY)}->getTimestampMs()`, `(string) ${carbon(PRE_EPOCH, "UTC")}->getTimestampMs()`],
    // Carbon reads the milliseconds from the digits of `Uu` (`round(rawFormat('Uu') / 1000)`), not from the instant,
    // so before the epoch it is `U` * 1000 - `u` / 1000 (-1250 for -0.75 s); the mapping does the same arithmetic.
    () => [at("2026-10-18 08:34:56.789012", NY), at(PRE_EPOCH, "UTC")].map((z) => String(phpRound(Number(phpFormat(z, "Uu")) / 1000))),
  ),
  need(
    "instant",
    "diffInMicroseconds",
    "`(int) diffInMicroseconds` over 1.000001 s, both ways",
    [
      `(string) (int) ${carbon("2026-10-18 08:34:56.000000", "UTC")}->diffInMicroseconds(${carbon("2026-10-18 08:34:57.000001", "UTC")})`,
      `(string) (int) ${carbon("2026-10-18 08:34:57.000001", "UTC")}->diffInMicroseconds(${carbon("2026-10-18 08:34:56.000000", "UTC")})`,
    ],
    () => {
      const a = at("2026-10-18 08:34:56.000000", "UTC");
      const b = at("2026-10-18 08:34:57.000001", "UTC");
      return [String(a.until(b, { largestUnit: "microseconds" }).microseconds), String(b.until(a, { largestUnit: "microseconds" }).microseconds)];
    },
  ),
];

/** The four samples every format token is applied to. */
export const FORMAT_SAMPLES: readonly [string, string][] = [
  ["2026-10-18 08:34:56.789012", "America/New_York"],
  ["2027-01-01 00:05:09.000001", "Europe/London"],
  ["2024-02-29 23:59:59.500000", "Asia/Kolkata"],
  ["1969-07-20 20:17:40", "UTC"],
];
/** The PHP `date()` tokens Carbon's format needs, in the spec's order. */
export const FORMAT_TOKENS = "d D j l N S w z W F m M n t L o X x Y y a A B g G h H i s u v e I O P p T Z c r U".split(" ");
const FORMAT_NEEDS: Need[] = FORMAT_TOKENS.map((token) => {
  const entry = TOKENS[token]!;
  const map = entry.map;
  return need(
    "format",
    token,
    `\`${token}\`: ${entry.what}`,
    FORMAT_SAMPLES.map(([text, zone]) => `(new \\DateTimeImmutable('${text}', new \\DateTimeZone('${zone}')))->format('${token}')`),
    map === null ? () => null : () => FORMAT_SAMPLES.map(([text, zone]) => map(at(text, zone))),
    entry.reason ?? null,
  );
});

export const NEEDS: readonly Need[] = [...TZ_NEEDS, ...MONTH_NEEDS, ...BOUNDS_NEEDS, ...INSTANT_NEEDS, ...FORMAT_NEEDS];

// ---------------------------------------------------------------------------
// The bcrypt cases registry (XT-conformance-158)

/** The fixed 22-character bcrypt salt (its last character's unused low bits are zero, so crypt() keeps it as given). */
export const SALT = "XaravelSpike84OracleTu";
export const SALT_PREFIX = `$2y$12$${SALT}`;
export const BCRYPT_LIMIT = 72;

export interface BcryptCase {
  id: string;
  /** What the case covers. */
  what: string;
  password: string;
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ascii = (n: number): string => ALPHABET.repeat(Math.ceil(n / ALPHABET.length)).slice(0, n);

export const CASES: readonly BcryptCase[] = [
  { id: "bcrypt.ascii-71", what: "ASCII, 71 bytes", password: ascii(71) },
  { id: "bcrypt.ascii-72", what: "ASCII, 72 bytes", password: ascii(72) },
  { id: "bcrypt.ascii-73", what: "ASCII, 73 bytes", password: ascii(73) },
  { id: "bcrypt.ascii-200", what: "ASCII, 200 bytes", password: ascii(200) },
  { id: "bcrypt.multibyte-72", what: "`é`×36, 72 bytes", password: "é".repeat(36) },
  { id: "bcrypt.multibyte-73-split", what: "`a`+`é`×36, 73 bytes; the 72-byte cut splits a character", password: `a${"é".repeat(36)}` },
  { id: "bcrypt.multibyte-200", what: "`a`+`パ`×66+`b`, 200 bytes", password: `a${"パ".repeat(66)}b` },
];

export const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

/** The PHP single-quoted literal of a password (the registry's passwords hold no `'` or `\`). */
function phpLiteral(text: string): string {
  if (/['\\]/.test(text)) {
    throw new Error(`password ${JSON.stringify(text)} needs escaping`);
  }
  return `'${text}'`;
}

// ---------------------------------------------------------------------------
// Requests

export function needRequest(item: Need): OracleRequest {
  return makeRequest(NEEDS_TEST_ID, "php-expr", { bindings: {}, setup: [], exprs: item.exprs });
}

export function caseRequest(item: BcryptCase): OracleRequest {
  return makeRequest(BCRYPT_TEST_ID, "php-expr", {
    bindings: {},
    setup: [`$pw = ${phpLiteral(item.password)};`, `$h = crypt($pw, '${SALT_PREFIX}');`],
    exprs: ["$h", "password_verify($pw, $h)", "strlen($pw)"],
  });
}

/** The request file: every need, then every bcrypt case, in registry order, LF-terminated. */
export function renderRequestsFile(needs: readonly Need[] = NEEDS, cases: readonly BcryptCase[] = CASES): string {
  return [...needs.map(needRequest), ...cases.map(caseRequest)].map((request) => `${renderRequest(request)}\n`).join("");
}

// ---------------------------------------------------------------------------
// Live run

export type LiveNeed = { values: string[]; reason: null } | { values: null; reason: string };
export interface LiveCase {
  /** `Bun.password.verify` on the UTF-8 bytes truncated to 72. */
  truncated: boolean;
  /** The control: `Bun.password.verify` on the whole string. */
  untruncated: boolean;
}
export interface Live {
  bun: string;
  needs: Map<string, LiveNeed>;
  /** Null when the case has no usable fixture hash. */
  cases: Map<string, LiveCase | null>;
}

/** Runs one need's mapping; a throw is a gap naming the error. */
export function runNeed(item: Need): LiveNeed {
  try {
    const values = item.temporal();
    return values === null ? { values: null, reason: item.reason ?? "no Temporal mapping" } : { values, reason: null };
  } catch (error) {
    return { values: null, reason: `the mapping throws: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/** Bun's verdicts on a PHP hash: the 72-byte truncation (bytes, never re-decoded) and the untruncated control. */
export function verifyCase(password: string, hash: string): LiveCase {
  const bytes = utf8(password);
  // A throw (a hash Bun rejects) propagates: it must never read as a mismatch.
  const check = (input: string | Uint8Array): boolean => Bun.password.verifySync(input, hash);
  return { truncated: check(bytes.subarray(0, BCRYPT_LIMIT)), untruncated: check(password) };
}

/** Every mapping, and Bun's verdict on every case whose signed fixture gives a hash. */
export function runLive(root: string, needs: readonly Need[] = NEEDS, cases: readonly BcryptCase[] = CASES): Live {
  const oracle = readOracle(root, needs, cases);
  const live: Live = { bun: Bun.version, needs: new Map(), cases: new Map() };
  for (const item of needs) {
    live.needs.set(item.id, runNeed(item));
  }
  for (const item of cases) {
    const outputs = oracle.values.get(item.id);
    const hash = outputs?.[0];
    live.cases.set(item.id, typeof hash === "string" ? verifyCase(item.password, hash) : null);
  }
  return live;
}

// ---------------------------------------------------------------------------
// Fixtures

/** A case's Oracle values: the hash, password_verify, strlen. A need's: its strings. */
export type OracleValues = (string | boolean | number)[];

export interface OracleRead {
  values: Map<string, OracleValues>;
  violations: string[];
}

/** A fixture field as text. */
const field = (value: Json | undefined): string => (typeof value === "string" ? value : JSON.stringify(value ?? null));

/** `<id>: ...` problems of one fixture output, or its decoded values. */
function decodeOutput(id: string, output: Json, kinds: readonly ("string" | "bool" | "int")[]): { values: OracleValues | null; problems: string[] } {
  const problems: string[] = [];
  if (typeof output !== "object" || output === null || Array.isArray(output) || !Array.isArray(output["results"])) {
    return { values: null, problems: [`${id}: the fixture output is not {error, results}`] };
  }
  const error = output["error"];
  if (error !== null && error !== undefined) {
    const e = error as Record<string, Json>;
    return { values: null, problems: [`${id}: the Oracle reports an error at ${field(e["stage"])}: ${field(e["class"])}: ${field(e["message"])}`] };
  }
  const results = output["results"];
  if (results.length !== kinds.length) {
    return { values: null, problems: [`${id}: ${results.length} result(s) for ${kinds.length} expression(s)`] };
  }
  const values: OracleValues = [];
  results.forEach((result, i) => {
    const r = (typeof result === "object" && result !== null && !Array.isArray(result) ? result : {}) as Record<string, Json>;
    if ("throws" in r) {
      const t = r["throws"] as Record<string, Json>;
      problems.push(`${id}: result ${i} throws ${field(t["class"])}: ${field(t["message"])}`);
      return;
    }
    const value = r["value"];
    const kind = kinds[i]!;
    if (kind === "string" && typeof value === "string") {
      values.push(value);
    } else if (kind === "bool" && typeof value === "boolean") {
      values.push(value);
    } else if (kind === "int" && typeof value === "object" && value !== null && !Array.isArray(value) && typeof value["int"] === "string") {
      values.push(Number(value["int"]));
    } else {
      problems.push(`${id}: result ${i} is not ${kind === "string" ? "a string" : kind === "bool" ? "a bool" : "an int"}: ${JSON.stringify(result)}`);
    }
  });
  return { values: problems.length > 0 ? null : values, problems };
}

/** Each need's and case's signed Oracle values, and every fixture problem. */
export function readOracle(root: string, needs: readonly Need[] = NEEDS, cases: readonly BcryptCase[] = CASES): OracleRead {
  const read: OracleRead = { values: new Map(), violations: [] };
  const keyPath = join(root, PUBLIC_KEY_FILE);
  if (!existsSync(keyPath)) {
    read.violations.push(`${PUBLIC_KEY_FILE}: missing`);
    return read;
  }
  const pem = readFileSync(keyPath, "utf8");
  const items: [string, OracleRequest, ("string" | "bool" | "int")[]][] = [
    ...needs.map((item): [string, OracleRequest, ("string" | "bool" | "int")[]] => [item.id, needRequest(item), item.exprs.map(() => "string" as const)]),
    ...cases.map((item): [string, OracleRequest, ("string" | "bool" | "int")[]] => [item.id, caseRequest(item), ["string", "bool", "int"]]),
  ];
  for (const [id, request, kinds] of items) {
    const path = `${FIXTURE_DIR}/${request.sha256}.json`;
    if (!existsSync(join(root, path))) {
      read.violations.push(`${id}: no signed fixture ${path}`);
      continue;
    }
    const text = readFileSync(join(root, path), "utf8");
    const problems = verifyFixture(text, pem, request.sha256);
    if (problems.length > 0) {
      read.violations.push(...problems.map((problem) => `${id}: fixture ${path}: ${problem}`));
      continue;
    }
    const decoded = decodeOutput(id, (JSON.parse(text) as { output: Json }).output, kinds);
    read.violations.push(...decoded.problems);
    if (decoded.values !== null) {
      read.values.set(id, decoded.values);
    }
  }
  return read;
}

// ---------------------------------------------------------------------------
// Results and the report

export type NeedResult = "covered" | "gap";

/** A need's Result: covered when every Temporal string equals the Oracle's. */
export function needResult(oracle: readonly (string | boolean | number)[], live: LiveNeed): NeedResult {
  return live.values !== null && live.values.length === oracle.length && live.values.every((value, i) => value === oracle[i]) ? "covered" : "gap";
}

/** A Markdown table cell: each value as a code span, `|` escaped. */
function cell(values: readonly string[]): string {
  return values.map((value) => `\`${value.replace(/`/g, "'")}\``.replace(/\|/g, "\\|")).join("<br>");
}

/** REPORT.md, wholly from the registries, the Oracle values and the live run (missing entries render as `(none)`). */
export function renderReport(oracle: ReadonlyMap<string, OracleValues>, live: Live, bun: string, needs: readonly Need[] = NEEDS, cases: readonly BcryptCase[] = CASES): string {
  const lines: string[] = [
    "# Temporal and bcrypt spikes (OQ-4, OQ-8)",
    "",
    `<!-- Generated by bun run spikes:generate from conformance/spikes/spikes.ts, the signed fixtures under ${FIXTURE_DIR}/ and a live run on Bun ${bun}; do not edit. -->`,
    "",
    `Story 8.4. Every PHP value is the Oracle's (Carbon 3 at the Pin, PHP 8.5), read from its signed fixture; every Temporal and Bun value is a live run on Bun ${bun}. A need is \`covered\` when every Temporal string equals the Oracle's, otherwise a \`gap\`.`,
    "",
  ];
  let covered = 0;
  const rows: string[] = [];
  for (const item of needs) {
    const php = oracle.get(item.id);
    const run = live.needs.get(item.id);
    const result = php !== undefined && run !== undefined ? needResult(php, run) : "gap";
    if (result === "covered") {
      covered++;
    }
    const temporal = run === undefined ? "(none)" : run.values === null ? "—" : cell(run.values);
    const shown = result === "gap" && run !== undefined && run.values === null ? `gap: ${run.reason}` : result;
    rows.push(`| \`${item.group}\` | \`${item.id}\` | ${item.what.replace(/\|/g, "\\|")} | ${php === undefined ? "(no fixture)" : cell(php.map(String))} | ${temporal} | ${shown} |`);
  }
  lines.push("## Carbon needs on Temporal (OQ-4, XT-conformance-157)", "", `${covered} covered, ${needs.length - covered} gaps (of ${needs.length} needs).`, "");
  lines.push("| Group | Need | What Carbon needs | PHP (Oracle) | Temporal | Result |", "| --- | --- | --- | --- | --- | --- |", ...rows, "");
  lines.push(
    "## PHP `$2y$` hashes on Bun (OQ-8, XT-conformance-158)",
    "",
    `Each hash is PHP's \`crypt($pw, '${SALT_PREFIX}')\`. Bun verifies the password's UTF-8 bytes truncated to ${BCRYPT_LIMIT} (passed as bytes, never re-decoded); the untruncated string is the control.`,
    "",
    "| Case | Bytes | PHP password_verify | Bun, truncated to 72 bytes | Bun, untruncated |",
    "| --- | --- | --- | --- | --- |",
  );
  for (const item of cases) {
    const php = oracle.get(item.id);
    const run = live.cases.get(item.id) ?? null;
    lines.push(`| \`${item.id}\` | ${utf8(item.password).length} | ${php === undefined ? "(no fixture)" : String(php[1])} | ${run === null ? "(none)" : String(run.truncated)} | ${run === null ? "(none)" : String(run.untruncated)} |`);
  }
  lines.push("");
  return lines.join("\n");
}

export interface CheckReport {
  violations: string[];
  covered: number;
  gaps: number;
  total: number;
  verified: number;
  cases: number;
  /** The Oracle values the report renders from. */
  oracle: Map<string, OracleValues>;
}

/** Compares the registries with the request file, the fixtures, a live run and REPORT.md. Runs nothing and writes nothing. */
export function checkSpikes(root: string, live: Live, needs: readonly Need[] = NEEDS, cases: readonly BcryptCase[] = CASES): CheckReport {
  const violations: string[] = [];
  const running = runningBunViolation(root, live.bun);
  if (running !== null) {
    violations.push(running);
  }
  const requestsPath = join(root, REQUESTS_FILE);
  if (!existsSync(requestsPath) || readFileSync(requestsPath, "utf8") !== renderRequestsFile(needs, cases)) {
    violations.push(`${REQUESTS_FILE}: differs from the registry; run bun run spikes:requests`);
  }
  const oracle = readOracle(root, needs, cases);
  violations.push(...oracle.violations);
  const report: CheckReport = { violations, covered: 0, gaps: 0, total: needs.length, verified: 0, cases: cases.length, oracle: oracle.values };
  for (const item of needs) {
    const run = live.needs.get(item.id);
    if (run !== undefined && run.values !== null && run.values.length !== item.exprs.length) {
      violations.push(`${item.id}: Temporal returned ${run.values.length} string(s) for ${item.exprs.length} expression(s)`);
    }
    const php = oracle.values.get(item.id);
    if (php !== undefined && run !== undefined && needResult(php, run) === "covered") {
      report.covered++;
    } else {
      report.gaps++;
    }
  }
  for (const item of cases) {
    const bytes = utf8(item.password).length;
    const php = oracle.values.get(item.id);
    if (php !== undefined) {
      const [hash, verified, length] = php;
      if (typeof hash !== "string" || !hash.startsWith(SALT_PREFIX)) {
        violations.push(`${item.id}: the Oracle hash ${JSON.stringify(hash)} does not start with ${SALT_PREFIX}`);
      }
      if (verified !== true) {
        violations.push(`${item.id}: the Oracle's password_verify is ${String(verified)}, not true`);
      }
      if (length !== bytes) {
        violations.push(`${item.id}: the Oracle's strlen is ${String(length)}, not the UTF-8 byte count ${bytes}`);
      }
    }
    const run = live.cases.get(item.id) ?? null;
    if (run === null) {
      continue;
    }
    if (run.truncated) {
      report.verified++;
    } else {
      violations.push(`${item.id}: Bun does not verify the ${BCRYPT_LIMIT}-byte truncation against PHP's hash`);
    }
    if (bytes > BCRYPT_LIMIT && run.untruncated) {
      violations.push(`${item.id}: the untruncated control verifies over ${BCRYPT_LIMIT} bytes (${bytes})`);
    } else if (bytes <= BCRYPT_LIMIT && !run.untruncated) {
      violations.push(`${item.id}: the untruncated control does not verify at ${bytes} bytes`);
    }
  }
  const reportPath = join(root, REPORT_FILE);
  const expected = renderReport(oracle.values, live, live.bun, needs, cases).split("\n");
  const actual = existsSync(reportPath) ? readFileSync(reportPath, "utf8").split("\n") : [];
  for (let i = 0; i < Math.max(expected.length, actual.length); i++) {
    if (expected[i] !== actual[i]) {
      violations.push(`${REPORT_FILE}: drift at line ${i + 1}; run bun run spikes:generate`);
      break;
    }
  }
  return report;
}

// ---------------------------------------------------------------------------
// The CLI

const USAGE = "Usage: bun conformance/spikes/spikes.ts requests [--check] | check | generate [--root <dir>]";
type Command = "requests" | "check" | "generate";

function parseArgs(argv: readonly string[]): { command: Command; root: string; check: boolean } {
  const command = argv[0];
  if (command !== "requests" && command !== "check" && command !== "generate") {
    throw new UsageError(command === undefined ? "Missing subcommand: requests, check or generate" : `Unknown subcommand: ${command}`);
  }
  let root = TOOL_ROOT;
  let check = false;
  const rest = argv.slice(1);
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (arg === "--check" && command === "requests" && !check) {
      check = true;
    } else if (arg === "--root") {
      const value = rest[++i];
      if (value === undefined || value === "" || value.startsWith("--")) {
        throw new UsageError(`${arg} needs a value`);
      }
      root = resolve(value);
    } else {
      throw new UsageError(`Unknown argument: ${arg}`);
    }
  }
  return { command, root, check };
}

export function main(argv: readonly string[]): number {
  const subcommand = argv[0] ?? "check";
  try {
    const { command, root, check } = parseArgs(argv);
    if (command === "requests") {
      const path = join(root, REQUESTS_FILE);
      const text = renderRequestsFile();
      const current = existsSync(path) ? readFileSync(path, "utf8") : null;
      const count = NEEDS.length + CASES.length;
      if (check) {
        if (current !== text) {
          process.stderr.write(`${REQUESTS_FILE}: differs from the registry; run bun run spikes:requests\n`);
          return 1;
        }
        process.stdout.write(`${REQUESTS_FILE}: up to date (${count} requests).\n`);
        return 0;
      }
      if (current !== text) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, text);
      }
      process.stdout.write(`${REQUESTS_FILE}: ${current !== text ? "written" : "up to date"} (${count} requests).\n`);
      return 0;
    }
    const live = runLive(root);
    const report = checkSpikes(root, live);
    if (command === "generate") {
      const blocking = report.violations.filter((violation) => !violation.startsWith(`${REPORT_FILE}: drift`));
      if (blocking.length > 0) {
        process.stderr.write(blocking.map((violation) => `${violation}\n`).join(""));
        process.stderr.write(`SPIKES generate refused: ${blocking.length} violation(s); ${REPORT_FILE} not written.\n`);
        return 1;
      }
      const path = join(root, REPORT_FILE);
      const text = renderReport(report.oracle, live, live.bun);
      const changed = !existsSync(path) || readFileSync(path, "utf8") !== text;
      if (changed) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, text);
      }
      process.stdout.write(`${REPORT_FILE}: ${changed ? "regenerated" : "up to date"} (${report.total} needs, ${report.cases} bcrypt cases).\n`);
      return 0;
    }
    if (report.violations.length > 0) {
      process.stderr.write(report.violations.map((violation) => `${violation}\n`).join(""));
      return 1;
    }
    process.stdout.write(`SPIKES OK: ${report.covered} covered, ${report.gaps} gaps (of ${report.total} needs); ${report.verified}/${report.cases} bcrypt cases verify.\n`);
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return 2;
    }
    process.stderr.write(`SPIKES ${subcommand} failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
