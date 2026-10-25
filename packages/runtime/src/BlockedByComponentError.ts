// Thrown by a Ported Test whose Upstream test needs a Component from a later Phase, from its case's `setUp` (before
// any exception expectation is set), under a `skip` / `blocked-by:<c>` Expectations line, as ESC-12.1-2's route does.
// Thrown from a body after `expectException(...)`, `portedTest`'s expectation check turns it into an assertion
// failure, and the blocked-by form is lost. Story 17.2 raises it from framework code, for a service whose Component
// isn't installed (ESC-12.1-2). The form is the one decisions/ESC-5.3-1.md fixes and
// decisions/ESC-12.1-2.md has the runtime define now: `name` is `BlockedByComponentError` (bun's junit `type` is the
// thrown error's `name`), and the message starts `BlockedByComponentError(<c>)`, `<c>` being the owning Component's
// name from the component map (lowercase kebab), so it matches the harness's `blockedComponent` pattern.
//
// A JS `Error`, never a PHP `Exception` or `Error`: a test that expects a PHP throwable must not pass by catching it.
import { registerClass } from "./registry/registry";

const COMPONENT = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export class BlockedByComponentError extends globalThis.Error {
  readonly component: string;

  constructor(component: string, detail: string | null = null) {
    if (typeof component !== "string" || !COMPONENT.test(component)) {
      throw new TypeError("BlockedByComponentError(): the component must be a Component name in lowercase kebab case");
    }
    if (detail !== null && typeof detail !== "string") {
      throw new TypeError("BlockedByComponentError(): the detail must be a string or null");
    }
    super(detail === null ? `BlockedByComponentError(${component})` : `BlockedByComponentError(${component}): ${detail}`);
    this.component = component;
    Object.defineProperty(this, "name", { value: "BlockedByComponentError", writable: true, enumerable: false, configurable: true });
  }
}

registerClass("Xaravel\\Runtime\\BlockedByComponentError", BlockedByComponentError);
