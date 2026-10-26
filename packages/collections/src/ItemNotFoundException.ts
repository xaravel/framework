// Laravel's `Illuminate\Support\ItemNotFoundException` (v13.37.0): thrown by `sole()` and `firstOrFail()` when no item
// matches. It extends the runtime's SPL `RuntimeException` (AD-19), as Upstream's extends PHP's.
import { registerClass, RuntimeException } from "@xaravel/runtime";

/** No item was found: Laravel's `ItemNotFoundException`. */
export class ItemNotFoundException extends RuntimeException {}

registerClass("Illuminate\\Support\\ItemNotFoundException", ItemNotFoundException);
