// Story 6.3 fixture: fails `xaravel/no-dynamic-column-default` only, at any placement.
import { Model } from "./support";

export class Post extends Model {
  createdAt = new Date();
}
