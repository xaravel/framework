// Retro 6 item 11 fixture: an `async` method returning a thenable `Builder`
// that a sync call produced. The syntactic `xaravel/no-async-thenable-return`
// cannot see through `this.query()`; the type-aware `typescript/return-await`
// (`always`), on for framework packages and Ported Tests, reports both
// unawaited returns; `first()` is the fixed form.
import { type Builder, q } from "./builder";

export class Repository {
  query(): Builder {
    return q().where("active");
  }

  async find(): Promise<readonly string[]> {
    return this.query();
  }

  // Unannotated: return-await reports it too.
  async findAll() {
    return this.query();
  }

  // Fixed: the terminal runs explicitly, so it lints clean.
  async first(): Promise<readonly string[]> {
    return await this.query();
  }
}
