/**
 * Idempotent schema definition, executed on every application start.
 * Add new `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE` statements at the end.
 */
export const SCHEMA_SQL = /*sql*/`
  CREATE TABLE IF NOT EXISTS todos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT    NOT NULL,
    description TEXT,
    completed   INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_todos_completed ON todos (completed);

  CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT    NOT NULL,
    price       REAL    NOT NULL,
    description TEXT,
    category    TEXT,
    images      TEXT,
    created_at  TEXT    NOT NULL,
    created_by  TEXT,
    created_by_id INTEGER,
    updated_at  TEXT    NOT NULL,
    updated_by  TEXT,
    updated_by_id INTEGER
  );

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    password      TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`;
