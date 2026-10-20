---
decision: confirmed
decided_by: orchestrator (MAINT-2026-10-16)
date: 2026-10-20
source: conformance/spikes/REPORT.md
---

# OQ-8: PHP `$2y$` hashes verify in Bun once the input is truncated to 72 UTF-8 bytes

The Maintainer accepted the approach in PRD OQ-8: truncate the UTF-8 input to 72 bytes before calling Bun. This file only records the Differential Test that confirms it (Story 8.4, XT-conformance-158, FR-78).

Each hash is PHP's own. The Oracle ran `crypt($pw, '$2y$12$XaravelSpike84OracleTu')` (cost 12, Laravel's default, with a fixed salt so its two evaluations match) and signed the result. Bun 1.4.3 verified `Bun.password.verify(utf8(pw).subarray(0, 72), h)`, passing the bytes without re-decoding them. The untruncated string is the control.

| Case | Bytes | PHP password_verify | Bun, truncated to 72 bytes | Bun, untruncated |
| --- | --- | --- | --- | --- |
| `bcrypt.ascii-71` | 71 | true | true | true |
| `bcrypt.ascii-72` | 72 | true | true | true |
| `bcrypt.ascii-73` | 73 | true | true | false |
| `bcrypt.ascii-200` | 200 | true | true | false |
| `bcrypt.multibyte-72` | 72 | true | true | true |
| `bcrypt.multibyte-73-split` | 73 | true | true | false |
| `bcrypt.multibyte-200` | 200 | true | true | false |

Truncating to 72 UTF-8 bytes reproduces PHP in every case. That includes `bcrypt.multibyte-73-split`, where the cut ends inside a character, which is why the bytes are passed and never decoded back to a string. Bun accepts the `$2y$` prefix as it is.

The untruncated control is false for every password over 72 bytes, and true at 72 bytes or fewer. That is Bun's pre-hash: Bun hashes a password longer than 72 bytes before bcrypt sees it, where PHP ignores everything past byte 72. So the Hashing port must truncate before every `Bun.password` call, both for hashing and for verifying. Otherwise a long password hashed by PHP would never verify in Xaravel. By the same difference (inferred, not measured here), a long password Bun hashed without truncation would not verify in PHP.
