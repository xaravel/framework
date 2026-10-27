// Bounded PHP locale support (ESC-14.5-1): only proven byte-order locales, scoped to the current unit.
import { frameSlot } from "../scope/scope";
import { arrayEntries } from "./casts";
import { intParameter, stringParameter } from "./phpArguments";
import { phpType } from "./phpType";

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
  const cat = intParameter("setlocale", 1, "category", category);
  if (cat !== LC_ALL && cat !== 0 && cat !== 1 && cat !== 2 && cat !== 3 && cat !== 4 && cat !== 5) {
    return false;
  }
  const candidates = typeof locales === "object" && locales !== null && phpType(locales) === "array"
    ? arrayEntries(locales).map(([, value]) => value) : [locales, ...rest];
  for (const value of candidates) {
    if (value === null || value === "0") return query(Number(cat));
    const locale = stringParameter("setlocale", 2, "locales", value).split("\0", 1)[0]!;
    if (locale === "0") return query(Number(cat));
    if (locale === "C" || locale === "POSIX") {
      localeSlot.set(localeSlot.get().map((previous, index) => cat === LC_ALL || index === Number(cat) ? "C" : previous));
      return query(Number(cat));
    }
  }
  return false;
}
