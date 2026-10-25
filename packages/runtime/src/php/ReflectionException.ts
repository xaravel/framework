// PHP's `ReflectionException` (DIV-3.2): a class, method or function that reflection cannot find. It is registered
// under its PHP name but is not one of the 24 built-ins `Symbol.for('xaravel.php.classes')` publishes (XT-runtime-35).
import { registerClass } from "../registry/registry";
import { Exception } from "./Exception";

export class ReflectionException extends Exception {}

registerClass("ReflectionException", ReflectionException);
