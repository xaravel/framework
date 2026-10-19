// `JMac\Testing\Engine\MethodExpectation` (jasonmccreary/double v1.0.1): one configured `expects()`/`allows()`
// entry, in the subset the ai, mcp and boost suites use: `with`, `returns`, `throws`, `resolves`, `times`, `never`
// (`ordered()` has no Upstream use, ESC-4.8-1 item 4). Exported as a type.
//
// A literal passed to `with()` is wrapped in EqualsMatcher. `returns`, `throws` and `resolves` replace each other:
// the last one wins. A sequence holds at its last value. `resolves(fn)` calls `fn` with the call's arguments.
// PHP's named `times(minimum: 1)` / `times(maximum: 3)` is `times({ minimum: 1 })` / `times({ maximum: 3 })`.
import { InvalidArgumentException } from "../../../php/InvalidArgumentException";
import { FQCN, isPhpArray, varExport } from "../../../support/values";
import { Pluralizer } from "../Diagnostics/Pluralizer";
import { StringDiffer } from "../Diagnostics/StringDiffer";
import { ValueFormatter } from "../Diagnostics/ValueFormatter";
import { EqualsMatcher } from "../Matching/EqualsMatcher";
import { Matcher } from "../Matching/Matcher";

/** PHP_INT_MAX: an unbounded call limit. */
const UNBOUNDED = Number.POSITIVE_INFINITY;

/** One positional comparison of `compareArguments`. */
export interface PositionalComparison {
  readonly index: number;
  readonly differs: boolean;
  readonly text: string;
}

/** `compareArguments`' result: an arity text, or positional comparisons. */
export type ArgumentsComparison = { readonly kind: "arity"; readonly text: string } | { readonly kind: "comparisons"; readonly comparisons: readonly PositionalComparison[] };

/** PHP's named arguments of `times()`. */
export interface TimesOptions {
  readonly count?: number | null;
  readonly minimum?: number | null;
  readonly maximum?: number | null;
}

function describeArgumentDiff(matcher: Matcher, actual: unknown): string {
  if (matcher instanceof EqualsMatcher) {
    const expected = matcher.expected();
    if (typeof expected === "string" && typeof actual === "string" && Buffer.byteLength(expected, "utf8") + Buffer.byteLength(actual, "utf8") >= StringDiffer.MIN_LENGTH_TO_DIFF) {
      return StringDiffer.diff(expected, actual);
    }
    if (isPhpArray(expected) && isPhpArray(actual) && ValueFormatter.describe(expected) === ValueFormatter.describe(actual)) {
      return `- ${varExport(expected)}\n+ ${varExport(actual)}`;
    }
  }
  return `- ${matcher.describe()}\n+ ${ValueFormatter.describe(actual)}`;
}

export class MethodExpectation {
  static readonly [FQCN]: string = "JMac\\Testing\\Engine\\MethodExpectation";

  readonly #method: string;
  readonly #required: boolean;
  #argumentConstraints: Matcher[] | null = null;
  #returnValues: unknown[] = [];
  #hasReturnConfigured = false;
  #throwables: unknown[] = [];
  #resolver: ((...args: any[]) => unknown) | null = null;
  #minimumCalls: number;
  #maximumCalls: number;
  #timesMatched = 0;

  constructor(method: string, required: boolean) {
    this.#method = method;
    this.#required = required;
    this.#minimumCalls = required ? 1 : 0;
    this.#maximumCalls = required ? 1 : UNBOUNDED;
  }

  method(): string {
    return this.#method;
  }

  /** True for `expects()`, false for `allows()`. */
  isRequired(): boolean {
    return this.#required;
  }

  /** The expected arguments: a Matcher, or a literal compared by EqualsMatcher. */
  with(...args: unknown[]): this {
    this.#argumentConstraints = args.map((argument) => (argument instanceof Matcher ? argument : new EqualsMatcher(argument)));
    return this;
  }

  /** The value of each call in turn, holding at the last. */
  returns(...values: unknown[]): this {
    if (values.length === 0) {
      throw new InvalidArgumentException("`returns()` requires at least one value.");
    }
    this.#returnValues = values;
    this.#hasReturnConfigured = true;
    this.#throwables = [];
    this.#resolver = null;
    return this;
  }

  /** The exception each call throws in turn, holding at the last (the same instance every time). */
  throws(...exceptions: unknown[]): this {
    if (exceptions.length === 0) {
      throw new InvalidArgumentException("`throws()` requires at least one exception.");
    }
    this.#throwables = exceptions;
    this.#hasReturnConfigured = true;
    this.#returnValues = [];
    this.#resolver = null;
    return this;
  }

  /** Each call returns `resolver(...args)`. */
  resolves(resolver: (...args: any[]) => unknown): this {
    this.#resolver = resolver;
    this.#hasReturnConfigured = true;
    this.#returnValues = [];
    this.#throwables = [];
    return this;
  }

