/**
 * Row shape exactly as stored in the sqlite `todos` table.
 */
export interface TodoRow {
  id: number;
  title: string;
  description: string | null;
  completed: number;
  created_at: string;
  updated_at: string;
}

/**
 * API representation of a todo item (booleans + camelCase).
 */
export interface Todo {
  id: number;
  title: string;
  description: string | null;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTodoInput {
  title: string;
  description?: string | null;
  completed?: boolean;
}

export type UpdateTodoInput = Partial<CreateTodoInput>;

export interface TodoFilters {
  completed?: boolean;
  order?: "asc" | "desc";
}

export function toTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    completed: row.completed === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
