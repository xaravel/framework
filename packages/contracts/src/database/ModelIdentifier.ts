// Illuminate\Contracts\Database\ModelIdentifier, from laravel/framework v13.37.0.
// Upstream's `protected static bool $useMorphMap`, set by `useMorphMap()`, is an Upstream static setter, so it is held
// per unit frame with `frameStatic` (AD-5), never in a module variable. The morph map is read as PHP autoloads it:
// `Illuminate\Database\Eloquent\Relations\Relation` is looked up in the Class Registry when it is used, and its static
// `getMorphAlias` / `getMorphedModel` called; an unregistered Relation throws the Registry's `Class "…" not found`, as
// PHP fails. Upstream's `$class` constructor parameter is `className`, `class` being a reserved word; the public
// property keeps the name `class`.
import { registerClass, resolveClass } from "@xaravel/runtime/registry";
import { type FrameSlot, frameStatic } from "@xaravel/runtime/scope";
import type { PhpArrayLike } from "../structural/PhpArrayLike";

/** The FQCN of the Eloquent `Relation` class, whose static morph map the identifier reads. */
const RELATION = "Illuminate\\Database\\Eloquent\\Relations\\Relation";

/** The static side of Eloquent's `Relation` that the identifier calls. */
interface MorphMap {
  getMorphAlias(className: string): string;
  getMorphedModel(alias: string | null): string | null;
}

/** The registered `Relation` class, resolved when it is used (PHP autoloading). */
function relation(): MorphMap {
  return resolveClass(RELATION) as unknown as MorphMap;
}

/** A serialized reference to an Eloquent model, or to a collection of them. */
export class ModelIdentifier {
  /** The class name of the model. */
  public class: string | null;

  /** The unique identifier of the model: a single ID or an array of IDs. */
  public id: unknown;

  /** The relationships loaded on the model. */
  public relations: PhpArrayLike;

  /** The connection name of the model. */
  public connection: unknown;

  /** The class name of the model collection. */
  public collectionClass: string | null = null;

  /** Create a new model identifier. */
  constructor(className: string | null, id: unknown, relations: PhpArrayLike, connection: unknown) {
    this.class = className !== null && useMorphMapFlag().get() ? relation().getMorphAlias(className) : className;
    this.id = id;
    this.relations = relations;
    this.connection = connection;
  }

  /** Specify the collection class that should be used when serializing / restoring collections. */
  useCollectionClass(collectionClass: string | null): this {
    this.collectionClass = collectionClass;

    return this;
  }

  /** Get the fully-qualified class name of the Model. */
  getClass(): string | null {
    if (useMorphMapFlag().get() && this.class !== null) {
      return relation().getMorphedModel(this.class) ?? this.class;
    }

    return this.class;
  }

  /** Indicate whether to use the relational morph-map when serializing Models. */
  static useMorphMap(useMorphMap = true): void {
    useMorphMapFlag().set(useMorphMap);
  }
}

/** Upstream's `ModelIdentifier::$useMorphMap`, false until set, held per unit frame (AD-5). */
function useMorphMapFlag(): FrameSlot<boolean> {
  return frameStatic(ModelIdentifier, "useMorphMap", () => false);
}

registerClass("Illuminate\\Contracts\\Database\\ModelIdentifier", ModelIdentifier);
