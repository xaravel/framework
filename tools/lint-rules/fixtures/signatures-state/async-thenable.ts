// Story 6.3 fixture: fails `xaravel/no-async-thenable-return` only, at any placement.
import { Builder } from "./support";

export class Repository {
  async find(): Promise<readonly string[]> {
    return new Builder();
  }
}
