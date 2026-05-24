// Augment NextAuth's Session and JWT to carry the Google access token.
// Used by route handlers when talking to the Drive API on the user's behalf.

import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    error?: "RefreshAccessTokenError" | "NoRefreshToken";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    /** Unix milliseconds when the access token expires. */
    expiresAt?: number;
    error?: "RefreshAccessTokenError" | "NoRefreshToken";
  }
}
