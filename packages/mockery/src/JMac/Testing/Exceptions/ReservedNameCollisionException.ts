// `JMac\Testing\Exceptions\ReservedNameCollisionException` (jasonmccreary/double v1.0.1): the target declares a
// method named like one of Double's control verbs. Internal.
import { FQCN } from "../../../support/values";
import { DoubleException } from "./DoubleException";

function render(target: string, collisions: readonly string[]): string {
  const backticked = collisions.map((name) => `\`${name}\``);
  const last = backticked.pop() ?? "";
  const names = backticked.length === 0 ? last : `${backticked.join(", ")} and ${last}`;
  let message = `Can't create a double for \`${target}\`. It contains ${names} which ${collisions.length === 1 ? "collides" : "collide"} with Double's internal methods.`;
  if (!target.includes("&")) {
    message += ` You may use \`Double::for(${target}::class, override: true)\` to overcome this.`;
  }
  return message;
}

export class ReservedNameCollisionException extends DoubleException {
  static override readonly [FQCN]: string = "JMac\\Testing\\Exceptions\\ReservedNameCollisionException";

  constructor(
    readonly target: string,
    readonly collisions: readonly string[],
  ) {
    super(DoubleException.lead(render(target, collisions)));
  }

  static forCollisions(target: string, collisions: readonly string[]): ReservedNameCollisionException {
    return new ReservedNameCollisionException(target, collisions);
  }
}
