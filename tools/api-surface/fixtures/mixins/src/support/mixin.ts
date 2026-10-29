// ESC-14.8-1 fixture: stands in for `@xaravel/runtime`'s `mixin` and its `Mixed` type (the same shape; never run).

type AnyClass = abstract new (...args: any) => any;
type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never;
type StaticSide<C> = C extends unknown ? Omit<C, "prototype"> : never;
type TraitInstances<Ts extends readonly AnyClass[]> = Ts extends readonly [] ? object : UnionToIntersection<InstanceType<Ts[number]>>;
type TraitStatics<Ts extends readonly AnyClass[]> = Ts extends readonly [] ? unknown : UnionToIntersection<StaticSide<Ts[number]>>;

/** The class `mixin(Base, ...Traits)` returns: Base's constructor, with Base's and the traits' members. */
export type Mixed<B extends AnyClass | null, Ts extends readonly AnyClass[]> = (new (
  ...args: B extends AnyClass ? ConstructorParameters<B> : []
) => (B extends AnyClass ? InstanceType<B> : object) & TraitInstances<Ts>) &
  (B extends AnyClass ? StaticSide<B> : unknown) &
  TraitStatics<Ts>;

/** `class X extends mixin(Base, A, B)` for PHP's `class X extends Base { use A, B; }`. */
export declare function mixin<B extends AnyClass | null, const Ts extends readonly AnyClass[]>(base: B, ...traits: Ts): Mixed<B, Ts>;

/** Stands in for `@xaravel/runtime/registry`'s `registerClass` (never run). */
export declare function registerClass(fqcn: string, value: object): void;
