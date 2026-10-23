// Illuminate\Contracts\Validation\UncompromisedVerifier, from laravel/framework v13.37.0.
import { contract } from "../Contract";
import type { PhpArrayLike } from "../structural/PhpArrayLike";

declare const UncompromisedVerifierBrand: unique symbol;

export interface UncompromisedVerifier {
  readonly [UncompromisedVerifier.brand]: true;

  /**
   * Verify that the given data has not been compromised in data leaks.
   * @asyncRoot Http\Client\PendingRequest.send
   */
  verify(data: PhpArrayLike): Promise<boolean>;
}

export const UncompromisedVerifier = contract<UncompromisedVerifier, typeof UncompromisedVerifierBrand>(
  "Illuminate\\Contracts\\Validation\\UncompromisedVerifier",
  {
    verify: ["data"],
  },
);
