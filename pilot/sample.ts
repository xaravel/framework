// pilot/porting: Story 8.7 pilot tooling, never merged.
//
// Prints the pilot's stratified, seeded sample as JSON
// `{seed, strata:[{name,pool,taken,ids}]}`: the 4 Mockery rows first, then
// `sampleIds(pool, "pilot-8.7", n)` per stratum (ESC-8.7-1). A stratum's pool
// is its Upstream file's Inventory ids, split on `#` (provider rows carry
// `#<key>`), without the Mockery rows.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { sampleIds } from "../conformance/harness/select";

export const SEED = "pilot-8.7";
const PREFIX = "Illuminate\\Tests\\Support\\";
export const MOCKERY_ROWS = [
  `${PREFIX}SupportCollectionTest::testToArrayCallsToArrayOnEachItemInCollection#0`,
  `${PREFIX}SupportCollectionTest::testToArrayCallsToArrayOnEachItemInCollection#1`,
  `${PREFIX}SupportCollectionTest::testJsonSerializeCallsToArrayOrJsonSerializeOnEachItemInCollection#0`,
  `${PREFIX}SupportCollectionTest::testJsonSerializeCallsToArrayOrJsonSerializeOnEachItemInCollection#1`,
];
export const STRATA = [
  { name: "Collection provider", file: "SupportCollectionTest", provider: true, size: 16 },
  { name: "Collection plain", file: "SupportCollectionTest", provider: false, size: 8 },
  { name: "Arr", file: "SupportArrTest", provider: null, size: 12 },
  { name: "Str plain", file: "SupportStrTest", provider: false, size: 8 },
  { name: "Str provider", file: "SupportStrTest", provider: true, size: 8 },
  { name: "Stringable", file: "SupportStringableTest", provider: null, size: 8 },
] as const;

const root = resolve(import.meta.dir, "..");
const ids: string[] = [];
for (const component of ["collections", "support"]) {
  for (const line of readFileSync(join(root, "conformance", "inventory", `${component}.jsonl`), "utf8").split("\n")) {
    if (line.trim() !== "") {
      ids.push((JSON.parse(line) as { id: string }).id);
    }
  }
}

const strata: { name: string; pool: number; taken: number; ids: string[] }[] = [{ name: "Mockery", pool: MOCKERY_ROWS.length, taken: MOCKERY_ROWS.length, ids: [...MOCKERY_ROWS] }];
for (const stratum of STRATA) {
  const pool = ids.filter((id) => id.startsWith(`${PREFIX}${stratum.file}::`) && !MOCKERY_ROWS.includes(id) && (stratum.provider === null || id.includes("#") === stratum.provider));
  const taken = sampleIds(pool, SEED, stratum.size);
  strata.push({ name: stratum.name, pool: pool.length, taken: taken.length, ids: taken });
}
process.stdout.write(`${JSON.stringify({ seed: SEED, strata }, null, 2)}\n`);
