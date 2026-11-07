/**
 * Defines the application authentication boundary for HTTP and session verification.
 * Provider implementations own credential handling and return session headers.
 * Callers depend on verified identity rather than provider or database details.
 */
import type { User } from "../../domain/identity/types.ts";

export interface AuthenticationSession { user: User }
export interface AuthenticationResult { session: AuthenticationSession | null; headers: Headers }
export interface AuthenticationService {
  /**
   * Processes an authentication request.
   * @param request - Incoming authentication request.
   * @returns The operation result, or rejects when it cannot be completed.
   */
  handle(request: Request): Promise<Response>;
  /**
   * Verifies a session and returns provider response headers.
   * @param headers - Request headers carrying session credentials.
   * @returns The operation result, or rejects when it cannot be completed.
   */
  getSession(headers: Headers): Promise<AuthenticationResult>;
}
