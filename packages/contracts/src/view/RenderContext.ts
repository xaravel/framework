// The compiled-view ABI, a Xaravel-only seam (AD-11, AD-27). A compiled view module exports
// `render(ctx: RenderContext): Promise<string>` and `fragments: Record<string, (ctx: RenderContext) => Promise<string>>`.
// `RenderContext` carries the data, the factory, the per-render state Upstream's View `Factory` keeps in instance
// properties (sections, stacks, `@once`, components, loops, fragments), and the fragment capture set. Per-render state
// lives in the context, never in the factory (AD-5).
//
// `BladeHelper` names the emitted-code helpers a `Blade.directive`, `Blade.if` or `Blade.stringable` handler's source
// may call: the `$__env-><method>` calls Upstream's compilers emit (`Illuminate/View/Compilers/**` at the Pin), and the
// default echo format's function, `e` (`BladeCompiler::DEFAULT_ECHO_FORMAT`).
import type { Factory } from "./Factory";

/** One entry of the loop stack, as Upstream's `ManagesLoops::addLoop` builds it and `incrementLoopIndices` updates it. */
export interface RenderLoop {
  iteration: number;
  index: number;
  /** Null when the iterable is not countable. */
  remaining: number | null;
  /** Null when the iterable is not countable. */
  count: number | null;
  first: boolean;
  /** Null when the iterable is not countable. */
  last: boolean | null;
  odd: boolean;
  even: boolean;
  depth: number;
  parent: RenderLoop | null;
}

/** The context a compiled view renders with: its data, the factory and the per-render state (AD-11). */
export interface RenderContext {
  /** The view's data, keyed by the names without `$`. */
  readonly data: Readonly<Record<string, unknown>>;
  /** The view factory (`$__env`). */
  readonly factory: Factory;
  /** `ManagesLayouts::$sections`: the finished section contents, by name. */
  sections: Record<string, string>;
  /** `ManagesLayouts::$sectionStack`: the names of the sections being rendered. */
  sectionStack: string[];
  /** `ManagesStacks::$pushes`: the pushed contents, by stack name and then render key. */
  pushes: Record<string, Record<string, string>>;
  /** `ManagesStacks::$prepends`: the prepended contents, by stack name and then render key. */
  prepends: Record<string, Record<string, string>>;
  /** `ManagesStacks::$pushStack`: the names of the stacks being pushed to. */
  pushStack: string[];
  /** `Factory::$renderedOnce`: the `@once` ids already rendered. */
  renderedOnce: Set<string>;
  /** `ManagesComponents::$componentStack`: the components being rendered. */
  componentStack: unknown[];
  /** `ManagesComponents::$componentData`: each component's original data, by stack depth. */
  componentData: Record<number, Record<string, unknown>>;
  /** `ManagesComponents::$currentComponentData`: each component's current data, by stack depth. */
  currentComponentData: Record<number, Record<string, unknown>>;
  /** `ManagesComponents::$slots`: each component's slot contents, by stack depth. */
  slots: Record<number, Record<string, unknown>>;
  /** `ManagesComponents::$slotStack`: the slot names being rendered, by stack depth. */
  slotStack: Record<number, unknown[]>;
  /** `ManagesLoops::$loopsStack`: the loops being rendered. */
  loopsStack: RenderLoop[];
  /** `ManagesFragments::$fragments`: the finished fragment contents, by name. */
  fragments: Record<string, string>;
  /** `ManagesFragments::$fragmentStack`: the names of the fragments being rendered. */
  fragmentStack: string[];
  /** The fragment names a `fragment()` render captures, or null when the render captures none (AD-11). */
  fragmentCapture: Set<string> | null;
}

/** Every `$__env-><method>` name Upstream's Blade compilers emit at the Pin. */
export type BladeEnvMethod =
  | "addLoop"
  | "appendSection"
  | "endSlot"
  | "exists"
  | "first"
  | "getConsumableComponentData"
  | "getContainer"
  | "getLastLoop"
  | "hasRenderedOnce"
  | "incrementLoopIndices"
  | "isStackEmpty"
  | "make"
  | "markAsRenderedOnce"
  | "popLoop"
  | "renderComponent"
  | "renderEach"
  | "renderTranslation"
  | "renderUnless"
  | "renderWhen"
  | "slot"
  | "startComponent"
  | "startComponentFirst"
  | "startFragment"
  | "startPrepend"
  | "startPush"
  | "startSection"
  | "startTranslation"
  | "stopFragment"
  | "stopPrepend"
  | "stopPush"
  | "stopSection"
  | "yieldContent"
  | "yieldPushContent"
  | "yieldSection";

/** The default echo format's function: `BladeCompiler::DEFAULT_ECHO_FORMAT` is `e(%s)`. */
export type BladeFunction = "e";

/** A helper emitted code may call: a factory method or the echo function. */
export type BladeHelper = BladeEnvMethod | BladeFunction;