  /** An exact count, `times(min, max)` a range, or `times({ minimum, maximum })` PHP's named bounds. */
  times(count: number | TimesOptions | null = null, maximum: number | null = null, minimum: number | null = null): this {
    let exact: number | null;
    if (typeof count === "object" && count !== null) {
      exact = count.count ?? null;
      maximum = count.maximum ?? maximum;
      minimum = count.minimum ?? minimum;
    } else {
      exact = count;
    }
    if (exact !== null && minimum !== null) {
      throw new InvalidArgumentException("`times()` can't take both a positional count and a named minimum — use one or the other.");
    }
    let resolvedMinimum = minimum ?? exact;
    let resolvedMaximum = maximum ?? exact;
    if (resolvedMinimum === null && resolvedMaximum === null) {
      throw new InvalidArgumentException("`times()` requires a count, a minimum, or a maximum.");
    }
    resolvedMinimum ??= 0;
    resolvedMaximum ??= UNBOUNDED;
    if (resolvedMinimum > resolvedMaximum) {
      throw new InvalidArgumentException(`\`times()\`: minimum (${String(resolvedMinimum)}) can't be greater than maximum (${String(resolvedMaximum)}).`);
    }
    this.#minimumCalls = resolvedMinimum;
    this.#maximumCalls = resolvedMaximum;
    return this;
  }

  never(): this {
    return this.times(0);
  }

  matchesArguments(args: readonly unknown[]): boolean {
    const constraints = this.#argumentConstraints;
    if (constraints === null) {
      return true;
    }
    if (constraints.length !== args.length) {
      return false;
    }
    return constraints.every((matcher, index) => matcher.matches(args[index]));
  }

  /** The positional comparison of `args` against the constraints, or null when there is none or they match. */
  compareArguments(args: readonly unknown[]): ArgumentsComparison | null {
    const constraints = this.#argumentConstraints;
    if (constraints === null) {
      return null;
    }
    if (constraints.length !== args.length) {
      return {
        kind: "arity",
        text: `expected ${Pluralizer.pluralize(constraints.length, "argument", "arguments")}, got ${Pluralizer.pluralize(args.length, "argument", "arguments")}`,
      };
    }
    const comparisons: PositionalComparison[] = [];
    let anyDiffers = false;
    constraints.forEach((matcher, index) => {
      const actual = args[index];
      if (matcher.matches(actual)) {
        comparisons.push({ index, differs: false, text: ValueFormatter.describe(actual) });
        return;
      }
      anyDiffers = true;
      comparisons.push({ index, differs: true, text: describeArgumentDiff(matcher, actual) });
    });
    return anyDiffers ? { kind: "comparisons", comparisons } : null;
  }

  recordMatch(): void {
    this.#timesMatched++;
  }

  timesMatched(): number {
    return this.#timesMatched;
  }

  minimumCalls(): number {
    return this.#minimumCalls;
  }

  maximumCalls(): number {
    return this.#maximumCalls;
  }

  hasFiniteCallLimit(): boolean {
    return this.#maximumCalls !== UNBOUNDED;
  }

  isSatisfied(): boolean {
    return this.#timesMatched >= this.#minimumCalls;
  }

  exceedsMaximum(): boolean {
    return this.#timesMatched > this.#maximumCalls;
  }

  hasReturnConfigured(): boolean {
    return this.#hasReturnConfigured;
  }

  resolveReturn(args: readonly unknown[]): unknown {
    if (this.#throwables.length > 0) {
      throw this.#throwables[Math.min(this.#timesMatched - 1, this.#throwables.length - 1)];
    }
    if (this.#resolver !== null) {
      // AD-9: a resolver that returns nothing gives null.
      return this.#resolver(...args) ?? null;
    }
    return this.#returnValues[Math.min(this.#timesMatched - 1, this.#returnValues.length - 1)];
  }

  describe(): string {
    return `expected \`${this.#method}(${this.describeArguments()})\` to ${this.#describeExpectedBound()}, but it was ${this.#describeActualCount()}`;
  }

  /** The "(...)" part only: `any arguments`, or each matcher's description. */
  describeArguments(): string {
    return this.#argumentConstraints === null ? "any arguments" : this.#argumentConstraints.map((matcher) => matcher.describe()).join(", ");
  }

  /** Whether a constraint narrows an argument (every port matcher does; `Argument.any()` is not ported). */
  isSpecific(): boolean {
    return this.#argumentConstraints !== null && this.#argumentConstraints.length > 0;
  }

  #describeExpectedBound(): string {
    const minimum = this.#minimumCalls;
    const maximum = this.#maximumCalls;
    if (minimum === 0 && maximum === 0) {
      return "never be called";
    }
    if (minimum === maximum) {
      return `be called exactly ${Pluralizer.pluralize(minimum, "time", "times")}`;
    }
    if (minimum === 0 && maximum !== UNBOUNDED) {
      return `be called at most ${Pluralizer.pluralize(maximum, "time", "times")}`;
    }
    if (maximum === UNBOUNDED) {
      return `be called at least ${Pluralizer.pluralize(minimum, "time", "times")}`;
    }
    return `be called between ${String(minimum)} and ${String(maximum)} times`;
  }

  #describeActualCount(): string {
    return this.#timesMatched === 0 ? "never called" : `called ${Pluralizer.pluralize(this.#timesMatched, "time", "times")}`;
  }
}
