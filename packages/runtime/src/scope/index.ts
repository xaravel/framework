// Installs the Symbol.metadata polyfill before anything else loads (AD-4).
import "../metadata/polyfill";
// Publishes PHP's built-in classes on `Symbol.for('xaravel.php.classes')` (Story 9.10).
import "../php/phpClasses";
// Publishes the class and interface name lookup on `Symbol.for('xaravel.class.lookup')` (ESC-13.1-9).
import "../php/classLookup";
export { interleave } from "./interleave";
export { bindToFrame, frameAsyncGenerator, frameStreamSource } from "./propagate";
export {
  CSP_NONCE_SLOT,
  currentApplication,
  currentFrame,
  type Frame,
  type FrameOverlay,
  type FrameSlot,
  type FrameSlotKey,
  frameDefer,
  frameKinds,
  frameOverlay,
  frameSlot,
  frameStatic,
  REQUEST_SLOT,
  ROUTE_SLOT,
  runInFrame,
  runInNarrowFrame,
  runInRootFrame,
  setDefaultApplication,
} from "./scope";
export { ScopeFrameException } from "./ScopeFrameException";
