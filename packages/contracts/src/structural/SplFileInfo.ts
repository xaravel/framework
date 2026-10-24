// PHP's built-in `SplFileInfo` class, as a contract names it (AD-1.2): a subset of its public methods that read no
// file, so they stay sync (AD-6).

/** PHP's `SplFileInfo`: information about a file path. */
export interface SplFileInfo {
  /** Gets the path without filename. */
  getPath(): string;

  /** Gets the filename. */
  getFilename(): string;

  /** Gets the file extension. */
  getExtension(): string;

  /** Gets the base name of the file, without the given suffix. */
  getBasename(suffix?: string): string;

  /** Gets the path to the file. */
  getPathname(): string;
}
