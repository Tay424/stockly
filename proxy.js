import { NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// ponytail: cookie-presence check only — it's an optimistic redirect, not the guard.
// Real role enforcement lives in requireUser/requireAdmin (lib/session.js).
export function proxy(request) {
  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/change-password"],
};
