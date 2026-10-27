// Bounded PHP locale support (ESC-14.5-1): only proven byte-order locales, scoped to the current unit.
import { frameSlot } from "../scope/scope";
import { arrayEntries, toPhpString } from "./casts";
import { argumentTypeError, intParameter } from "./phpArguments";
import { phpType } from "./phpType";
import { toStringArgument } from "./throwableArguments";

/** PHP's LC_ALL category on the Oracle host. */
export const LC_ALL = 6;
// Oracle Linux category values; these intentionally do not depend on the host libc's numbering.
export const LC_CTYPE = 0;
export const LC_NUMERIC = 1;
export const LC_TIME = 2;
export const LC_COLLATE = 3;
export const LC_MONETARY = 4;
export const LC_MESSAGES = 5;
const categories = ["LC_CTYPE", "LC_NUMERIC", "LC_TIME", "LC_COLLATE", "LC_MONETARY", "LC_MESSAGES"] as const;
const localeSlot = frameSlot<string[]>("xaravel.php.locale", () => categories.map(() => "C"));
function query(category: number): string {
  const state = localeSlot.get();
  if (category !== LC_ALL) return state[category]!;
  return state.every((value) => value === state[0]) ? state[0]! : categories.map((name, index) => `${name}=${state[index]!}`).join(";");
}

/** The effective locale read by `strcoll` and locale sorting. Internal. */
export function currentLocale(): string { return query(LC_COLLATE); }

/** PHP's `setlocale`: query or select the first supported locale. C/POSIX use identical collation. */
export function setlocale(category: unknown, locales: unknown, ...rest: unknown[]): string | false {
  const cat = Number(intParameter("setlocale", 1, "category", category));
  if (cat !== LC_ALL && cat !== 0 && cat !== 1 && cat !== 2 && cat !== 3 && cat !== 4 && cat !== 5) {
    return false;
  }
  for (const [index, argument] of [locales, ...rest].entries()) {
    const arrayCandidates = typeof argument === "object" && argument !== null && phpType(argument) === "array";
    const candidates = arrayCandidates ? arrayEntries(argument as object).map(([, value]) => value) : [argument];
    for (const value of candidates) {
      if ((!arrayCandidates && value === null) || value === "0") return query(cat);
      const converted = arrayCandidates ? toPhpString(value) : toStringArgument(value);
      if (converted === null) {
        const error = argumentTypeError("setlocale", index + 2, "locales", "array|string|null", value);
        if (index > 0) error.message = error.message.replace(" ($locales)", "");
        throw error;
      }
      const locale = converted.split("\0", 1)[0]!;
      if (locale === "0") return query(cat);
      if (locale === "C" || locale === "POSIX") {
        localeSlot.set(localeSlot.get().map((previous, categoryIndex) => cat === LC_ALL || categoryIndex === cat ? "C" : previous));
        return query(cat);
      }
    }
  }
  return false;
}
