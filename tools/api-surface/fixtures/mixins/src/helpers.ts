// ESC-14.8-1 fixture: functions exported under another name.

/** Not exported by name: Upstream `Mix\loud($text)` is the `export { shout as loud }` below, matched. */
function shout(text: string): string {
  return text.toUpperCase();
}

/** Upstream `Mix\hum($text)`: re-exported as `hum` by `index.ts`, mismatch, parameter name. */
export function murmur(words: string): string {
  return words.toLowerCase();
}

export { shout as loud };
