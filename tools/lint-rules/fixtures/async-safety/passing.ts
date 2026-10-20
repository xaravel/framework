// Story 6.1 fixture: the four patterns done right (the awaited condition is Story 6.6's); lints clean.
import { each, q } from "./builder";

export async function run(seen: string[], pending: Promise<boolean>): Promise<readonly string[]> {
  const rows = await q().where("id");
  await Promise.resolve(rows.length);
  each(rows, (item) => {
    seen.push(item);
  });
  if (await pending) {
    seen.push("ready");
  }
  return rows;
}
