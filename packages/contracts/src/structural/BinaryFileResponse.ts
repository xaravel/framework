// Symfony\Component\HttpFoundation\BinaryFileResponse, as a contract names it (AD-1.2): a subset of its documented
// public methods.
import type { Response } from "./Response";
import type { SplFileInfo } from "./SplFileInfo";

/** A response that sends a file. */
export interface BinaryFileResponse extends Response {
  /** Gets the file. */
  getFile(): SplFileInfo;

  /** Sets the Content-Disposition header with the given filename. */
  setContentDisposition(disposition: string, filename?: string, filenameFallback?: string): this;

  /** If this is set to true, the file will be unlinked after the request is sent. */
  deleteFileAfterSend(shouldDelete?: boolean): this;
}
