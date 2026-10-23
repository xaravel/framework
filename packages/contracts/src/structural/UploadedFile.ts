// Illuminate\Http\UploadedFile, as a contract names it (AD-1.2): a subset of its public methods that read no storage.

/** A file uploaded through a request. */
export interface UploadedFile {
  /** Get the fully qualified path to the file. */
  path(): string;

  /** Get the file's extension. */
  extension(): string;

  /** Get a filename for the file. */
  hashName(path?: string | null): string;

  /** Get the file's extension supplied by the client. */
  clientExtension(): string;
}
