// Illuminate\Contracts\Auth\Middleware\AuthenticatesRequests, from laravel/framework v13.37.0.
import { contract } from "../../Contract";

declare const AuthenticatesRequestsBrand: unique symbol;

export interface AuthenticatesRequests {
  readonly [AuthenticatesRequests.brand]: true;
}

export const AuthenticatesRequests = contract<AuthenticatesRequests, typeof AuthenticatesRequestsBrand>("Illuminate\\Contracts\\Auth\\Middleware\\AuthenticatesRequests");
