// Story 6.5 fixture: a contract (AD-1), registered by its runtime token, not registerClass.

/** Stands in for `@xaravel/runtime`'s `contract<T>()` (never run). */
declare function contract<T>(fqcn: string): symbol & { readonly type?: T };

/** Upstream interface `Demo\Contracts\Store`: matched through the token below. */
export interface Store {
  get(key: string): unknown;
}

export const Store = contract<Store>("Demo\\Contracts\\Store");
