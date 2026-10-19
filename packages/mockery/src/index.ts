// @xaravel/mockery: the grader's Mockery port (Stories 4.5 and 4.6, Mockery 1.6.15).
//
// Loading it installs `globalThis[Symbol.for('xaravel.mockery.mock')]` (what
// `createMock` delegates to, ESC-4.4-1) and `Symbol.for('xaravel.mockery.run')`
// (the test-finish protocol, ESC-4.5-1). If other code already defined either
// symbol, loading throws `LogicException` and installs neither. Every export
// and its prototype is frozen on load, as in @xaravel/assert (AD-15):
// assigning to one throws.
//
// `Mockery\Exception` is exported as `Exception`, and
// `Mockery\CountValidator\Exception` as `CountValidatorException` (one JS
// name per export). The argument matchers `Mockery.any()`, `on()`,
// `capture()` and `type()` build are exported as `Any`, `Closure` and `Type`.
// PHP's SPL parent classes, the argument-list matchers and `Mock` itself are
// not exported (ESC-4.5-1 item 2).
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
import { ExpectsHigherOrderMessage } from "./Mockery/ExpectsHigherOrderMessage";
import { HigherOrderMessage } from "./Mockery/HigherOrderMessage";
import { Any } from "./Mockery/Matcher/Any";
import { AnyArgs } from "./Mockery/Matcher/AnyArgs";
import { Closure } from "./Mockery/Matcher/Closure";
import { MatcherAbstract } from "./Mockery/Matcher/MatcherAbstract";
import { MultiArgumentClosure } from "./Mockery/Matcher/MultiArgumentClosure";
import { NoArgs } from "./Mockery/Matcher/NoArgs";
import { Type } from "./Mockery/Matcher/Type";
import { MethodCall } from "./Mockery/MethodCall";
import { Mock } from "./Mockery/Mock";
import { ReceivedMethodCalls } from "./Mockery/ReceivedMethodCalls";
import { VerificationDirector } from "./Mockery/VerificationDirector";
import { VerificationExpectation } from "./Mockery/VerificationExpectation";
import { BadFunctionCallException } from "./php/BadFunctionCallException";
import { BadMethodCallException as PhpBadMethodCallException } from "./php/BadMethodCallException";
import { Exception as PhpException } from "./php/Exception";
import { InvalidArgumentException as PhpInvalidArgumentException } from "./php/InvalidArgumentException";
import { LogicException } from "./php/LogicException";
import { OutOfBoundsException } from "./php/OutOfBoundsException";
import { RuntimeException as PhpRuntimeException } from "./php/RuntimeException";
import { UnexpectedValueException } from "./php/UnexpectedValueException";

for (const exported of [
  Any,
  AtLeast,
  AtMost,
  BadMethodCallException,
  Closure,
  CompositeExpectation,
  Container,
  CountValidatorAbstract,
  CountValidatorException,
  Exact,
  Exception,
  Expectation,
  ExpectationDirector,
  ExpectsHigherOrderMessage,
  HigherOrderMessage,
  InvalidArgumentException,
  InvalidCountException,
  InvalidOrderException,
  MethodCall,
  Mockery,
  NoMatchingExpectationException,
  ReceivedMethodCalls,
  RuntimeException,
  Type,
  VerificationDirector,
  VerificationExpectation,
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
  Any,
  AtLeast,
  AtMost,
  BadMethodCallException,
  Closure,
  CompositeExpectation,
  Container,
  CountValidatorAbstract,
  CountValidatorException,
  Exact,
  Exception,
  Expectation,
  ExpectationDirector,
  ExpectsHigherOrderMessage,
  HigherOrderMessage,
  InvalidArgumentException,
  InvalidCountException,
  InvalidOrderException,
  MethodCall,
  Mockery,
  NoMatchingExpectationException,
  ReceivedMethodCalls,
  RuntimeException,
  Type,
  VerificationDirector,
  VerificationExpectation,
};
export type { LegacyMockInterface, MethodNames, MockObject } from "./Mockery/LegacyMockInterface";
export type { MockTarget } from "./Mockery/Mock";
export type { Ref } from "./Mockery";
