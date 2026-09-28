import fs from "node:fs";
import path from "node:path";
import sqlite3 from "sqlite3";
import type { Database, RunResult } from "sqlite3";
import { env } from "../config/env.js";
import { SCHEMA_SQL } from "./schema.js";

const IN_MEMORY_DB_FILE = ":memory:";
const BUSY_TIMEOUT_MS = 5000;

let connection: Database | null = null;

export function isConnected(): boolean {
  return connection !== null;
}

function getConnection(): Database {
  if (connection === null) {
    throw new Error("SQLite connection is not open. Call initializeDatabase() first.");
  }
  return connection;
}

/**
 * Opens the sqlite database file (creating it when missing).
 */
export function connect(): Promise<Database> {
  const current = connection;
  if (current !== null) {
    return Promise.resolve(current);
  }

  const { dbFile } = env;
  if (dbFile !== IN_MEMORY_DB_FILE) {
    fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  }

  return new Promise<Database>((resolve, reject) => {
    const db = new sqlite3.Database(dbFile, (error) => {
      if (error) {
        reject(error);
        return;
      }
      db.configure("busyTimeout", BUSY_TIMEOUT_MS);
      connection = db;
      resolve(db);
    });
  });
}

/**
 * Applies pragmas + schema and returns the ready-to-use connection.
 */
export async function initializeDatabase(): Promise<Database> {
  const db = await connect();
  await exec("PRAGMA foreign_keys = ON;");
  if (env.dbFile !== IN_MEMORY_DB_FILE) {
    await exec("PRAGMA journal_mode = WAL;");
  }
  await exec(SCHEMA_SQL);
  return db;
}

export function close(): Promise<void> {
  const db = connection;
  if (db === null) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    db.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      connection = null;
      resolve();
    });
  });
}

/**
 * Executes a write statement (INSERT/UPDATE/DELETE/DDL).
 */
export function run(sql: string, params: unknown[] = []): Promise<RunResult> {
  return new Promise<RunResult>((resolve, reject) => {
    getConnection().run(sql, params, function onRun(this: RunResult, error: Error | null) {
      if (error) {
        reject(error);
        return;
      }
      resolve(this);
    });
  });
}

/**
 * Returns the first row or `undefined`.
 */
export function get<Row>(sql: string, params: unknown[] = []): Promise<Row | undefined> {
  return new Promise<Row | undefined>((resolve, reject) => {
    getConnection().get<Row>(sql, params, (error: Error | null, row: Row) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(row);
    });
  });
}

/**
 * Returns every matching row.
 */
export function all<Row>(sql: string, params: unknown[] = []): Promise<Row[]> {
  return new Promise<Row[]>((resolve, reject) => {
    getConnection().all<Row>(sql, params, (error: Error | null, rows: Row[]) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(rows);
    });
  });
}

/**
 * Executes one or many statements without parameters (used for schema setup).
 */
export function exec(sql: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    getConnection().exec(sql, (error: Error | null) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
