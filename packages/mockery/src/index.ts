// @xaravel/mockery: the grader's Mockery port (Story 4.5, Mockery 1.6.15 core).
//
// Loading it installs `globalThis[Symbol.for('xaravel.mockery.mock')]` (what
// `createMock` delegates to, ESC-4.4-1) and `Symbol.for('xaravel.mockery.run')`
// (the test-finish protocol, ESC-4.5-1). Every export and its prototype is
// frozen on load, as in @xaravel/assert (AD-15): assigning to one throws.
//
// `Mockery\Exception` is exported as `Exception`, and
// `Mockery\CountValidator\Exception` as `CountValidatorException` (one JS
// name per export). PHP's SPL parent classes and the internal argument
// matchers are not exported (ESC-4.5-1 item 2; Story 4.6 exports matchers).
import { Mockery } from "./Mockery";
import { CompositeExpectation } from "./Mockery/CompositeExpectation";
import { Container } from "./Mockery/Container";
import { AtLeast } from "./Mockery/CountValidator/AtLeast";
import { AtMost } from "./Mockery/CountValidator/AtMost";
import { CountValidatorAbstract } from "./Mockery/CountValidator/CountValidatorAbstract";
import { Exception as CountValidatorException } from "./Mockery/CountValidator/Exception";
import { Exact } from "./Mockery/CountValidator/Exact";
import { Exception } from "./Mockery/Exception";
import { BadMethodCallException } from "./Mockery/Exception/BadMethodCallException";
import { InvalidArgumentException } from "./Mockery/Exception/InvalidArgumentException";
import { InvalidCountException } from "./Mockery/Exception/InvalidCountException";
import { InvalidOrderException } from "./Mockery/Exception/InvalidOrderException";
import { NoMatchingExpectationException } from "./Mockery/Exception/NoMatchingExpectationException";
import { RuntimeException } from "./Mockery/Exception/RuntimeException";
import { Expectation } from "./Mockery/Expectation";
import { ExpectationDirector } from "./Mockery/ExpectationDirector";
import { AnyArgs } from "./Mockery/Matcher/AnyArgs";
import { MatcherAbstract } from "./Mockery/Matcher/MatcherAbstract";
import { MultiArgumentClosure } from "./Mockery/Matcher/MultiArgumentClosure";
import { NoArgs } from "./Mockery/Matcher/NoArgs";
import { Mock } from "./Mockery/Mock";
import { BadFunctionCallException } from "./php/BadFunctionCallException";
import { BadMethodCallException as PhpBadMethodCallException } from "./php/BadMethodCallException";
import { Exception as PhpException } from "./php/Exception";
import { InvalidArgumentException as PhpInvalidArgumentException } from "./php/InvalidArgumentException";
import { LogicException } from "./php/LogicException";
import { OutOfBoundsException } from "./php/OutOfBoundsException";
import { RuntimeException as PhpRuntimeException } from "./php/RuntimeException";
import { UnexpectedValueException } from "./php/UnexpectedValueException";

for (const exported of [
  AtLeast,
  AtMost,
  BadMethodCallException,
  CompositeExpectation,
  Container,
  CountValidatorAbstract,
  CountValidatorException,
  Exact,
  Exception,
  Expectation,
  ExpectationDirector,
  InvalidArgumentException,
  InvalidCountException,
  InvalidOrderException,
  Mockery,
  NoMatchingExpectationException,
  RuntimeException,
  // Internal classes, frozen too so code under test cannot patch an inherited member.
  AnyArgs,
  BadFunctionCallException,
  LogicException,
  MatcherAbstract,
  Mock,
  MultiArgumentClosure,
  NoArgs,
  OutOfBoundsException,
  PhpBadMethodCallException,
  PhpException,
  PhpInvalidArgumentException,
  PhpRuntimeException,
  UnexpectedValueException,
]) {
  Object.freeze(exported.prototype);
  Object.freeze(exported);
}

export {
  AtLeast,
  AtMost,
  BadMethodCallException,
  CompositeExpectation,
  Container,
  CountValidatorAbstract,
  CountValidatorException,
  Exact,
  Exception,
  Expectation,
  ExpectationDirector,
  InvalidArgumentException,
  InvalidCountException,
  InvalidOrderException,
  Mockery,
  NoMatchingExpectationException,
  RuntimeException,
};
export type { LegacyMockInterface, MockObject } from "./Mockery/LegacyMockInterface";
export type { MockTarget } from "./Mockery/Mock";
