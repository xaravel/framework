// Thrown for a Scope Frame write with no active frame (AD-5, DIV-11), and on load when
// `Symbol.for('xaravel.scope.run')` is already owned by other code or another copy of the runtime (scope.ts). Story 9.10 re-parents it on PHP's
// `RuntimeException`, keeping the FQCN (ESC-9.1-2).
import { registerClass } from "../registry/registry";

export class ScopeFrameException extends Error {
  override name = "ScopeFrameException";
}

registerClass("Xaravel\\Runtime\\Scope\\ScopeFrameException", ScopeFrameException);
