import { auth } from '@/auth';

// Next.js 16 renamed `middleware` → `proxy`; Auth.js docs use the same name.
export const proxy = auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const isLoginPage = nextUrl.pathname === '/login';
  // /api/auth is excluded by the matcher; any other /api/* fetch should get a JSON 401
  // rather than an HTML redirect — fetch can't follow into a sign-in page.
  const isApi = nextUrl.pathname.startsWith('/api/');

  if (!isLoggedIn && !isLoginPage) {
    if (isApi) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
    const url = new URL('/login', nextUrl);
    if (nextUrl.pathname !== '/') {
      url.searchParams.set('callbackUrl', nextUrl.pathname + nextUrl.search);
    }
    return Response.redirect(url);
  }

  if (isLoggedIn && isLoginPage) {
    return Response.redirect(new URL('/', nextUrl));
  }
});

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|_next/data|favicon.ico).*)'],
};
