// PHPUnit 13.4.3's `PHPUnit\Framework\MockObject\Rule\ParametersRule` (Story 4.7).
import type { Invocation } from "../Invocation";

export interface ParametersRule {
  apply(invocation: Invocation): void;
  verify(): void;
}
