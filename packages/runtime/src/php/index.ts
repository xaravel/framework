// Installs the Symbol.metadata polyfill before anything else loads (AD-4).
import "../metadata/polyfill";
// Publishes PHP's built-in classes on `Symbol.for('xaravel.php.classes')` (Story 9.10).
import "./phpClasses";
// Publishes the class and interface name lookup on `Symbol.for('xaravel.class.lookup')` (ESC-13.1-9).
import "./classLookup";
// Records PHP's built-in interfaces as contract tokens, so their names resolve (ESC-14.1-2).
import "./Traversable";
import "./Iterator";
import "./IteratorAggregate";
import "./JsonSerializable";
import "./Stringable";
import "./Throwable";
export { ArgumentCountError } from "./ArgumentCountError";
export { ArithmeticError } from "./ArithmeticError";
export { ArrayIterator } from "./ArrayIterator";
export { ArrayObject } from "./ArrayObject";
export {
  ARRAY_FILTER_USE_BOTH,
  ARRAY_FILTER_USE_KEY,
  array_combine,
  array_filter,
  array_unique,
  in_array,
  is_scalar,
  iterator_count,
  iterator_to_array,
  SORT_NUMERIC,
  SORT_REGULAR,
  SORT_STRING,
  toPhpArray,
} from "./arrayFunctions";
export { Attribute } from "./Attribute";
export { attribute, type AttributeDecorator } from "./attributes";
export { BadFunctionCallException } from "./BadFunctionCallException";
export { BadMethodCallException } from "./BadMethodCallException";
export { CachingIterator } from "./CachingIterator";
export { DivisionByZeroError } from "./DivisionByZeroError";
export { enumExists, interfaceExists } from "./classExistence";
export { DomainException } from "./DomainException";
export { Error } from "./Error";
export { ErrorException } from "./ErrorException";
export { Exception } from "./Exception";
export { Generator, yieldFrom } from "./Generator";
export { InternalIterator } from "./InternalIterator";
export { InvalidArgumentException } from "./InvalidArgumentException";
export { Iterator } from "./Iterator";
export { IteratorAggregate } from "./IteratorAggregate";
export { JsonSerializable } from "./JsonSerializable";
export { JsonException } from "./JsonException";
export { keyed, type KeyedYield } from "./keyed";
export { LengthException } from "./LengthException";
export { LogicException } from "./LogicException";
export { OutOfBoundsException } from "./OutOfBoundsException";
export { OutOfRangeException } from "./OutOfRangeException";
export { OverflowException } from "./OverflowException";
export { range } from "./range";
export { RangeException } from "./RangeException";
export { ReflectionAttribute } from "./ReflectionAttribute";
export { ReflectionClass } from "./ReflectionClass";
export { ReflectionEnum } from "./ReflectionEnum";
export { ReflectionException } from "./ReflectionException";
export { ReflectionFunction } from "./ReflectionFunction";
export { ReflectionIntersectionType } from "./ReflectionIntersectionType";
export { ReflectionMethod } from "./ReflectionMethod";
export { ReflectionNamedType } from "./ReflectionNamedType";
export { ReflectionParameter } from "./ReflectionParameter";
export { ReflectionUnionType } from "./ReflectionUnionType";
export { RuntimeException } from "./RuntimeException";
export { Stringable } from "./Stringable";
export { Throwable } from "./Throwable";
export { Traversable } from "./Traversable";
export { TypeError } from "./TypeError";
export { UnderflowException } from "./UnderflowException";
export { UnexpectedValueException } from "./UnexpectedValueException";
export { ValueError } from "./ValueError";
export { WeakMap } from "./WeakMap";
export { __PHP_Incomplete_Class } from "./__PHP_Incomplete_Class";
export { arrayEntries, toBool, toFloat, toInt, toPhpString } from "./casts";
export { float, isFloat, PhpFloat } from "./PhpFloat";
export { hasBrand } from "./hasBrand";
export { isNumeric } from "./isNumeric";
export {
  JSON_BIGINT_AS_STRING,
  JSON_ERROR_CTRL_CHAR,
  JSON_ERROR_DEPTH,
  JSON_ERROR_INF_OR_NAN,
  JSON_ERROR_INVALID_PROPERTY_NAME,
  JSON_ERROR_NON_BACKED_ENUM,
  JSON_ERROR_NONE,
  JSON_ERROR_RECURSION,
  JSON_ERROR_STATE_MISMATCH,
  JSON_ERROR_SYNTAX,
  JSON_ERROR_UNSUPPORTED_TYPE,
  JSON_ERROR_UTF16,
  JSON_ERROR_UTF8,
  JSON_FORCE_OBJECT,
  JSON_HEX_AMP,
  JSON_HEX_APOS,
  JSON_HEX_QUOT,
  JSON_HEX_TAG,
  JSON_INVALID_UTF8_IGNORE,
  JSON_INVALID_UTF8_SUBSTITUTE,
  JSON_NUMERIC_CHECK,
  JSON_OBJECT_AS_ARRAY,
  JSON_PARTIAL_OUTPUT_ON_ERROR,
  JSON_PRESERVE_ZERO_FRACTION,
  JSON_PRETTY_PRINT,
  JSON_THROW_ON_ERROR,
  JSON_UNESCAPED_LINE_TERMINATORS,
  JSON_UNESCAPED_SLASHES,
  JSON_UNESCAPED_UNICODE,
} from "./jsonConstants";
export { jsonDecode } from "./jsonDecode";
export { jsonEncode } from "./jsonEncode";
export { jsonLastError, jsonLastErrorMsg } from "./jsonLastError";
export { looseEquals, spaceship } from "./looseEquals";
export { normalizeNull } from "./normalizeNull";
export { arrayFromEntries, normalizeKey, PhpArray, type PhpArrayKey, type PhpKeyInput } from "./PhpArray";
export { phpSerialize } from "./phpSerialize";
export { getDebugType, gettype } from "./phpType";
export { phpUnserialize, type PhpUnserializeOptions } from "./phpUnserialize";
export { Ref } from "./Ref";
export { stdClass } from "./stdClass";
export { str_starts_with, substr } from "./stringFunctions";
export { valueCopy } from "./valueCopy";
