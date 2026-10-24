// Illuminate\Contracts\Session\Middleware\AuthenticatesSessions, from laravel/framework v13.37.0.
import { contract } from "../../Contract";

declare const AuthenticatesSessionsBrand: unique symbol;

export interface AuthenticatesSessions {
  readonly [AuthenticatesSessions.brand]: true;
}

export const AuthenticatesSessions = contract<AuthenticatesSessions, typeof AuthenticatesSessionsBrand>("Illuminate\\Contracts\\Session\\Middleware\\AuthenticatesSessions");
