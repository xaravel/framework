---
test_ids:
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testCanSumValuesWithoutACallback#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testCanSumValuesWithoutACallback#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testGettingSumFromCollection#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testGettingSumFromCollection#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testGettingSumFromEmptyCollection#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testGettingSumFromEmptyCollection#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testGettingAvgItemsFromCollection#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testGettingAvgItemsFromCollection#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testPipe#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testPipe#1"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testPipeThrough#0"
  - "Illuminate\\Tests\\Support\\SupportCollectionTest::testPipeThrough#1"
trigger: contract
proposed: >-
  Option 1 (recommended): runtime adds helpers for PHP numeric addition
  and division, under the standing rule for language constructs, and a
  PORTING.md idiom-table row names each helper. Keep PHP operand coercion,
  int versus float results and integral float markers, integer overflow,
  numeric strings (integer, fractional, exponent and leading-numeric),
  null and booleans, PHP TypeError for invalid operands, array addition
  semantics or its existing arrayUnion dispatch, and DivisionByZeroError.
  Add XT-runtime cases against Oracle PHP 8.5.11, covering marker-preserving
  addition and exact integer division results versus fractional results.
  No changed DIV, expected value or grader data. Option 2: select toInt or
  toFloat inside collections. Rejected: it chooses PHP semantics locally
  and cannot reproduce PHP errors and marker behavior for mixed operands.
evidence: >-
  EnumeratesValues.php avg (204) adds a dynamically resolved value to its
  accumulator and divides the accumulated value by the non-null count;
  sum (584) adds a dynamically resolved value on every reduction. Runtime
  has toInt, toFloat and arrayUnion but no mixed-operand numeric addition
  or division helper. PORTING.md Mechanical expression rule requires an
  Escalation when an arithmetic numeric string could be either integer or
  fractional. toFloat accepts a nonnumeric string as zero, where PHP's
  arithmetic rejects it; independently converting toFloat also erases the
  marker that determines whether exact division returns int or float.
  SupportCollectionTest testGettingAvgItemsFromCollection tests integer
  strings and fractional results; its general implementation must handle
  both types, not specialize to those literals. Whole members sum, avg
  and average on both classes are held. testPipe and testPipeThrough
  transitively call sum, so their complete bodies are held too; pipe and
  pipeThrough themselves remain independently implemented. The other
  four test methods above directly exercise these aggregate members.
  All twelve Expectations stay skip/not-ported-yet with this escalation,
  never blocked-by:runtime because runtime is an earlier Epic.
---

# ESC-14.5-2: PHP mixed-operand arithmetic for sums and averages

The helpers belong to runtime under the language-construct amendment in
`decisions/MAINT-2026-10-26-runtime-builtins.md`. The fixed-number counters
in mode and pagination do not need mixed-operand arithmetic. min/max use
the existing runtime spaceship comparator and remain independent.
