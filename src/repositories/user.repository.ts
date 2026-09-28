import { get, run } from "../db/database.js";
import type { CreateUserInput, User, UserPublicRow, UserRow } from "../types/user.js";
import { toUser } from "../types/user.js";

const PUBLIC_COLUMNS = "id, username, created_at, updated_at";

/**
 * Returns the full row (including the password hash) for login verification.
 * Usernames are matched case-sensitively, exactly like the UNIQUE constraint.
 */
export async function findByUsername(username: string): Promise<UserRow | null> {
  const row = await get<UserRow>(
    `SELECT ${PUBLIC_COLUMNS}, password FROM users WHERE username = ?`,
    [username],
  );
  return row ?? null;
}

export async function findById(id: number): Promise<User | null> {
  const row = await get<UserPublicRow>(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`, [id]);
  return row === undefined ? null : toUser(row);
}

/** Full row including the password hash, needed to validate refresh tokens. */
export async function findByIdWithPassword(id: number): Promise<UserRow | null> {
  const row = await get<UserRow>(`SELECT ${PUBLIC_COLUMNS}, password FROM users WHERE id = ?`, [id]);
  return row ?? null;
}

/**
 * Replaces the password hash. Every refresh token issued before this call stops
 * working, because their fingerprint no longer matches the new hash.
 */
export async function updatePassword(id: number, passwordHash: string): Promise<boolean> {
  const result = await run(
    "UPDATE users SET password = ?, updated_at = datetime('now') WHERE id = ?",
    [passwordHash, id],
  );
  return result.changes > 0;
}

export async function usernameExists(username: string): Promise<boolean> {
  const row = await get<{ id: number }>("SELECT id FROM users WHERE username = ?", [username]);
  return row !== undefined;
}

export async function create(input: CreateUserInput): Promise<User> {
  const result = await run("INSERT INTO users (username, password) VALUES (?, ?)", [
    input.username,
    input.passwordHash,
  ]);

  const created = await findById(result.lastID);
  if (created === null) {
    throw new Error(`User ${result.lastID} was inserted but could not be read back`);
  }
  return created;
}
