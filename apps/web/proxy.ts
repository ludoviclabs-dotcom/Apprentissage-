import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const protectedPathPattern = /^\/(?!_next\/|favicon.ico|robots.txt|sitemap.xml|api\/health).*/;

function isAuthEnabled() {
  return process.env.LEARNING_HUB_AUTH_ENABLED === "true";
}

function unauthorized() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Finance Learning Hub"'
    }
  });
}

function isAuthorized(request: NextRequest) {
  const user = process.env.LEARNING_HUB_AUTH_USER;
  const password = process.env.LEARNING_HUB_AUTH_PASSWORD;

  if (!user || !password) {
    return false;
  }

  const header = request.headers.get("authorization");

  if (!header?.startsWith("Basic ")) {
    return false;
  }

  const decoded = atob(header.slice("Basic ".length));
  const separatorIndex = decoded.indexOf(":");

  if (separatorIndex === -1) {
    return false;
  }

  return decoded.slice(0, separatorIndex) === user && decoded.slice(separatorIndex + 1) === password;
}

export function proxy(request: NextRequest) {
  if (!isAuthEnabled() || !protectedPathPattern.test(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  if (!isAuthorized(request)) {
    return unauthorized();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
