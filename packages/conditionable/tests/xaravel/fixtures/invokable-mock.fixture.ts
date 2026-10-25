// Fixture for XT-conditionable-4 (Epic 12 retro item 1): a Mockery double of an invokable class passed to `when` /
// `unless` as the callback or default. It runs in its own process because Mockery numbers generated classes with a
// process-wide counter (`Mockery_<n>_…`), and a mock made inside the shared `bun test` process would shift the names
// other packages' Xaravel Tests expect. Not collected by `bun test` (not a `.test.ts`); conditionable.test.ts runs it:
//
//   bun --no-env-file packages/conditionable/tests/xaravel/fixtures/invokable-mock.fixture.ts
//
// It prints one JSON line: what each call returned (`"logger"` for the instance), and the error `Mockery.close()`
// threw when verifying the `once()` expectations, or null.
import { Conditionable } from "@xaravel/conditionable";
import { Mockery } from "@xaravel/mockery";
import { mixin, registerClass } from "@xaravel/runtime";

class FixtureLogger extends mixin(null, Conditionable) {}

registerClass("Xaravel\\Tests\\Conditionable\\Fixtures\\FixtureLogger", FixtureLogger);

class FixtureInvokable {
  __invoke(_self: FixtureLogger, _value: unknown): unknown {
    return "real";
  }
}

registerClass("Xaravel\\Tests\\Conditionable\\Fixtures\\FixtureInvokable", FixtureInvokable);

const logger = new FixtureLogger();
/** A result as JSON: the instance as `"logger"`. */
const shown = (value: unknown): unknown => (value === logger ? "logger" : value);

const callback = Mockery.mock(FixtureInvokable);
callback.shouldReceive("__invoke").with(logger, "value").once().andReturn("mocked");
const viaCallback = shown(logger.when("value", callback));

const fallback = Mockery.mock(FixtureInvokable);
fallback.shouldReceive("__invoke").with(logger, 0).once().andReturn(null);
const viaDefault = shown(logger.when(0, null, fallback));

const unless = Mockery.mock(FixtureInvokable);
unless.shouldReceive("__invoke").with(logger, false).once().andReturn("unless");
const viaUnless = shown(logger.unless(false, unless));

let verify: string | null = null;
try {
  Mockery.close();
} catch (error) {
  verify = String(error);
}

process.stdout.write(`${JSON.stringify({ viaCallback, viaDefault, viaUnless, verify })}\n`);
