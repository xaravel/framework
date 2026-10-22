// Internal helpers the codec's two halves share (Story 9.7): PHP's property-name mangling and the UTF-8 checks. The
// package does not export this module.

/** A lone (unpaired) surrogate, which has no UTF-8 form. */
export const LONE_SURROGATE = /\p{Cs}/u;

/** The UTF-8 encoder of the codec. */
export const utf8 = new TextEncoder();

/** The JS property a serialized property name stands for: `\0*\0x` and `\0Class\0x` are `x`; any other name as it is. */
export function unmangle(name: string): string {
  if (name.startsWith("\0")) {
    const end = name.indexOf("\0", 1);
    if (end !== -1) {
      return name.slice(end + 1);
    }
  }
  return name;
}
