// Story 6.6 fixture: fails `no-misused-promises` (checksConditionals) only.
export function run(seen: string[], pending: Promise<boolean>): void {
  // @ts-expect-error TS2801: tsc flags this Promise condition too; the fixture proves the lint rule does.
  if (pending) {
    seen.push("ready");
  }
}
