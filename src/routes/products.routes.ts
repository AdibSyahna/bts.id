import { Router } from "express";
import type { Request } from "express";
import { currentUser, requireAuth } from "../middleware/auth.js";
import * as productsRepository from "../repositories/products.repository.js";
import type {
  CreateProductInput,
  ProductFilters,
  ProductSort,
  UpdateProductInput,
} from "../types/product.js";
import { PRODUCT_SORTS } from "../types/product.js";
import { asyncHandler } from "../utils/async-handler.js";
import { HttpError } from "../utils/http-error.js";
import {
  assertKnownFields,
  assertPlainObject,
  parseId,
  parseOrder,
  readCountQuery,
  readNumberQuery,
  readOptionalNumber,
  readOptionalString,
  readOptionalStringArray,
  readRequiredNumber,
  readRequiredString,
  readStringQuery,
} from "../utils/validation.js";

const PRODUCT_FIELDS = ["title", "price", "description", "category", "images"] as const;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_OFFSET = 1_000_000;
const MAX_PAGE = 1_000_000;
const MAX_PRICE = 1_000_000_000;
const DESCRIPTION_MAX_LENGTH = 4000;
const CATEGORY_MAX_LENGTH = 80;

export const productsRouter = Router();

function parseSort(rawValue: unknown): ProductSort {
  if (rawValue === undefined) {
    return "id";
  }
  if (typeof rawValue !== "string") {
    throw HttpError.badRequest("Invalid sort: expected a single value");
  }
  const normalized = rawValue.trim().toLowerCase();
  const sort = PRODUCT_SORTS.find((candidate) => candidate === normalized);
  if (sort === undefined) {
    throw HttpError.badRequest(
      `Invalid sort "${rawValue}": expected one of ${PRODUCT_SORTS.join(", ")}`,
    );
  }
  return sort;
}

interface ProductListQuery {
  filters: ProductFilters;
  /** 1-based page, derived from the page or offset parameter. */
  page: number;
}

function parseListQuery(query: Request["query"]): ProductListQuery {
  const pageProvided = query.page !== undefined;
  const offsetProvided = query.offset !== undefined;
  if (pageProvided && offsetProvided) {
    throw HttpError.badRequest("Use either page or offset, not both");
  }

  const limit = readCountQuery(query.limit, "limit", {
    fallback: DEFAULT_LIMIT,
    min: 1,
    max: MAX_LIMIT,
  });
  const page = readCountQuery(query.page, "page", { fallback: 1, min: 1, max: MAX_PAGE });
  const offset = readCountQuery(query.offset, "offset", { fallback: 0, min: 0, max: MAX_OFFSET });

  const effectiveOffset = pageProvided ? (page - 1) * limit : offset;
  if (effectiveOffset > MAX_OFFSET) {
    throw HttpError.badRequest(
      "Requested page is out of range: offset must not exceed " + MAX_OFFSET,
    );
  }
  const effectivePage = pageProvided ? page : Math.floor(offset / limit) + 1;

  const filters: ProductFilters = {
    sort: parseSort(query.sort),
    order: parseOrder(readStringQuery(query.order, "order")),
    limit,
    offset: effectiveOffset,
  };

  // search filters the product name; q stays supported as an alias.
  const search = readStringQuery(query.search, "search") ?? readStringQuery(query.q, "q");
  if (search !== undefined) {
    filters.search = search;
  }

  const category = readStringQuery(query.category, "category", CATEGORY_MAX_LENGTH);
  if (category !== undefined) {
    filters.category = category;
  }

  const minPrice = readNumberQuery(query.minPrice, "minPrice", { min: 0, max: MAX_PRICE });
  if (minPrice !== undefined) {
    filters.minPrice = minPrice;
  }

  const maxPrice = readNumberQuery(query.maxPrice, "maxPrice", { min: 0, max: MAX_PRICE });
  if (maxPrice !== undefined) {
    filters.maxPrice = maxPrice;
  }

  return { filters, page: effectivePage };
}

productsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { filters, page } = parseListQuery(req.query);
    const [items, total] = await Promise.all([
      productsRepository.findAll(filters),
      productsRepository.count(filters),
    ]);

    res.json({
      data: items,
      meta: {
        count: items.length,
        total,
        limit: filters.limit,
        page,
        offset: filters.offset,
        totalPages: Math.ceil(total / filters.limit),
        hasNextPage: filters.offset + items.length < total,
        hasPreviousPage: page > 1,
        sort: filters.sort,
        order: filters.order,
      },
    });
  }),
);

productsRouter.get(
  "/:id",
  asyncHandler<{ id: string }>(async (req, res) => {
    const id = parseId(req.params.id);
    const product = await productsRepository.findById(id);
    if (product === null) {
      throw HttpError.notFound(`Product ${id} was not found`);
    }
    res.json({ data: product });
  }),
);

productsRouter.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = assertPlainObject(req.body);
    assertKnownFields(body, PRODUCT_FIELDS);

    const input: CreateProductInput = {
      title: readRequiredString(body, "title"),
      price: readRequiredNumber(body, "price", { min: 0, max: MAX_PRICE }),
    };

    const description = readOptionalString(body, "description", {
      maxLength: DESCRIPTION_MAX_LENGTH,
    });
    if (description !== undefined) {
      input.description = description;
    }

    const category = readOptionalString(body, "category", { maxLength: CATEGORY_MAX_LENGTH });
    if (category !== undefined) {
      input.category = category;
    }

    if (typeof body.images === "string") {
      // wrap in array
      body.images = [body.images];
    }

    const images = readOptionalStringArray(body, "images");
    if (images !== undefined) {
      input.images = images;
    }

    const product = await productsRepository.create(input, currentUser(req));
    res.status(201).json({ data: product });
  }),
);

// Any authenticated user may change products; the audit columns record who did.
// To restrict this to the original author, compare currentUser(req).id with the
// product's createdById and throw HttpError.forbidden(...) when they differ.
productsRouter.patch(
  "/:id",
  requireAuth,
  asyncHandler<{ id: string }>(async (req, res) => {
    const id = parseId(req.params.id);
    const body = assertPlainObject(req.body);
    assertKnownFields(body, PRODUCT_FIELDS);

    const input: UpdateProductInput = {};

    if ("title" in body) {
      input.title = readRequiredString(body, "title");
    }

    const price = readOptionalNumber(body, "price", { min: 0, max: MAX_PRICE });
    if (price !== undefined) {
      input.price = price;
    }

    const description = readOptionalString(body, "description", {
      maxLength: DESCRIPTION_MAX_LENGTH,
    });
    if (description !== undefined) {
      input.description = description;
    }

    const category = readOptionalString(body, "category", { maxLength: CATEGORY_MAX_LENGTH });
    if (category !== undefined) {
      input.category = category;
    }

    const images = readOptionalStringArray(body, "images");
    if (images !== undefined) {
      input.images = images;
    }

    if (Object.keys(input).length === 0) {
      throw HttpError.badRequest(
        "Request body must contain at least one of: title, price, description, category, images",
      );
    }

    const product = await productsRepository.update(id, input, currentUser(req));
    if (product === null) {
      throw HttpError.notFound(`Product ${id} was not found`);
    }
    res.json({ data: product });
  }),
);

productsRouter.delete(
  "/:id",
  requireAuth,
  asyncHandler<{ id: string }>(async (req, res) => {
    const id = parseId(req.params.id);
    const deleted = await productsRepository.remove(id);
    if (!deleted) {
      throw HttpError.notFound(`Product ${id} was not found`);
    }
    res.status(204).end();
  }),
);
