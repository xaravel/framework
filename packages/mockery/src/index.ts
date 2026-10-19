// @xaravel/mockery: the grader's Mockery port (Stories 4.5 and 4.6, Mockery
// 1.6.15) and its port of `jasonmccreary/double` v1.0.1 (Story 4.8: `Double`,
// `OverriddenDouble` and `Argument`, `JMac\Testing\*`).
//
// Loading it installs `globalThis[Symbol.for('xaravel.mockery.run')]` (the
// test-finish protocol, ESC-4.5-1, which also performs Double's auto-verify,
// ESC-4.8-1). If other code already defined that symbol, loading throws
// `LogicException` and installs nothing. Every export and its prototype is
// frozen on load, as in @xaravel/assert (AD-15): assigning to one throws.
//
// `Mockery\Exception` is exported as `Exception`, and
// `Mockery\CountValidator\Exception` as `CountValidatorException` (one JS
// name per export). The argument matchers `Mockery.any()`, `on()`,
// `capture()` and `type()` build are exported as `Any`, `Closure` and `Type`.
// PHP's SPL parent classes, the argument-list matchers and `Mock` itself are
// not exported (ESC-4.5-1 item 2). Of the Double port, `Double`,
// `OverriddenDouble` and `Argument` are exported, with the types
// `DoubleInterface`, `MethodExpectation`, `Matcher`, `TimesOptions` and
// `DoubleForOptions`; its exceptions are thrown, not exported (ESC-4.8-1).
import { DoubleException } from "./JMac/Testing/Exceptions/DoubleException";
import { InvalidDoubleTargetException } from "./JMac/Testing/Exceptions/InvalidDoubleTargetException";
import { MagicMethodException } from "./JMac/Testing/Exceptions/MagicMethodException";
import { ModeConfigurationException } from "./JMac/Testing/Exceptions/ModeConfigurationException";
import { PassthruAutoInstantiationException } from "./JMac/Testing/Exceptions/PassthruAutoInstantiationException";
import { PassthruTypeMismatchException } from "./JMac/Testing/Exceptions/PassthruTypeMismatchException";
import { ReservedNameCollisionException } from "./JMac/Testing/Exceptions/ReservedNameCollisionException";
import { StaticMethodException } from "./JMac/Testing/Exceptions/StaticMethodException";
import { UnknownMethodException } from "./JMac/Testing/Exceptions/UnknownMethodException";
import { PHPUnitAmbiguousExpectationException } from "./JMac/Testing/Integrations/PHPUnit/PHPUnitAmbiguousExpectationException";
import { PHPUnitExpectationCallLimitExceededException } from "./JMac/Testing/Integrations/PHPUnit/PHPUnitExpectationCallLimitExceededException";
import { PHPUnitExpectationCallMismatchException } from "./JMac/Testing/Integrations/PHPUnit/PHPUnitExpectationCallMismatchException";
import { PHPUnitFabricationLimitExceededException } from "./JMac/Testing/Integrations/PHPUnit/PHPUnitFabricationLimitExceededException";
import { PHPUnitUnexpectedCallException } from "./JMac/Testing/Integrations/PHPUnit/PHPUnitUnexpectedCallException";
import { PHPUnitUnsatisfiedExpectationException } from "./JMac/Testing/Integrations/PHPUnit/PHPUnitUnsatisfiedExpectationException";
import { EqualsMatcher } from "./JMac/Testing/Matching/EqualsMatcher";
import { PredicateMatcher } from "./JMac/Testing/Matching/PredicateMatcher";
import { TypeMatcher } from "./JMac/Testing/Matching/TypeMatcher";
import { AmbiguousExpectation } from "./JMac/Testing/Diagnostics/AmbiguousExpectation";
import { ArgumentComparison } from "./JMac/Testing/Diagnostics/ArgumentComparison";
import { ArgumentFormatter } from "./JMac/Testing/Diagnostics/ArgumentFormatter";
import { CallListFormatter } from "./JMac/Testing/Diagnostics/CallListFormatter";
import { DidYouMean } from "./JMac/Testing/Diagnostics/DidYouMean";
import { Pluralizer } from "./JMac/Testing/Diagnostics/Pluralizer";
import { StringDiffer } from "./JMac/Testing/Diagnostics/StringDiffer";
import { UnsatisfiedExpectation } from "./JMac/Testing/Diagnostics/UnsatisfiedExpectation";
import { ValueFormatter } from "./JMac/Testing/Diagnostics/ValueFormatter";
import { ArgumentLabeler } from "./JMac/Testing/Engine/ArgumentLabeler";
import { ClassGenerator } from "./JMac/Testing/Engine/ClassGenerator";
import { DoubleControlMethods } from "./JMac/Testing/Engine/DoubleControlMethods";
import { DoubleIdentity } from "./JMac/Testing/Engine/DoubleIdentity";
import { DoubleState } from "./JMac/Testing/Engine/DoubleState";
import { DoubleTarget } from "./JMac/Testing/Engine/DoubleTarget";
import { ExceptionFactory } from "./JMac/Testing/Engine/ExceptionFactory";
import { Mode } from "./JMac/Testing/Engine/Mode";
import { PassthruInitializer } from "./JMac/Testing/Engine/PassthruInitializer";
import { PhpUnitIntegration } from "./JMac/Testing/Engine/PhpUnitIntegration";
import { ProxyBehavior } from "./JMac/Testing/Engine/ProxyBehavior";
import { SafeDefaultResolver } from "./JMac/Testing/Engine/SafeDefaultResolver";
import { AmbiguousExpectationException } from "./JMac/Testing/Exceptions/AmbiguousExpectationException";
import { AmbiguousExpectationFields } from "./JMac/Testing/Exceptions/AmbiguousExpectationFields";
import { ExpectationCallLimitExceededException } from "./JMac/Testing/Exceptions/ExpectationCallLimitExceededException";
import { ExpectationCallLimitExceededFields } from "./JMac/Testing/Exceptions/ExpectationCallLimitExceededFields";
import { ExpectationCallMismatchException } from "./JMac/Testing/Exceptions/ExpectationCallMismatchException";
import { ExpectationCallMismatchFields } from "./JMac/Testing/Exceptions/ExpectationCallMismatchFields";
import { FabricationLimitExceededException } from "./JMac/Testing/Exceptions/FabricationLimitExceededException";
import { FabricationLimitExceededFields } from "./JMac/Testing/Exceptions/FabricationLimitExceededFields";
import { UnexpectedCallException } from "./JMac/Testing/Exceptions/UnexpectedCallException";
import { UnexpectedCallFields } from "./JMac/Testing/Exceptions/UnexpectedCallFields";
import { UnsatisfiedExpectationException } from "./JMac/Testing/Exceptions/UnsatisfiedExpectationException";
import { UnsatisfiedExpectationFields } from "./JMac/Testing/Exceptions/UnsatisfiedExpectationFields";
import { Argument } from "./JMac/Testing/Matching/Argument";
import { Double } from "./JMac/Testing/Double";
import { MethodExpectation } from "./JMac/Testing/Engine/MethodExpectation";
import { Matcher } from "./JMac/Testing/Matching/Matcher";
import { OverriddenDouble } from "./JMac/Testing/OverriddenDouble";
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
  Argument,
  AtLeast,
  AtMost,
  BadMethodCallException,
  Closure,
  CompositeExpectation,
  Container,
  CountValidatorAbstract,
  CountValidatorException,
  Double,
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
  OverriddenDouble,
  ReceivedMethodCalls,
  RuntimeException,
  Type,
  VerificationDirector,
  VerificationExpectation,
  // Internal classes, frozen too so code under test cannot patch an inherited member.
  AmbiguousExpectation,
  ArgumentComparison,
  ArgumentFormatter,
  CallListFormatter,
  DidYouMean,
  Pluralizer,
  StringDiffer,
  UnsatisfiedExpectation,
  ValueFormatter,
  ArgumentLabeler,
  ClassGenerator,
  DoubleControlMethods,
  DoubleIdentity,
  DoubleState,
  DoubleTarget,
  ExceptionFactory,
  Mode,
  PassthruInitializer,
  PhpUnitIntegration,
  ProxyBehavior,
  SafeDefaultResolver,
  AmbiguousExpectationException,
  AmbiguousExpectationFields,
  ExpectationCallLimitExceededException,
  ExpectationCallLimitExceededFields,
  ExpectationCallMismatchException,
  ExpectationCallMismatchFields,
  FabricationLimitExceededException,
  FabricationLimitExceededFields,
  UnexpectedCallException,
  UnexpectedCallFields,
  UnsatisfiedExpectationException,
  UnsatisfiedExpectationFields,
  AnyArgs,
  DoubleException,
  EqualsMatcher,
  InvalidDoubleTargetException,
  MagicMethodException,
  ModeConfigurationException,
  PassthruAutoInstantiationException,
  PassthruTypeMismatchException,
  PHPUnitAmbiguousExpectationException,
  PHPUnitExpectationCallLimitExceededException,
  PHPUnitExpectationCallMismatchException,
  PHPUnitFabricationLimitExceededException,
  PHPUnitUnexpectedCallException,
  PHPUnitUnsatisfiedExpectationException,
  PredicateMatcher,
  ReservedNameCollisionException,
  StaticMethodException,
  TypeMatcher,
  UnknownMethodException,
  BadFunctionCallException,
  LogicException,
  Matcher,
  MatcherAbstract,
  MethodExpectation,
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
  Argument,
  AtLeast,
  AtMost,
  BadMethodCallException,
  Closure,
  CompositeExpectation,
  Container,
  CountValidatorAbstract,
  CountValidatorException,
  Double,
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
  OverriddenDouble,
  ReceivedMethodCalls,
  RuntimeException,
  Type,
  VerificationDirector,
  VerificationExpectation,
};
export type { DoubleForOptions } from "./JMac/Testing/Double";
export type { DoubleInterface } from "./JMac/Testing/DoubleInterface";
export type { MethodExpectation, TimesOptions } from "./JMac/Testing/Engine/MethodExpectation";
export type { Matcher } from "./JMac/Testing/Matching/Matcher";
export type { LegacyMockInterface, MethodNames, MockObject } from "./Mockery/LegacyMockInterface";
export type { MockTarget } from "./Mockery/Mock";
export type { Ref } from "./Mockery";
