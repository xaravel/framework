// Illuminate\Contracts\Container\Container, from laravel/framework v13.37.0.
import { contract, type ContractToken } from "../Contract";
import { ContainerInterface } from "../psr/Container/ContainerInterface";
import type { ClassString } from "../structural/ClassString";
import type { Closure } from "../structural/Closure";
import type { ContextualBindingBuilder } from "./ContextualBindingBuilder";
import type { PhpArrayLike } from "../structural/PhpArrayLike";
import type { PhpIterable } from "../structural/PhpIterable";
import type { SyncClosure } from "../structural/SyncClosure";

declare const ContainerBrand: unique symbol;

export interface Container extends ContainerInterface {
  readonly [Container.brand]: true;

  /**
   * Finds an entry of the container by its identifier and returns it (Upstream's `{@inheritdoc}`, from `Psr\Container\ContainerInterface`).
   * Upstream's `@template TClass`: a class or contract token resolves to its instance type.
   */
  get<T extends object>(id: ContractToken<T> | (abstract new (...args: never[]) => T)): T;
  get(id: string): unknown;

  /** Determine if the given abstract type has been bound. */
  bound(abstract: ClassString): boolean;

  /** Alias a type to a different name. */
  alias(abstract: ClassString, alias: string): void;

  /** Assign a set of tags to a given binding. */
  tag(abstracts: PhpArrayLike | string, tags: unknown): void;

  /** Resolve all of the bindings for a given tag. */
  tagged(tag: string): PhpIterable;

  /** Register a binding with the container. */
  bind(abstract: Closure | ClassString, concrete?: Closure | ClassString | null, shared?: boolean): void;
  bind(abstract: Closure | ClassString, options?: { concrete?: Closure | ClassString | null; shared?: boolean }): void;

  /** Bind a callback to resolve with Container::call. */
  bindMethod(method: PhpArrayLike | string, callback: Closure): void;

  /** Register a binding if it hasn't already been registered. */
  bindIf(abstract: Closure | ClassString, concrete?: Closure | ClassString | null, shared?: boolean): void;
  bindIf(abstract: Closure | ClassString, options?: { concrete?: Closure | ClassString | null; shared?: boolean }): void;

  /** Register a shared binding in the container. */
  singleton(abstract: Closure | ClassString, concrete?: Closure | ClassString | null): void;

  /** Register a shared binding if it hasn't already been registered. */
  singletonIf(abstract: Closure | ClassString, concrete?: Closure | ClassString | null): void;

  /** Register a scoped binding in the container. */
  scoped(abstract: Closure | ClassString, concrete?: Closure | ClassString | null): void;

  /** Register a scoped binding if it hasn't already been registered. */
  scopedIf(abstract: Closure | ClassString, concrete?: Closure | ClassString | null): void;

  /** "Extend" an abstract type in the container. */
  extend(abstract: Closure | ClassString, closure: Closure): void;

  /**
   * Register an existing instance as shared in the container.
   * Upstream's `@template TInstance`: the instance is returned as given.
   */
  instance<T>(abstract: Closure | ClassString, instance: T): T;
  instance(abstract: Closure | ClassString, instance: unknown): unknown;

  /** Add a contextual binding to the container. */
  addContextualBinding(concrete: ClassString, abstract: Closure | ClassString, implementation: Closure | ClassString): void;

  /** Define a contextual binding. */
  when(concrete: ClassString | PhpArrayLike): ContextualBindingBuilder;

  /**
   * Get a closure to resolve the given type from the container.
   * Upstream's `@template TClass`: a class or contract token gives a closure returning its instance type.
   */
  factory<T extends object>(abstract: ContractToken<T> | (abstract new (...args: never[]) => T)): () => T;
  factory(abstract: ClassString): () => unknown;

  /** Flush the container of all bindings and resolved instances. */
  flush(): void;

  /**
   * Resolve the given type from the container.
   * Upstream's `@template TClass`: a class or contract token resolves to its instance type.
   */
  make<T extends object>(abstract: ContractToken<T> | (abstract new (...args: never[]) => T), parameters?: PhpArrayLike): T;
  make(abstract: ClassString, parameters?: PhpArrayLike): unknown;

  /** Call the given Closure / class@method and inject its dependencies. */
  call(callback: Closure | string, parameters?: PhpArrayLike, defaultMethod?: string | null): unknown;
  call(callback: Closure | string, options?: { parameters?: PhpArrayLike; defaultMethod?: string | null }): unknown;

  /** Determine if the given abstract type has been resolved. */
  resolved(abstract: ClassString): boolean;

  /**
   * Register a new before resolving callback.
   * The callback is sync: resolving callbacks are sync-only (AD-6).
   */
  beforeResolving<F extends (...args: never[]) => unknown>(abstract: Closure | ClassString, callback?: SyncClosure<F> | null): void;

  /**
   * Register a new resolving callback.
   * The callback is sync: resolving callbacks are sync-only (AD-6).
   */
  resolving<F extends (...args: never[]) => unknown>(abstract: Closure | ClassString, callback?: SyncClosure<F> | null): void;

  /**
   * Register a new after resolving callback.
   * The callback is sync: resolving callbacks are sync-only (AD-6).
   */
  afterResolving<F extends (...args: never[]) => unknown>(abstract: Closure | ClassString, callback?: SyncClosure<F> | null): void;
}

export const Container = contract<Container, typeof ContainerBrand>(
  "Illuminate\\Contracts\\Container\\Container",
  {
    addContextualBinding: ["concrete", "abstract", "implementation"],
    afterResolving: ["abstract", "callback"],
    alias: ["abstract", "alias"],
    beforeResolving: ["abstract", "callback"],
    bind: ["abstract", "concrete", "shared"],
    bindIf: ["abstract", "concrete", "shared"],
    bindMethod: ["method", "callback"],
    bound: ["abstract"],
    call: ["callback", "parameters", "defaultMethod"],
    extend: ["abstract", "closure"],
    factory: ["abstract"],
    flush: [],
    get: ["id"],
    instance: ["abstract", "instance"],
    make: ["abstract", "parameters"],
    resolved: ["abstract"],
    resolving: ["abstract", "callback"],
    scoped: ["abstract", "concrete"],
    scopedIf: ["abstract", "concrete"],
    singleton: ["abstract", "concrete"],
    singletonIf: ["abstract", "concrete"],
    tag: ["abstracts", "tags"],
    tagged: ["tag"],
    when: ["concrete"],
  },
  [ContainerInterface],
);
