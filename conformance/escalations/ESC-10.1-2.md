---
test_ids:
  - XT-contracts-4
trigger: protected-path
proposed: >-
  Option 1 (recommended): one Maintainer-approved change to
  `conformance/tests/xaravel/scaffold.test.ts` (Protected) that adds a
  `SUBPATH_EXPORTS` entry for `@xaravel/contracts` listing every subpath the
  spine names for the package: `psr`, `aliases`, `async`, `view`, `testing`
  (AD-1, AD-22, AD-27) and the kebab-case `Illuminate\Contracts\*`
  namespaces that Stories 10.2 and 10.3 port. Approving the whole list at
  once avoids one Escalation per Story for the same allow-list. Option 2: add
  only `psr` now, and route each later subpath through its own Escalation.
evidence: >-
  `@xaravel/contracts/psr` must be importable for XT-contracts-4 (epics.md,
  Story 10.1: "Given `@xaravel/contracts/psr` When it is imported Then it
  exports the PSR container, simple-cache and log interfaces with tokens").
  `assertExports` in `conformance/tests/xaravel/scaffold.test.ts` (around
  line 229, used by XT-conformance-7) accepts a non-root export key only when
  it is listed in `SUBPATH_EXPORTS`, which today is
  `{ "@xaravel/runtime": ["scope", "registry", "php"] }`. So adding `./psr` to
  `packages/contracts/package.json` fails XT-conformance-7.
  `decisions/ESC-9.1-1.md` says such an entry is made "through the same kind
  of Maintainer-approved change", and `conformance/tests/**` is a Protected
  Path outside this Story's allowed paths. No code or test was written for
  this Test ID.
---

# ESC-10.1-2: `@xaravel/contracts/psr` needs a `SUBPATH_EXPORTS` entry in the protected scaffold test

XT-contracts-4 imports `@xaravel/contracts/psr`. The scaffold test (XT-conformance-7) rejects any package export subpath not listed in `SUBPATH_EXPORTS`. That list lives in a Protected test file, and ESC-9.1-1 reserves new entries for the Maintainer. Every later contracts subpath hits the same check: the `Illuminate\Contracts\*` namespaces in Stories 10.2 and 10.3, and `aliases`, `async`, `view` and `testing` in Stories 10.4 and 10.5. The recommendation is therefore to approve the spine-named list in one change.
