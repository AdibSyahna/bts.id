import { all, get, run } from "../db/database.js";
import type { CreateTodoInput, Todo, TodoFilters, TodoRow, UpdateTodoInput } from "../types/todo.js";
import { toTodo } from "../types/todo.js";

const SELECT_COLUMNS = "id, title, description, completed, created_at, updated_at";

export async function findAll(filters: TodoFilters = {}): Promise<Todo[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.completed !== undefined) {
    conditions.push("completed = ?");
    params.push(filters.completed ? 1 : 0);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const direction = filters.order === "asc" ? "ASC" : "DESC";
  const sql = `SELECT ${SELECT_COLUMNS} FROM todos ${whereClause} ORDER BY id ${direction}`;

  const rows = await all<TodoRow>(sql, params);
  return rows.map(toTodo);
}

export async function findById(id: number): Promise<Todo | null> {
  const row = await get<TodoRow>(`SELECT ${SELECT_COLUMNS} FROM todos WHERE id = ?`, [id]);
  return row === undefined ? null : toTodo(row);
}

export async function exists(id: number): Promise<boolean> {
  const row = await get<{ id: number }>("SELECT id FROM todos WHERE id = ?", [id]);
  return row !== undefined;
}

export async function create(input: CreateTodoInput): Promise<Todo> {
  const result = await run(
    "INSERT INTO todos (title, description, completed) VALUES (?, ?, ?)",
    [input.title, input.description ?? null, input.completed === true ? 1 : 0],
  );

  const created = await findById(result.lastID);
  if (created === null) {
    throw new Error(`Todo ${result.lastID} was inserted but could not be read back`);
  }
  return created;
}

export async function update(id: number, input: UpdateTodoInput): Promise<Todo | null> {
  const assignments: string[] = [];
  const params: unknown[] = [];

  if (input.title !== undefined) {
    assignments.push("title = ?");
    params.push(input.title);
  }
  if (input.description !== undefined) {
    assignments.push("description = ?");
    params.push(input.description);
  }
  if (input.completed !== undefined) {
    assignments.push("completed = ?");
    params.push(input.completed ? 1 : 0);
  }

  if (assignments.length === 0) {
    return findById(id);
  }

  assignments.push("updated_at = datetime('now')");
  params.push(id);

  const result = await run(`UPDATE todos SET ${assignments.join(", ")} WHERE id = ?`, params);
  if (result.changes === 0) {
    return null;
  }
  return findById(id);
}

export async function remove(id: number): Promise<boolean> {
  const result = await run("DELETE FROM todos WHERE id = ?", [id]);
  return result.changes > 0;
}

export async function removeCompleted(): Promise<number> {
  const result = await run("DELETE FROM todos WHERE completed = 1");
  return result.changes;
}
