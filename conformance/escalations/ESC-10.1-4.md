---
test_ids:
  - XT-contracts-4
trigger: contract
proposed: >-
  Option 1 (recommended): record the PSR interfaces in the committed API
  surface. `oracle:api-surface` (`tools/oracle/api-surface.php`) also emits
  `Psr\Container\*`, `Psr\SimpleCache\*` and `Psr\Log\*` rows, at the
  versions the Oracle's `composer.lock` pins (psr/container 2.0.2,
  psr/simple-cache 3.0.0, psr/log 3.0.2), into
  `conformance/api-surface/contracts.jsonl`, the file for the package AD-22
  names as their owner. Story 10.1's `@xaravel/contracts/psr` tokens then
  take their method and parameter names from those rows, as ESC-10.1-1 (b)
  and ESC-4.7-1 item 5 ask, and `api-surface:gate contracts` checks the PSR
  ports like every other contract. This is a Protected Path change, so it
  would be an Infrastructure Story or action item before XT-contracts-4
  resumes. Option 2: port the PSR method and parameter names by hand from
  those pinned versions into `packages/contracts/src/psr/`, with the source
  version named in each file, and accept that the PSR tokens' metadata and
  members are not checked against a committed surface.
evidence: >-
  ESC-10.1-1 (b) rules that a token's method names
  (`Symbol.for('xaravel.contract.methods')`) and parameter names
  (`Symbol.for('xaravel.contract.parameters')`) "come from the committed API
  surface (ESC-4.7-1 item 5)", and Story 10.1's fourth criterion applies to
  every contract token. Its fifth criterion asks `@xaravel/contracts/psr` to
  export the PSR container, simple-cache and log interfaces with tokens
  (AD-22: "PSR container, simple-cache and log interfaces |
  `@xaravel/contracts/psr` | port"). No file in `conformance/api-surface/`
  has a row whose `fqcn` starts with `Psr\`: the PSR names appear only as
  parameter types and parents (for example `Illuminate\Log\Logger::__construct`
  in `log.jsonl`, and `Illuminate\Contracts\Container\Container extends
  Psr\Container\ContainerInterface` in Upstream). The PSR sources exist
  locally only under the gitignored
  `conformance/tests/xaravel/php-fixtures/pest/vendor/psr/`. So the PSR
  tokens have no ruled source for their metadata, and the API-surface check
  has nothing to compare their interfaces with. Story 10.1 carries on with
  XT-contracts-1, -2 and -18; no `psr` subpath was added.
---

# ESC-10.1-4: the PSR interfaces have no committed API surface to take their token metadata from

ESC-10.1-1 rules that every contract token's method and parameter names come from the committed API surface. The PSR container, simple-cache and log interfaces that `@xaravel/contracts/psr` must port are not in it: `oracle:api-surface` records only Laravel's classes. Hand-writing their metadata would go beyond that ruling, and recording them changes a Protected Path, so this needs a ruling.

The recommended fix, Option 1, adds the PSR interfaces at the Oracle's pinned versions to the committed surface, so the PSR tokens, the doubles and the API-surface gate all read one source. This stops XT-contracts-4 only.
