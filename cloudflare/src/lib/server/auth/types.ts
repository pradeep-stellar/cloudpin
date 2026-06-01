export type AccessIdentity = {
  email: string;
  subject: string;
  issuer: string;
  audience: string;
  expiresAt: number;
};

export type SessionUser = {
  id: number;
  email: string;
  username: string;
  displayName: string | null;
  isAdmin: boolean;
};

export type AuthState =
  | { kind: 'unauthenticated' }
  | { kind: 'api_token'; user: SessionUser; tokenId: number }
  | { kind: 'browser_session'; user: SessionUser; sessionId: string };

export type AuthContext = {
  state: AuthState;
  requestId: string;
  origin: string | null;
  isMutation: boolean;
};
