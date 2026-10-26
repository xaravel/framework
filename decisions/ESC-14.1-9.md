---
decision: approved
decided_by: Maintainer
date: 2026-10-26
escalation_sha256: "0ea1ef65361c8fc00a69fbc626b742f63b95c7699ff952834cb7bf4043644203"
---

# ESC-14.1-9: approved, option 1, the runtime exports the PHP type tests, `instanceof` targets and functions Collections still calls

The Maintainer approved the orchestrator's recommended option on 2026-10-26, in the Maintainer's session, with the monitor's agreement. Both of Story 14.1's third-round Escalations were ruled together. The route is in `decisions/MAINT-2026-10-26-story-14-1-third.md`.

The runtime adds each of the following under its PHP name and with PHP's behaviour:

- **Type tests:** `is_array` and `is_object` in AD-9's forms; `is_string`; `is_iterable`; `is_callable`, covering closures, invokable objects and callable arrays, with DIV-9.13 and DIV-9.14's edges, so that Reflector can later call the same one; and `is_a($value, $name, $allowString)`. `is_a` reads a registered class or a recorded contract token and gives `false` on a miss, so `$x instanceof $name` with a class or interface name ports through it.
- **`instanceof` targets:**
  - `UnitEnum` and `BackedEnum`, as tokens that an AD-26 enum case answers;
  - `Closure`, which a plain function or an arrow function answers and a class constructor does not;
  - `ArrayAccess`, as a token over the existing brand;
  - `Generator`, which also answers a bare JS generator object.
- **Functions:** `sprintf`, `implode`, `explode`, `array_map` (one array keeps its keys, several arrays behave as in PHP), `array_keys`, `array_values`, `array_key_exists`, `array_key_first`, `array_key_last`, `array_merge`, `count` and `abs`.
- **PHP names beside the existing camelCase exports:** `get_debug_type` beside `getDebugType`, and `json_last_error` beside `jsonLastError`, as ESC-14.1-1 and PORTING.md's bare-name rule say.

Collections then ports `data_get` in full, with `value()`, `Arr::accessible`, `Arr::exists` and `Arr::collapse`. Private copies in `packages/collections` (option 2) would be the second implementation that PORTING.md and AD-19 forbid. This is action item `epic-14-item-3-runtime-type-tests-functions`.
