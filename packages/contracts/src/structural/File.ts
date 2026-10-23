// Illuminate\Http\File, as a contract names it (AD-1.2): a subset of its public methods (its `FileHelpers` trait).

/** A file on the local filesystem. */
export interface File {
  /** Get the fully qualified path to the file. */
  path(): string;

  /** Get the file's extension. */
  extension(): string;

  /** Get a filename for the file. */
  hashName(path?: string | null): string;
}
