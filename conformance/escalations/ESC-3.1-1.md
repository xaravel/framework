---
test_ids:
  - XT-conformance-68
  - XT-conformance-69
  - XT-conformance-70
trigger: open-question
proposed: >-
  Define the request format and the Differential set in Story 3.1, using typed
  inputs per `kind`. (1) A request has exactly the four keys `id`, `kind`,
  `input` and `sha256`, in that order. `sha256` is the lowercase hex SHA-256
  of the canonical JSON of `{id, kind, input}`: keys sorted by UTF-16 code
  unit at every depth, no whitespace, UTF-8, `/` unescaped, the same rule as
  the private `canonical()` in tools/ruleset/ruleset.ts. Story 3.2 names
  fixtures by that hash, so a Test ID's `#`, spaces and backslashes never
  reach a file name. (2) The Differential set is closed and listed in each
  family's extractor module under tools/oracle/extract/: Str is
  SupportStrTest and SupportStringableTest; the SQL grammars are
  DatabaseQueryBuilderTest and the five Database*SchemaGrammarTest files; Blade
  is the `compileString('<literal>')` inputs under tests/View/Blade/ and the
  `Blade::render(...)` calls in tests/Integration/View/BladeTest.php;
  validation messages are the ValidationValidatorTest methods that assert on
  `messages()` or `errors()`; date formatting is SupportCarbonTest. A Test ID
  × dataset from those files is Differential exactly when its extractor
  captures at least one input from its body. Every other one stays an
  ordinary Ported Test, and a dataset the batch misses goes through Story
  3.4's per-Story requests. (3) `input` per kind: `php-expr` is
  `{bindings, setup, exprs}`, where `exprs` is the verbatim PHP source of each
  assertion's actual argument in body order, `setup` is the verbatim non-assert
  statements before them (empty for a pure call), and `bindings` maps each
  data-provider parameter to its row, exported as lister.php `export()` does.
  `sql-grammar` is `{grammar, setup, exprs}`, with `grammar` one of `base`,
  `sqlite`, `pgsql`, `mysql`, `mariadb` and `sqlsrv`, taken from the
  `get<X>Builder()` or `<X>Grammar` helper the body calls (one request per
  grammar when a body uses several). `blade-render` is `{template, data}`;
  the Oracle renders the template with Blade::render and records the HTML, or
  the exception class and message, so DIV-5's rendered-HTML assertions get an
  expected value even where Upstream asserts compiled PHP. `validation-message`
  is `{lines, data, rules, messages, attributes, format, exprs}`, from the
  `addLines`, `new Validator(...)`, `setFormat` and `messages()`/`errors()`
  calls. `date-format` is `{now, timezone, setup, exprs}`, with `now` from
  `setTestNow`. A body the extractor cannot read into its kind's input (a
  closure capturing outer state, a mock expectation, randomness) yields no
  request. (4) Bodies are read statically from conformance/upstream/.
  Dataset rows need PHP, because providers are evaluated (generators,
  `yield`), so `bun run oracle:extract` takes them from lister.php's
  `export()` in the Oracle image, or with `--local`, as `bun run inventory`
  does. Contributors still need neither: the committed requests are the
  input to everything after. Two runs give the same bytes.
evidence: >-
  Story 3.1's ACs (epics.md:1879-1891) fix only the required fields (`id`,
  `kind` from an open list ending in "…", `input`, `sha256` of "the canonical
  request"), the output path conformance/oracle/requests/<component>.jsonl and
  "one request per Differential Test ID × dataset". No planning document says
  which Test IDs are Differential, what `input` holds for any kind, or what
  "canonical" means. FR-6 (prd.md:265-271) names the five families only;
  AD-15 (ARCHITECTURE-SPINE.md:350-351) says inputs are "extracted
  mechanically"; the PRD glossary (prd.md:159) defines a Differential Test as
  one whose expected value comes from the Oracle. Neither the Inventory
  (`kind` is only `unit` or `integration`) nor conformance/component-map marks
  Differential tests. The Upstream shapes differ by family: SupportStrTest has
  about 600 pure `assertSame(<literal>, Str::m(<literals>))` assertions, but
  every DatabaseQueryBuilderTest assertion needs builder setup on a Mockery
  connection (752 `$builder->toSql()` uses, no inline ones), the schema
  grammar tests build a Blueprint over a mocked connection, the Blade unit
  tests assert compiled PHP rather than rendered HTML (DIV-5, prd.md:752,
  1246), validation messages need a translator, lines, data and rules, and
  SupportCarbonTest freezes time with setTestNow. Each reading (typed inputs,
  verbatim PHP snippets, or capturing the actual values by running the
  Upstream test in the Oracle) and each choice of Differential set gives
  different request files, different fixture counts in Story 3.2 and a
  different contract for Story 3.4, so the spec cannot choose one.
---

# ESC-3.1-1: the Oracle request `input` per kind, the canonical form, and which Test IDs are Differential

Story 3.1 must write one Oracle request per Differential Test ID × dataset. The ACs, FR-6 and AD-15 give the four required fields but say nothing about what `input` holds for each kind, what the canonical request that `sha256` hashes is, or which Inventory Test IDs are Differential. Story 3.2's fixtures and Story 3.4's per-Story requests both inherit whatever 3.1 picks.

The options:

1. **Typed inputs per kind, with a closed Differential set listed per family (proposed).** The details are in `proposed` above. The request is data, not code, so Story 3.4 can validate it and Fidelity Review can read it. Only the Maintainer's extraction run needs the Oracle image, for dataset rows; contributors read the committed requests and need neither PHP nor Docker. Blade gets rendered-HTML expected values, as DIV-5 needs. What it costs: a body the extractor can't read yields no request, so coverage is partial at first. A missed dataset falls back to Story 3.4.
2. **Verbatim PHP snippets.** Each request carries the method body's statements as PHP source, and the Oracle runs them. The extractor is simpler and covers more, but the request is code. The architecture review rejected per-test `.php` snippet requests (reviews/review-rubric.md:308-313) in favour of extracted data, and `kind` would carry no meaning.
3. **Capture the actual values by running the Upstream test.** The Oracle runs each Upstream test method with `Assert` rewritten, as tools/baseline/recorder.php already does, and records every assertion's actual argument. `input` is just the source range and Inventory hash. It covers the most, but it yields compiled PHP for Blade instead of rendered HTML, and it cannot serve Story 3.4's Xaravel-only inputs.

Option 1 adds no divergence, no skip and no `adapted:` marker, and it costs nothing at run time: requests and fixtures are generated once per Pin. Nothing in the spine, the SPEC or `epics.md` changes. Story 3.1's spec is `_bmad-output/implementation-artifacts/spec-3-1-oracle-request-format-and-mechanical-extraction.md`.
