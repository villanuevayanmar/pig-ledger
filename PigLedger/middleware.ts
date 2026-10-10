import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login'];

/**
 * Session refresh + route protection.
 * - Refreshes the Supabase auth cookie on every matched request.
 * - Unauthenticated visitors are redirected to /login (with ?next=...).
 * - Authenticated visitors are kept away from /login.
 * - When Supabase env vars are missing the app runs in setup mode,
 *   so no redirect is applied.
 */
export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const path = request.nextUrl.pathname;

  if (!supabaseUrl || !supabaseAnonKey) return NextResponse.next();

  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: request.headers } });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  // Validates the session (and refreshes the cookie when expired).
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user && !PUBLIC_PATHS.includes(path)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.search = path === '/' ? '' : `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(redirectUrl);
  }

  if (user && path === '/login') {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    // Static assets, the API routes, and PWA files are excluded;
    // /api/sync performs its own authentication check.
    '/((?!_next/static|_next/image|favicon\\.ico|icons/|sw\\.js$|manifest\\.webmanifest$|api/).*)'
  ]
};
