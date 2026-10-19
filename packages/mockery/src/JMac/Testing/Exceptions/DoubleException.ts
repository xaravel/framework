// `JMac\Testing\Exceptions\DoubleException` (jasonmccreary/double v1.0.1): the base of Double's own exceptions
// (a `\RuntimeException`), and the message helpers its PHPUnit variants share. Internal.
import { RuntimeException } from "../../../php/RuntimeException";
import { FQCN } from "../../../support/values";

export abstract class DoubleException extends RuntimeException {
  static override readonly [FQCN]: string = "JMac\\Testing\\Exceptions\\DoubleException";

  getDiagnostic(): this {
    return this;
  }

  static fabricatedNote(fabricated: boolean): string {
    if (!fabricated) {
      return "";
    }
    return "\n\nNote: this double was returned automatically. You will need to configure it explicitly if you want it to behave differently.";
  }

  static appendFabricatedNote(message: string, fabricated: boolean): string {
    const note = DoubleException.fabricatedNote(fabricated);
    return note === "" ? message : message.replace(/\n+$/, "") + note;
  }

  /** A leading newline puts the message on its own line after PHPUnit's `FQCN: `. */
  static lead(message: string): string {
    return `\n${message}`;
  }

  static passthruNote(passthru: boolean): string {
    if (!passthru) {
      return "";
    }
    return "\n\nNote: this double is in passthru mode, but using `expects()` means every call needs to be configured. Use `allows()` instead if you want unmatched calls to run for real.";
  }

  static appendPassthruNote(message: string, passthru: boolean): string {
    const note = DoubleException.passthruNote(passthru);
    return note === "" ? message : message.replace(/\n+$/, "") + note;
  }

  /** A variable name for a code snippet, from a double's label (`SecondLink` -> `secondLink`). */
  static suggestedVariableName(label: string): string {
    const sanitized = label.replace(/[^A-Za-z0-9_]/g, "");
    return sanitized === "" || /^[0-9]/.test(sanitized) ? "double" : sanitized.charAt(0).toLowerCase() + sanitized.slice(1);
  }
}
