// Illuminate\Contracts\Cookie\Factory, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { SymfonyCookie } from "../structural/SymfonyCookie";

declare const FactoryBrand: unique symbol;

export interface Factory {
  readonly [Factory.brand]: true;

  /** Create a new cookie instance. */
  make(name: string, value: string, minutes?: number, path?: string | null, domain?: string | null, secure?: boolean | null, httpOnly?: boolean, raw?: boolean, sameSite?: string | null): SymfonyCookie;
  make(name: string, value: string, options?: { minutes?: number; path?: string | null; domain?: string | null; secure?: boolean | null; httpOnly?: boolean; raw?: boolean; sameSite?: string | null }): SymfonyCookie;

  /** Create a cookie that lasts "forever" (400 days). */
  forever(name: string, value: string, path?: string | null, domain?: string | null, secure?: boolean | null, httpOnly?: boolean, raw?: boolean, sameSite?: string | null): SymfonyCookie;
  forever(name: string, value: string, options?: { path?: string | null; domain?: string | null; secure?: boolean | null; httpOnly?: boolean; raw?: boolean; sameSite?: string | null }): SymfonyCookie;

  /** Expire the given cookie. */
  forget(name: string, path?: string | null, domain?: string | null): SymfonyCookie;
  forget(name: string, options?: { path?: string | null; domain?: string | null }): SymfonyCookie;
}

export const Factory = contract<Factory, typeof FactoryBrand>(
  "Illuminate\\Contracts\\Cookie\\Factory",
  {
    forever: ["name", "value", "path", "domain", "secure", "httpOnly", "raw", "sameSite"],
    forget: ["name", "path", "domain"],
    make: ["name", "value", "minutes", "path", "domain", "secure", "httpOnly", "raw", "sameSite"],
  },
);
