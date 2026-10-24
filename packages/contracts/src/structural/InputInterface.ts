// Symfony\Component\Console\Input\InputInterface, as a contract names it (AD-1.2): a subset of its documented public
// methods.
import type { PhpArrayLike } from "./PhpArrayLike";

/** A console input. */
export interface InputInterface {
  /** Returns the first argument from the raw parameters (not parsed). */
  getFirstArgument(): string | null;

  /** Returns all the given arguments merged with the default values. */
  getArguments(): PhpArrayLike;

  /** Returns the argument value for a given argument name. */
  getArgument(name: string): unknown;

  /** Returns true if an InputArgument object exists by name or position. */
  hasArgument(name: string): boolean;

  /** Returns all the given options merged with the default values. */
  getOptions(): PhpArrayLike;

  /** Returns the option value for a given option name. */
  getOption(name: string): unknown;

  /** Returns true if an InputOption object exists by name. */
  hasOption(name: string): boolean;

  /** Is this input means interactive? */
  isInteractive(): boolean;
}
