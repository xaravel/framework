// PHP's `json_last_error()` / `json_last_error_msg()` (Story 9.8, decisions/ESC-9.8-1.md part 2): the `JSON_ERROR_*`
// code of the last `jsonEncode` / `jsonDecode` call, held in a Scope Frame slot (AD-5), never in a module variable.
//
// - Inside an active frame, each call records its code, `JSON_ERROR_NONE` included, as PHP sets `JSON_G(error_code)`.
//   A call under `JSON_THROW_ON_ERROR` without `JSON_PARTIAL_OUTPUT_ON_ERROR` leaves the record untouched, as PHP 8.5
//   does.
// - Outside a frame (or in a narrow frame no unit encloses, which no write can reach) a call does not record, since a
//   slot write there throws `ScopeFrameException`.
// - The reads give the record seen from the active frame; outside a frame, or before any call in it, `0` / `No error`.
//
// The codec reaches the slot through `installJsonErrorRecorder` (`jsonConstants.ts`), installed when this module
// loads: `jsonEncode.ts` must not import the Scope Frame module (its load-safety rule).
import { currentFrame, frameSlot } from "../scope/scope";
import { ScopeFrameException } from "../scope/ScopeFrameException";
import { installJsonErrorRecorder, JSON_ERROR_MESSAGES, JSON_ERROR_NONE } from "./jsonConstants";

const LAST_ERROR = frameSlot<number>(Symbol.for("xaravel.php.json-last-error"), () => JSON_ERROR_NONE);

/** PHP's `json_last_error()`: the `JSON_ERROR_*` code of the last JSON call recorded in the active frame, else 0. */
export function jsonLastError(): number {
  return LAST_ERROR.get();
}

/** PHP's `json_last_error_msg()`: the message of `jsonLastError()`'s code (`No error` for 0). */
export function jsonLastErrorMsg(): string {
  return JSON_ERROR_MESSAGES[LAST_ERROR.get()] ?? "Unknown error";
}

installJsonErrorRecorder((code: number): void => {
  if (currentFrame() === null) {
    return;
  }
  try {
    LAST_ERROR.set(code);
  } catch (error) {
    // A narrow frame with no enclosing unit takes no write: as outside a frame, nothing is recorded.
    if (!(error instanceof ScopeFrameException)) {
      throw error;
    }
  }
});
