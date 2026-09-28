/**
 * Row shape exactly as stored in the sqlite `products` table.
 * `images` is a JSON encoded array of urls kept in a TEXT column.
 */
export interface ProductRow {
  id: number;
  title: string;
  price: number;
  description: string | null;
  category: string | null;
  images: string | null;
  created_at: string;
  created_by: string | null;
  /**
   * Declared INTEGER, but SQLite column affinity means values bound into a TEXT
   * column come back as strings (databases created before that was corrected),
   * so both shapes are accepted and normalised by `toId`.
   */
  created_by_id: number | string | null;
  updated_at: string;
  updated_by: string | null;
  updated_by_id: number | string | null;
}

/** Normalises ids that may be stored as TEXT (legacy column affinity). */
function toId(value: number | string | null): number | null {
  if (value === null) {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

/**
 * API representation of a product (images decoded, audit fields flattened).
 */
export interface Product {
  id: number;
  title: string;
  price: number;
  description: string | null;
  category: string | null;
  images: string[];
  createdAt: string;
  createdBy: string | null;
  createdById: number | null;
  updatedAt: string;
  updatedBy: string | null;
  updatedById: number | null;
}

export interface CreateProductInput {
  title: string;
  price: number;
  description?: string | null;
  category?: string | null;
  images?: string[];
}

export type UpdateProductInput = Partial<CreateProductInput>;

export const PRODUCT_SORTS = ["id", "price", "title"] as const;

export type ProductSort = (typeof PRODUCT_SORTS)[number];

export interface ProductFilters {
  search?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  sort: ProductSort;
  order: "asc" | "desc";
  limit: number;
  offset: number;
}

export function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    title: row.title,
    price: row.price,
    description: row.description,
    category: row.category,
    images: parseImages(row.images),
    createdAt: row.created_at,
    createdBy: row.created_by,
    createdById: toId(row.created_by_id),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    updatedById: toId(row.updated_by_id),
  };
}

export function parseImages(raw: string | null): string[] {
  if (raw === null || raw === "") {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
}

export function serializeImages(images: string[] | undefined): string | null {
  if (images === undefined || images.length === 0) {
    return null;
  }
  return JSON.stringify(images);
}
