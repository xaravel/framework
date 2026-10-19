// Story 6.1 fixture: the three patterns done right; lints clean.
import { each, q } from "./builder";

export async function run(seen: string[]): Promise<readonly string[]> {
  const rows = await q().where("id");
  await Promise.resolve(rows.length);
  each(rows, (item) => {
    seen.push(item);
  });
  return rows;
}
