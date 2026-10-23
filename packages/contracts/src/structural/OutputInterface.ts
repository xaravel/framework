// Symfony\Component\Console\Output\OutputInterface, as a contract names it (AD-1.2): a subset of its documented
// public methods.
import type { PhpIterable } from "./PhpIterable";

/** A console output. */
export interface OutputInterface {
  /** Writes a message to the output and adds a newline at the end. */
  writeln(messages: string | PhpIterable, options?: number): void;

  /** Gets the current verbosity of the output. */
  getVerbosity(): number;

  /** Returns whether verbosity is quiet (-q). */
  isQuiet(): boolean;

  /** Returns whether verbosity is verbose (-v). */
  isVerbose(): boolean;

  /** Returns whether verbosity is very verbose (-vv). */
  isVeryVerbose(): boolean;

  /** Returns whether verbosity is debug (-vvv). */
  isDebug(): boolean;

  /** Gets the decorated flag. */
  isDecorated(): boolean;
}
