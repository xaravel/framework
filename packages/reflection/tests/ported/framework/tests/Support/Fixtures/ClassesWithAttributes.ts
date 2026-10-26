// Ported from framework/tests/Support/Fixtures/ClassesWithAttributes.php (Laravel v13.37.0), Story 13.1.
//
// Each PHP attribute `#[X(args)]` is `@attribute(X, ...args)`, in source order (DIV-12.15); `#[Attribute(flags)]` on an
// attribute class is `@attribute(Attribute, flags)`. The classes are registered under
// `Illuminate\Tests\Support\Fixtures\<Name>` by the test case's `setUp` (`registerTestClass` needs a test frame).
import { Attribute, attribute } from "@xaravel/runtime/php";

@attribute(Attribute, Attribute.TARGET_CLASS | Attribute.IS_REPEATABLE) // adapted:DIV-12.15
export class UnusedAttr {}

@attribute(Attribute, Attribute.TARGET_CLASS | Attribute.IS_REPEATABLE) // adapted:DIV-12.15
export class ParentOnlyAttr {}

@attribute(Attribute, Attribute.TARGET_CLASS | Attribute.IS_REPEATABLE) // adapted:DIV-12.15
export class StrAttr {
  constructor(public string: string) {}
}

@attribute(Attribute, Attribute.TARGET_CLASS | Attribute.IS_REPEATABLE) // adapted:DIV-12.15
export class NumAttr {
  constructor(public number: number) {}
}

@attribute(StrAttr, "lazy") // adapted:DIV-12.15
@attribute(StrAttr, "dog") // adapted:DIV-12.15
@attribute(NumAttr, 2) // adapted:DIV-12.15
@attribute(NumAttr, 3) // adapted:DIV-12.15
@attribute(ParentOnlyAttr) // adapted:DIV-12.15
export class ParentClass {}

@attribute(StrAttr, "quick") // adapted:DIV-12.15
@attribute(StrAttr, "brown") // adapted:DIV-12.15
@attribute(StrAttr, "fox") // adapted:DIV-12.15
@attribute(NumAttr, 7) // adapted:DIV-12.15
export class ChildClass extends ParentClass {}

/** The fixtures, by their Upstream FQCN, for `registerTestClass` in a test case's `setUp`. */
export const FIXTURES: readonly (readonly [string, abstract new (...args: never[]) => unknown])[] = [
  ["Illuminate\\Tests\\Support\\Fixtures\\UnusedAttr", UnusedAttr],
  ["Illuminate\\Tests\\Support\\Fixtures\\ParentOnlyAttr", ParentOnlyAttr],
  ["Illuminate\\Tests\\Support\\Fixtures\\StrAttr", StrAttr],
  ["Illuminate\\Tests\\Support\\Fixtures\\NumAttr", NumAttr],
  ["Illuminate\\Tests\\Support\\Fixtures\\ParentClass", ParentClass],
  ["Illuminate\\Tests\\Support\\Fixtures\\ChildClass", ChildClass],
];
