import NextAuth, { type NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

type JwtCallback = NonNullable<NonNullable<NextAuthConfig["callbacks"]>["jwt"]>;
type SessionCallback = NonNullable<NonNullable<NextAuthConfig["callbacks"]>["session"]>;

// Exported standalone so the userId-propagation logic — what ownership checks
// throughout the app ultimately rely on — can be unit tested without going
// through a real OAuth round trip.
export const jwtCallback: JwtCallback = ({ token, account }) => {
  if (account) {
    token.userId = account.providerAccountId;
  }
  return token;
};

export const sessionCallback: SessionCallback = ({ session, token }) => {
  if (session.user) {
    session.user.id = token.userId as string;
  }
  return session;
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub, Google],
  session: { strategy: "jwt" },
  callbacks: {
    jwt: jwtCallback,
    session: sessionCallback,
  },
});
