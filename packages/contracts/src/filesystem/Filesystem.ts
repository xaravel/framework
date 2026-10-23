// Illuminate\Contracts\Filesystem\Filesystem, from laravel/framework v13.37.0.
// Upstream's constants `VISIBILITY_PUBLIC = 'public'` and `VISIBILITY_PRIVATE = 'private'` are static: a TypeScript
// interface and a contract token cannot declare them, so they are left out here pending
// conformance/escalations/ESC-10.2-1.md. A PHP stream `resource` is the structural `PhpResource`.
import { contract } from "../Contract";
import type { File } from "../structural/File";
import type { PhpArrayLike } from "../structural/PhpArrayLike";
import type { PhpResource } from "../structural/PhpResource";
import type { StreamInterface } from "../structural/StreamInterface";
import type { UploadedFile } from "../structural/UploadedFile";

declare const FilesystemBrand: unique symbol;

export interface Filesystem {
  readonly [Filesystem.brand]: true;

  /** Get the full path to the file that exists at the given relative path. */
  path(path: string): string;

  /**
   * Determine if a file exists.
   * @asyncRoot Filesystem\Filesystem.exists
   */
  exists(path: string): Promise<boolean>;

  /**
   * Get the contents of a file.
   * @asyncRoot Filesystem\Filesystem.get
   */
  get(path: string): Promise<string | null>;

  /**
   * Get a resource to read the file.
   * @asyncRoot Filesystem\Filesystem.readStream
   */
  readStream(path: string): Promise<PhpResource | null>;

  /**
   * Write the contents of a file.
   * @asyncRoot Filesystem\Filesystem.put
   */
  put(path: string, contents: StreamInterface | File | UploadedFile | string | PhpResource, options?: unknown): Promise<boolean>;

  /**
   * Store the uploaded file on the disk.
   * @asyncRoot Filesystem\Filesystem.putFile
   */
  putFile(path: File | UploadedFile | string, file?: File | UploadedFile | string | PhpArrayLike | null, options?: unknown): Promise<string | false>;
  putFile(path: File | UploadedFile | string, options?: { file?: File | UploadedFile | string | PhpArrayLike | null; options?: unknown }): Promise<string | false>;

  /**
   * Store the uploaded file on the disk with a given name.
   * @asyncRoot Filesystem\Filesystem.putFileAs
   */
  putFileAs(path: File | UploadedFile | string, file: File | UploadedFile | string | PhpArrayLike | null, name?: string | PhpArrayLike | null, options?: unknown): Promise<string | false>;
  putFileAs(path: File | UploadedFile | string, file: File | UploadedFile | string | PhpArrayLike | null, options?: { name?: string | PhpArrayLike | null; options?: unknown }): Promise<string | false>;

  /**
   * Write a new file using a stream.
   * @asyncRoot Filesystem\Filesystem.writeStream
   */
  writeStream(path: string, resource: PhpResource, options?: PhpArrayLike): Promise<boolean>;

  /**
   * Get the visibility for the given path.
   * @asyncRoot Filesystem\Filesystem.getVisibility
   */
  getVisibility(path: string): Promise<string>;

  /**
   * Set the visibility for the given path.
   * @asyncRoot Filesystem\Filesystem.setVisibility
   */
  setVisibility(path: string, visibility: string): Promise<boolean>;

  /**
   * Prepend to a file.
   * @asyncRoot Filesystem\Filesystem.prepend
   */
  prepend(path: string, data: string): Promise<boolean>;

  /**
   * Append to a file.
   * @asyncRoot Filesystem\Filesystem.append
   */
  append(path: string, data: string): Promise<boolean>;

  /**
   * Delete the file at a given path.
   * @asyncRoot Filesystem\Filesystem.delete
   */
  delete(paths: string | PhpArrayLike): Promise<boolean>;

  /**
   * Copy a file to a new location.
   * @asyncRoot Filesystem\Filesystem.copy
   */
  copy(from: string, to: string): Promise<boolean>;

  /**
   * Move a file to a new location.
   * @asyncRoot Filesystem\Filesystem.move
   */
  move(from: string, to: string): Promise<boolean>;

  /**
   * Get the file size of a given file.
   * @asyncRoot Filesystem\Filesystem.size
   */
  size(path: string): Promise<number>;

  /**
   * Get the file's last modification time.
   * @asyncRoot Filesystem\Filesystem.lastModified
   */
  lastModified(path: string): Promise<number>;

  /**
   * Get an array of all files in a directory.
   * @asyncRoot Filesystem\Filesystem.files
   */
  files(directory?: string | null, recursive?: boolean): Promise<PhpArrayLike>;
  files(options?: { directory?: string | null; recursive?: boolean }): Promise<PhpArrayLike>;

  /**
   * Get all of the files from the given directory (recursive).
   * @asyncRoot Filesystem\Filesystem.allFiles
   */
  allFiles(directory?: string | null): Promise<PhpArrayLike>;

  /**
   * Get all of the directories within a given directory.
   * @asyncRoot Filesystem\Filesystem.directories
   */
  directories(directory?: string | null, recursive?: boolean): Promise<PhpArrayLike>;
  directories(options?: { directory?: string | null; recursive?: boolean }): Promise<PhpArrayLike>;

  /**
   * Get all (recursive) of the directories within a given directory.
   * @asyncRoot Filesystem\Filesystem.allDirectories
   */
  allDirectories(directory?: string | null): Promise<PhpArrayLike>;

  /**
   * Create a directory.
   * @asyncRoot Filesystem\Filesystem.makeDirectory
   */
  makeDirectory(path: string): Promise<boolean>;

  /**
   * Recursively delete a directory.
   * @asyncRoot Filesystem\Filesystem.deleteDirectory
   */
  deleteDirectory(directory: string): Promise<boolean>;
}

export const Filesystem = contract<Filesystem, typeof FilesystemBrand>(
  "Illuminate\\Contracts\\Filesystem\\Filesystem",
  {
    allDirectories: ["directory"],
    allFiles: ["directory"],
    append: ["path", "data"],
    copy: ["from", "to"],
    delete: ["paths"],
    deleteDirectory: ["directory"],
    directories: ["directory", "recursive"],
    exists: ["path"],
    files: ["directory", "recursive"],
    get: ["path"],
    getVisibility: ["path"],
    lastModified: ["path"],
    makeDirectory: ["path"],
    move: ["from", "to"],
    path: ["path"],
    prepend: ["path", "data"],
    put: ["path", "contents", "options"],
    putFile: ["path", "file", "options"],
    putFileAs: ["path", "file", "name", "options"],
    readStream: ["path"],
    setVisibility: ["path", "visibility"],
    size: ["path"],
    writeStream: ["path", "resource", "options"],
  },
);
