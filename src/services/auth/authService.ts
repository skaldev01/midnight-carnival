import "server-only";

import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/lib/auth";

export type AuthedSession = Session & { accessToken: string };

/**
 * Returns the current session and its Google access token, or null if the
 * user isn't authenticated. Use in route handlers as the first guard.
 */
export async function getAuthedSession(): Promise<AuthedSession | null> {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) return null;
  if (session.error) return null;
  return session as AuthedSession;
}
