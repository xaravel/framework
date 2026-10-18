// PHPUnit 13.4.3's `Constraint\DirectoryExists` (Story 4.4): `is_dir()`. Internal to the grader.
import { statSync } from "node:fs";
import { Constraint } from "../../Constraint";

/** PHP's `is_dir()`: the path (symlinks followed) is a directory. */
export function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function path(other: unknown): string {
  return typeof other === "string" ? other : "";
}

export class DirectoryExists extends Constraint {
  toString(): string {
    return "directory exists";
  }

  override negatedToString(): string {
    return "directory does not exist";
  }

  protected override matches(other: unknown): boolean {
    return typeof other === "string" && isDir(other);
  }

  override failureDescription(other: unknown): string {
    return `directory "${path(other)}" exists`;
  }

  override negatedFailureDescription(other: unknown): string {
    return `directory "${path(other)}" does not exist`;
  }
}
