// Illuminate\Database\Grammar, as a contract names it (AD-1.2): a subset of its public methods.
import type { Expression } from "../database/query/Expression";
import type { PhpArrayLike } from "./PhpArrayLike";

/** A database grammar. */
export interface Grammar {
  /** Wrap an array of values. */
  wrapArray(values: PhpArrayLike): PhpArrayLike;

  /** Wrap a table in keyword identifiers. */
  wrapTable(table: Expression | string, prefix?: string | null): string;

  /** Wrap a value in keyword identifiers. */
  wrap(value: Expression | string): string;

  /** Convert an array of column names into a delimited string. */
  columnize(columns: PhpArrayLike): string;

  /** Quote the given string literal. */
  quoteString(value: string | PhpArrayLike): string;

  /** Determine if the given value is a raw expression. */
  isExpression(value: unknown): boolean;

  /** Transforms expressions to their scalar types. */
  getValue(expression: Expression | string | number): string | number;

  /** Get the format for database stored dates. */
  getDateFormat(): string;

  /** Get the grammar's table prefix. */
  getTablePrefix(): string;
}
