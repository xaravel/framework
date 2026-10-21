// The scope module installs the Registry's access to the test units on load (registerTestClass, AD-10.5).
import "../scope/scope";

export { fqcn, loadAutoload, loadClassmap, type RegisteredClass, registerClass, registerTestClass, resolveClass, resolveClassAsync, writeClassmap } from "./registry";
