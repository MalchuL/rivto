/**
 * Provides Better Auth's generated React client for the shared local UI.
 * Requests use the current host origin so browser and dynamic Electron ports
 * share the same authentication flow without exposing server configuration.
 */
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
