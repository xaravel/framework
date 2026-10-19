// The per-run state of the Mockery run protocol (Stories 4.5 and 4.8).
// Internal: not exported from the package.
//
// A run (`globalThis[Symbol.for('xaravel.mockery.run')](fn)`) holds one slot
// in an AsyncLocalStorage store: the run's Mockery container and the
// auto-verify state of the Double port (`Double.enableAutoVerify()` /
// `Double.verifyAll()`, the static `$autoVerifyEnabled` and `$pending` of
// Double.php). Outside a run the process-level slot is used, the same as
// Mockery's container. Nothing else holds this state.
import { AsyncLocalStorage } from "node:async_hooks";
import type { DoubleState } from "../JMac/Testing/Engine/DoubleState";
import type { Container } from "../Mockery/Container";

/** Double.php's `$autoVerifyEnabled` and `$pending`, per run. */
export interface DoubleRunState {
  enabled: boolean;
  pending: DoubleState[];
}

export interface ContainerSlot {
  container: Container | null;
  double: DoubleRunState;
}

export const storage = new AsyncLocalStorage<ContainerSlot>();
export const processSlot: ContainerSlot = { container: null, double: { enabled: false, pending: [] } };

/** The slot of the current run, else the process-level slot. */
export function currentSlot(): ContainerSlot {
  return storage.getStore() ?? processSlot;
}
