---
test_ids:
  - XT-conformance-89
  - XT-conformance-90
trigger: open-question
proposed: >-
  `conformance/variants` lists every backend value the committed Inventory
  uses, so that every Test ID × Variant pair gets an Expectations line. Besides
  the alpha Variants (`none`, `sqlite`, `pgsql`, `redis`, `queue-sync@none`,
  `queue-database@sqlite`, `queue-redis@redis`) and the two examples the AC
  names (`queue-database@pgsql`, `session-redis@redis`), it lists the post-alpha
  backends the Inventory already tags: `mysql`, `mariadb`, `sqlsrv` and
  `queue-beanstalkd@beanstalkd`. The vocabulary stays closed: an Inventory
  backend outside it makes `expectations:init` and `expectations:check` fail.
  `expectations:init` writes the post-alpha pairs like any other, `status:
  skip`, `reason: not-ported-yet` (`deferred:ai-sdk` for `laravel/ai`), as the
  AC states; moving them to `deferred:<item>` under PRD §7.2 is a later edit
  that Story 5.2's rule checks validate. Which Variants are alpha (must run in
  CI) is not recorded in the file; PRD SM-1 and AD-28 define it, and Story
  5.7's merge-queue AC ("all alpha Variants") consumes it.
evidence: >-
  AD-15 (ARCHITECTURE-SPINE.md:339, 346) says Variants come "from the Test
  Inventory's `backends`" and that `conformance/variants` is a closed vocabulary
  of "`none`, `sqlite`, `pgsql`, `redis`, and `<driver>@<backend>`". Story 5.1's
  AC (epics.md:2207) repeats that list. The committed Inventory (Story 2.4)
  tags 294 entries with only `mysql`, `mariadb` or `sqlsrv`, 11 more with some
  of them beside an alpha backend, and 325 queue entries with
  `queue-beanstalkd@beanstalkd`. PRD FR-3 (prd.md:224) asks for exactly one
  status for every Test ID × Backend Variant pair, FR-5 (prd.md:259) for a
  denominator that is "always the full count", and §7.2 (prd.md:1347-1352)
  says tests for MySQL, MariaDB, SQL Server and Beanstalkd "are recorded as
  `deferred:<item>`", which needs a line, so a Variant, for each. Reading the
  spine's list literally drops those pairs from the Expectations File and the
  denominator; reading AD-15's "from the Inventory's backends" and the PRD
  keeps them. The two give different files on disk.
---

# ESC-5.1-1: Variants for the post-alpha backends the Inventory already tags

The Inventory tags some tests with `mysql`, `mariadb`, `sqlsrv` and `queue-beanstalkd@beanstalkd`. The spine's Variant list does not name them, but the PRD wants every Test ID × Backend Variant pair recorded, with post-alpha backends as `deferred:<item>`.

The options:

1. **List them as Variants (proposed).** Every Inventory pair gets a line, so the denominator stays the full count (FR-5). They start as `not-ported-yet`, which counts against conformance, as the AC asks. Nothing in the spine, the SPEC or `epics.md` changes: the vocabulary stays closed, and the extra members follow AD-15's rule that Variants come from the Inventory's `backends`.
2. **Leave them out.** About 300 Test IDs and 340 more pairs would have no Expectations line and leave the denominator. That would weaken the grader, so the orchestrator may not choose it.
3. **Drop the backends from the Inventory.** This changes Story 2.4's committed data and FR-1, which asks for MySQL, MariaDB and SQL Server tags.

Option 1 adds no divergence, no skip and no `adapted:` marker, and costs nothing at run time. The Story spec is `_bmad-output/implementation-artifacts/spec-5-1-variant-vocabulary-and-expectations-file.md`.
