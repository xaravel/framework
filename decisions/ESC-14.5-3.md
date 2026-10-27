---
decision: approved
decided_by: Maintainer
date: 2026-10-27
escalation_sha256: "156bbe2762456211b308a8e3f5fb2c3f6e11bce89399f563be1fe6496c1ac33b"
---

# ESC-14.5-3: approved, option 1, append and unpack helpers, and the shared resolver extended to every PHP callable form

The Maintainer approved the orchestrator's recommended option on 2026-10-27, in the Maintainer's session, with the monitor's agreement. The route is in `decisions/MAINT-2026-10-27-story-14-5.md`.

**Append and unpack helpers.** `@xaravel/runtime/php` gives PORTING.md idiom-table rows for each:

- `arrayAppend(ref, value)` for `$a[] = $v` on a PHP array value, which takes the next integer key as PHP does;
- `callUnpacked(callable, args)` for `$f(...$args)`. Integer-keyed entries are positional. A string key is a named argument, and it is untranslatable when the target has no options form.

**The resolver.** The shared PHP-callable resolver (ESC-14.4-2) now also resolves callable arrays and `'Class::method'` strings:

- `[$object, 'method']`;
- `[Class::class, 'method']`, through the Class Registry;
- `'Class::method'` strings.

It uses DIV-9.14's rules: case-insensitive method lookup, public and static methods, and PHP's errors. It applies wherever the runtime takes a callable, `when` / `unless` included.

**Records.** `decisions/DIV-9.md`'s DIV-9.13 is amended: no PHP callable form is adapted any more. Earlier Ported Tests that adapted one may keep their marked adaptation until their Component's next Story reverts it.

Option 2 would have added a DIV clause adapting every callable array. This is action item `epic-14-item-10-runtime-chunk-sort-arith-callables`.
