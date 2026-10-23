// Illuminate\Contracts\Queue\ShouldBeEncrypted, from laravel/framework v13.37.0.
import { contract } from "../Contract";

declare const ShouldBeEncryptedBrand: unique symbol;

export interface ShouldBeEncrypted {
  readonly [ShouldBeEncrypted.brand]: true;
}

export const ShouldBeEncrypted = contract<ShouldBeEncrypted, typeof ShouldBeEncryptedBrand>("Illuminate\\Contracts\\Queue\\ShouldBeEncrypted");
