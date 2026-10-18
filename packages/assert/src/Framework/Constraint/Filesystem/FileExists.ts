// PHPUnit 13.4.3's `Constraint\FileExists` (Story 4.4): `file_exists()`. Internal to the grader.
import { statSync } from "node:fs";
import { Constraint } from "../../Constraint";

/** PHP's `file_exists()`: a file or directory exists at the path (symlinks followed). */
export function fileExists(path: string): boolean {
  if (path === "" || path.includes("\0")) {
    return false;
  }
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

function path(other: unknown): string {
  return typeof other === "string" ? other : "";
}

export class FileExists extends Constraint {
  toString(): string {
    return "file exists";
  }

  override negatedToString(): string {
    return "file does not exist";
  }

  protected override matches(other: unknown): boolean {
    return typeof other === "string" && fileExists(other);
  }

  override failureDescription(other: unknown): string {
    return `file "${path(other)}" exists`;
  }

  override negatedFailureDescription(other: unknown): string {
    return `file "${path(other)}" does not exist`;
  }
}
