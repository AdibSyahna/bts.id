/** Columns that are safe to pass to `toUser()`. */
export interface UserPublicRow {
  id: number;
  username: string;
  created_at: string;
  updated_at: string;
}

/**
 * Row shape exactly as stored in the sqlite `users` table (includes the hash).
 */
export interface UserRow extends UserPublicRow {
  password: string;
}

/**
 * API representation of an account. Never carries the password hash.
 */
export interface User {
  id: number;
  username: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Identity derived from a verified access token and attached to a request.
 */
export interface AuthUser {
  id: number;
  username: string;
}

export interface CreateUserInput {
  username: string;
  passwordHash: string;
}

export interface IssuedTokens {
  token: string;
  tokenType: "Bearer";
  expiresIn: number;
  /** Opaque to the client: a signed JWT bound to the current password hash. */
  refreshToken: string;
  refreshExpiresIn: number | null;
  refreshTokenExpiresAt: string | null;
}

/**
 * Response body of login, refresh and password change.
 */
export interface AuthResult extends IssuedTokens {
  user: User;
}

export function toUser(row: UserPublicRow): User {
  return {
    id: row.id,
    username: row.username,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toAuthUser(user: User): AuthUser {
  return { id: user.id, username: user.username };
}
