# Chunking, sorting, arithmetic and callable helpers

`array_chunk(array, length, preserve_keys)` accepts every runtime PHP array form. `key(array)` reads the pointer selected by `reset(ref)` or `end(ref)`. Pointer state belongs to the array value and is non-enumerable. Pointer writes separate the Ref-held value, including frozen inputs; `valueCopy` and `arrayAppend` preserve its position, including nested arrays. Aliases keep their own position.

`ksort`, `krsort` and `uksort` sort keys through a `Ref`; `sort` and `rsort` sort values and reindex. All PHP sort flags and stable ties use the runtime's Zend comparators. The held array is replaced so existing aliases keep their values.

`plus` and `divide` implement PHP numeric operators, including leading numeric strings, exact integer results, overflow to float, array union and PHP errors. `intdiv`, `floor` and `ceil` are their PHP builtins. `PHP_INT_MIN` and `PHP_INT_MAX` are exact int64 bigint constants. Integral float results retain the float marker.

`strtolower` folds ASCII only. `strrev` reverses UTF-8 bytes; a reversed sequence that JS cannot represent raises the existing unsupported byte-string TypeError. `is_subclass_of` uses Registry identity, contract inheritance and enum interfaces, excluding the identical class.

`resolveCallable` resolves closures, invokables, global names, object/class callable arrays and `Class::method` strings. Every runtime callback consumer shares that resolver, including case-insensitive and magic method dispatch. Invalid callbacks raise PHP TypeErrors. `arrayAppend(ref, value)` separates the array, copies the appended value and preserves PHP's next integer index.

`callUnpacked(callable, args)` and `call_user_func_array` pass integer-keyed values positionally and detect a positional entry after a named entry. `callUnpacked` also accepts Traversable inputs, rejects non-integer/non-string keys and repeated names; `call_user_func_array` remains array-only. Named entries require an explicitly declared options form: set `fn[Symbol.for('xaravel.php.options')] = true` on a callable function or resolved method that takes trailing named options. Inherited methods retain both this declaration and the called class. They become its final options object. Other targets fail explicitly under ESC-14.5-3, preserving names rather than discarding them.

`setlocale` and `LC_ALL` provide bounded locale selection in a Scope Frame. The independent categories are `LC_CTYPE`, `LC_NUMERIC`, `LC_TIME`, `LC_COLLATE`, `LC_MONETARY` and `LC_MESSAGES`, with Oracle Linux values 0 through 5; `LC_ALL` is 6 and selects all categories. Only `C` and `POSIX` are accepted; both canonicalize to `C` and use byte collation. Oracle glibc's canonical spelling follows [findlocale.c](https://github.com/bminor/glibc/blob/glibc-2.41/locale/findlocale.c#L119) and [setlocale.c](https://github.com/bminor/glibc/blob/glibc-2.41/locale/setlocale.c#L142). The host PHP probe normalizes Darwin's retained POSIX spelling to this source-verified Oracle convention; it is not a live Oracle run. Query with `null` or `"0"`; unsupported locales return false and preserve the old setting. `strcoll` and locale sorting read `LC_COLLATE`. Locale writes require a frame.

`Generator.owned(jsGenerator)` explicitly marks a framework-created temporary. Traversal through values, entries or keys closes it on early return, break or exception, runs finally once and never enumerates later source. Plain `new Generator(jsGenerator)` represents a user-held generator and stays resumable after early exit. Exhausted generators already ran their finally; cleanup does not repeat it.

## Divergences

Array and float forms follow DIV-9.2/4. Callable forms follow amended DIV-9.13/14. Named unpacking without an options form is untranslatable under ESC-14.5-3. Locale availability is bounded by ESC-14.5-1. Owned generator lifetime follows ESC-14.5-4 and DIV-12.18.
