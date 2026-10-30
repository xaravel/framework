---
decision: approved
decided_by: Maintainer
date: 2026-10-30
escalation_sha256: "9cc59bf3c28ba5124d240e487085a67985384258f5da2b94dce6b29977ba68e3"
---

# ESC-15.2-5: approved, option 1 (PORTING.md's PCRE rule covers the forms phpdotenv uses)

The Maintainer approved option 1 on 2026-10-30, in the Maintainer's session, on the orchestrator's and the monitor's recommendation. It extends PORTING.md § PCRE conversion under the existing DIV-10.1, with no new DIV clause.

The runtime's `preg_*` functions (action item `epic-15-item-2-runtime-pcre-functions`) take Upstream's pattern string and convert it by the rule, plus four forms:

1. the `A` modifier becomes the `RegExp` sticky flag `y`, anchoring each match at the start offset as `PCRE_ANCHORED` does;
2. a branch-reset group `(?|…)` is emulated: each alternative's groups compile as separate `RegExp` groups and are remapped to the shared numbers in PHP's match array;
3. a pattern without `u` matches the subject's UTF-8 bytes, with offsets, lengths and quantifier counts in bytes, and `\s`, `\S`, `\d`, `\w` and `\b` keep PCRE's ASCII meanings;
4. with `u`, `\s` and `\S` use PCRE2's Unicode whitespace set, which leaves out U+FEFF.

Any other PCRE-only form throws a JS `TypeError` naming the limit, never a silent conversion. Item 2's XT-runtime cases include the Escalation's PHP 8.5.11 probes.
