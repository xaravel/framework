// PHP's `ReflectionEnum` (ESC-13.1-8) over an AD-26 enum: a registered class whose static side has a `cases` function.
// It is backed when it declares `static backingType`, `'string'` or `'int'`; its backing type is that builtin's
// `ReflectionNamedType`.
import { fqcn, registerClass } from "../registry/registry";
import { isEnumClass } from "./classExistence";
import { ReflectionClass } from "./ReflectionClass";
import { ReflectionException } from "./ReflectionException";
import { ReflectionNamedType } from "./ReflectionNamedType";
import { phpTypeName } from "./phpType";
import { TypeError as PhpTypeError } from "./TypeError";
import { type ReflectionTarget, reflectionTarget } from "./reflectionTargets";

/** The enum `objectOrClass` names; throws `ReflectionException` `Class "<FQCN>" is not an enum` for any other class. */
function enumTarget(objectOrClass: unknown): ReflectionTarget {
  const target = reflectionTarget(objectOrClass, "ReflectionEnum::__construct(): Argument #1 ($objectOrClass)");
  if (!isEnumClass(target)) {
    throw new ReflectionException(`Class "${fqcn(target)}" is not an enum`);
  }
  return target;
}

export class ReflectionEnum extends ReflectionClass {
  readonly #enum: ReflectionTarget;

  /**
   * Reflects the enum `objectOrClass`: an enum class, one of its cases, or a registered enum's FQCN. Throws
   * `ReflectionException` `Class "<name>" does not exist` for a name nothing holds, and `Class "<FQCN>" is not an enum`
   * for a class, or a contract token, that is not an enum.
   */
  constructor(objectOrClass: object | string) {
    const target = enumTarget(objectOrClass);
    super(target);
    this.#enum = target;
  }

  /** PHP's `isBacked()`: whether the enum declares `static backingType`. */
  isBacked(): boolean {
    return this.#backingType() !== null;
  }

  /** PHP's `getBackingType()`: the builtin `string` or `int` type of a backed enum, else null. */
  getBackingType(): ReflectionNamedType | null {
    const type = this.#backingType();
    return type === null ? null : new ReflectionNamedType(type, true);
  }

  /** The declared `static backingType`, null when absent; throws `TypeError` for a value other than `'string'` / `'int'`. */
  #backingType(): "string" | "int" | null {
    const declared: unknown = (this.#enum as { backingType?: unknown }).backingType;
    if (declared === undefined || declared === null) {
      return null;
    }
    if (declared === "string" || declared === "int") {
      return declared;
    }
    throw new PhpTypeError(`${this.name}::backingType must be 'string' or 'int' (AD-26), ${typeof declared === "string" ? `'${declared}'` : phpTypeName(declared)} given`);
  }
}

registerClass("ReflectionEnum", ReflectionEnum);
