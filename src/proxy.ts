import { auth } from "@/auth";

export default auth((req) => {
  if (!req.auth) {
    return Response.redirect(new URL("/", req.nextUrl.origin));
  }
});

export const config = {
  matcher: ["/dashboard/:path*"],
};
