import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { SessionData, sessionOptions, isTokenExpired } from "@/lib/session";

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(
    request,
    response,
    sessionOptions
  );

  const { pathname } = request.nextUrl;
  const isPublicPage =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/";

  const hasValidToken =
    !!session.access_token && !isTokenExpired(session.access_token);

  if (!hasValidToken && !isPublicPage) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (hasValidToken && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
