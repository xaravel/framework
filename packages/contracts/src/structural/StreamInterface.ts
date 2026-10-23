// Psr\Http\Message\StreamInterface (psr/http-message), as a contract names it (AD-1.2): a subset of its documented
// methods that read no data.

/** A PSR-7 data stream. */
export interface StreamInterface {
  /** Get the size of the stream if known. */
  getSize(): number | null;

  /** Returns true if the stream is at the end of the stream. */
  eof(): boolean;

  /** Returns whether or not the stream is seekable. */
  isSeekable(): boolean;

  /** Returns whether or not the stream is writable. */
  isWritable(): boolean;

  /** Returns whether or not the stream is readable. */
  isReadable(): boolean;
}
