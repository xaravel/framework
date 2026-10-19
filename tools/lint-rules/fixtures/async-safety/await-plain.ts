// Story 6.1 fixture: fails `await-thenable` only.
export async function run(): Promise<number> {
  const x = 1;
  return await x;
}
