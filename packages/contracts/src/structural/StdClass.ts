// PHP's `stdClass`, as a contract returns it (AD-1.2): an object with dynamic public properties, so it is a `type`.

/** A PHP `stdClass`: dynamic public properties. */
export type StdClass = { [property: string]: unknown };
