import { all, get, run } from "../db/database.js";
import type {
  CreateProductInput,
  Product,
  ProductFilters,
  ProductRow,
  ProductSort,
  UpdateProductInput,
} from "../types/product.js";
import { serializeImages, toProduct } from "../types/product.js";
import type { AuthUser } from "../types/user.js";

const SELECT_COLUMNS =
  "id, title, price, description, category, images, created_at, created_by, created_by_id, updated_at, updated_by, updated_by_id";

/** Whitelist so the sort key can never be used to inject SQL. */
const SORT_COLUMNS: Record<ProductSort, string> = {
  id: "id",
  price: "price",
  title: "title",
};

const LIKE_ESCAPE = "\\";

interface WhereClause {
  sql: string;
  params: unknown[];
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `${LIKE_ESCAPE}${character}`);
}

/** Builds the shared filter clause; all values stay bound parameters. */
function buildWhere(filters: ProductFilters): WhereClause {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.search !== undefined) {
    // Matches the product name (title) only; LIKE is case-insensitive for ASCII.
    // Add "OR description LIKE ?" with a second bound pattern to widen it.
    conditions.push(`title LIKE ? ESCAPE '${LIKE_ESCAPE}'`);
    params.push(`%${escapeLikePattern(filters.search)}%`);
  }
  if (filters.category !== undefined) {
    conditions.push("category = ?");
    params.push(filters.category);
  }
  if (filters.minPrice !== undefined) {
    conditions.push("price >= ?");
    params.push(filters.minPrice);
  }
  if (filters.maxPrice !== undefined) {
    conditions.push("price <= ?");
    params.push(filters.maxPrice);
  }

  return {
    sql: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

export async function findAll(filters: ProductFilters): Promise<Product[]> {
  const where = buildWhere(filters);
  const column = SORT_COLUMNS[filters.sort];
  const direction = filters.order === "asc" ? "ASC" : "DESC";
  const sql = `SELECT ${SELECT_COLUMNS} FROM products ${where.sql}
               ORDER BY ${column} ${direction}, id ${direction} LIMIT ? OFFSET ?`;

  const rows = await all<ProductRow>(sql, [...where.params, filters.limit, filters.offset]);
  return rows.map(toProduct);
}

export async function count(filters: ProductFilters): Promise<number> {
  const where = buildWhere(filters);
  const row = await get<{ total: number }>(
    `SELECT COUNT(*) AS total FROM products ${where.sql}`,
    where.params,
  );
  return row?.total ?? 0;
}

export async function findById(id: number): Promise<Product | null> {
  const row = await get<ProductRow>(`SELECT ${SELECT_COLUMNS} FROM products WHERE id = ?`, [id]);
  return row === undefined ? null : toProduct(row);
}

export async function create(input: CreateProductInput, author: AuthUser): Promise<Product> {
  const result = await run(
    `INSERT INTO products
       (title, price, description, category, images,
        created_at, created_by, created_by_id, updated_at, updated_by, updated_by_id)
     VALUES (?, ?, ?, ?, ?, datetime('now'), ?, ?, datetime('now'), ?, ?)`,
    [
      input.title,
      input.price,
      input.description ?? null,
      input.category ?? null,
      serializeImages(input.images),
      author.username,
      author.id,
      author.username,
      author.id,
    ],
  );

  const created = await findById(result.lastID);
  if (created === null) {
    throw new Error(`Product ${result.lastID} was inserted but could not be read back`);
  }
  return created;
}

export async function update(
  id: number,
  input: UpdateProductInput,
  author: AuthUser,
): Promise<Product | null> {
  const assignments: string[] = [];
  const params: unknown[] = [];

  if (input.title !== undefined) {
    assignments.push("title = ?");
    params.push(input.title);
  }
  if (input.price !== undefined) {
    assignments.push("price = ?");
    params.push(input.price);
  }
  if (input.description !== undefined) {
    assignments.push("description = ?");
    params.push(input.description);
  }
  if (input.category !== undefined) {
    assignments.push("category = ?");
    params.push(input.category);
  }
  if (input.images !== undefined) {
    assignments.push("images = ?");
    params.push(serializeImages(input.images));
  }

  if (assignments.length === 0) {
    return findById(id);
  }

  assignments.push("updated_at = datetime('now')", "updated_by = ?", "updated_by_id = ?");
  params.push(author.username, author.id, id);

  const result = await run(`UPDATE products SET ${assignments.join(", ")} WHERE id = ?`, params);
  if (result.changes === 0) {
    return null;
  }
  return findById(id);
}

export async function remove(id: number): Promise<boolean> {
  const result = await run("DELETE FROM products WHERE id = ?", [id]);
  return result.changes > 0;
}
