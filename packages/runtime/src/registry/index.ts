// Installs the Symbol.metadata polyfill before anything else loads (AD-4).
import "../metadata/polyfill";
// Publishes PHP's built-in classes on `Symbol.for('xaravel.php.classes')` (Story 9.10).
import "../php/phpClasses";
// The scope module installs the Registry's access to the test units on load (registerTestClass, AD-10.5).
import "../scope/scope";

import { JSON_THROW_ON_ERROR } from "../php/jsonConstants";
import { jsonEncode } from "../php/jsonEncode";
import { installClassmapEncoder } from "./registry";

// The Registry takes its classmap encoder from here, so `registry.ts` never imports the JSON codec, whose errors are
// PHP's `JsonException` (Story 9.10). Under JSON_THROW_ON_ERROR the encoder returns a string or throws.
installClassmapEncoder((value) => jsonEncode(value, JSON_THROW_ON_ERROR) as string);

export { fqcn, loadAutoload, loadClassmap, type RegisteredClass, registerClass, registerTestClass, resolveClass, resolveClassAsync, writeClassmap } from "./registry";
