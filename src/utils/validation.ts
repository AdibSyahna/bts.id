import { HttpError } from "./http-error.js";

export function assertPlainObject(value: unknown, label = "request body"): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw HttpError.badRequest(`Invalid ${label}: expected a JSON object`);
  }
  return value as Record<string, unknown>;
}

export function parseId(rawValue: string | undefined): number {
  const parsed = Number.parseInt(rawValue ?? "", 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw HttpError.badRequest(`Invalid id "${rawValue ?? ""}": expected a positive integer`);
  }
  return parsed;
}

export function parseOrder(rawValue: string | undefined): "asc" | "desc" {
  if (rawValue === undefined) {
    return "desc";
  }
  const normalized = rawValue.trim().toLowerCase();
  if (normalized === "asc" || normalized === "desc") {
    return normalized;
  }
  throw HttpError.badRequest(`Invalid order "${rawValue}": expected "asc" or "desc"`);
}

export function parseBoolean(value: string, label: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") {
    return true;
  }
  if (normalized === "false" || normalized === "0") {
    return false;
  }
  throw HttpError.badRequest(`Invalid ${label} "${value}": expected "true" or "false"`);
}

export interface StringFieldOptions {
  minLength?: number;
  maxLength?: number;
}

export interface NumberFieldOptions {
  min?: number;
  max?: number;
}

function toFiniteNumber(value: unknown, field: string, options: NumberFieldOptions): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(parsed)) {
    throw HttpError.badRequest(`Field "${field}" must be a number`, { field });
  }
  if (options.min !== undefined && parsed < options.min) {
    throw HttpError.badRequest(`Field "${field}" must be greater than or equal to ${options.min}`, { field });
  }
  if (options.max !== undefined && parsed > options.max) {
    throw HttpError.badRequest(`Field "${field}" must be less than or equal to ${options.max}`, { field });
  }
  return parsed;
}

export function readRequiredString(
  source: Record<string, unknown>,
  field: string,
  options: StringFieldOptions = {},
): string {
  const { minLength = 1, maxLength = 200 } = options;
  const value = source[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw HttpError.badRequest(`Field "${field}" is required and must be a non-empty string`, { field });
  }
  const trimmed = value.trim();
  if (trimmed.length < minLength) {
    throw HttpError.badRequest(`Field "${field}" must be at least ${minLength} characters long`, { field });
  }
  if (trimmed.length > maxLength) {
    throw HttpError.badRequest(`Field "${field}" must be at most ${maxLength} characters long`, { field });
  }
  return trimmed;
}

export function readRequiredNumber(
  source: Record<string, unknown>,
  field: string,
  options: NumberFieldOptions = {},
): number {
  if (!(field in source) || source[field] === null || source[field] === "") {
    throw HttpError.badRequest(`Field "${field}" is required and must be a number`, { field });
  }
  return toFiniteNumber(source[field], field, options);
}

export function readOptionalNumber(
  source: Record<string, unknown>,
  field: string,
  options: NumberFieldOptions = {},
): number | undefined {
  if (!(field in source)) {
    return undefined;
  }
  return toFiniteNumber(source[field], field, options);
}

/** Query-string counterpart of readOptionalNumber. */
export function readNumberQuery(
  rawValue: unknown,
  field: string,
  options: NumberFieldOptions = {},
): number | undefined {
  if (rawValue === undefined) {
    return undefined;
  }
  if (typeof rawValue !== "string") {
    throw HttpError.badRequest(`Invalid ${field}: expected a single number`);
  }
  return toFiniteNumber(rawValue, field, options);
}

/** Query-string counterpart of readOptionalString: trims, treats "" as absent. */
export function readStringQuery(
  rawValue: unknown,
  field: string,
  maxLength = 200,
): string | undefined {
  if (rawValue === undefined) {
    return undefined;
  }
  if (typeof rawValue !== "string") {
    throw HttpError.badRequest(`Invalid ${field}: expected a single value`);
  }
  const trimmed = rawValue.trim();
  if (trimmed === "") {
    return undefined;
  }
  if (trimmed.length > maxLength) {
    throw HttpError.badRequest(`Invalid ${field}: must be at most ${maxLength} characters`);
  }
  return trimmed;
}

export function readCountQuery(
  rawValue: unknown,
  field: string,
  options: { fallback: number; min: number; max: number },
): number {
  const parsed = readNumberQuery(rawValue, field, { min: options.min, max: options.max });
  if (parsed === undefined) {
    return options.fallback;
  }
  if (!Number.isInteger(parsed)) {
    throw HttpError.badRequest(`Invalid ${field}: expected an integer`);
  }
  return parsed;
}

export function readOptionalStringArray(
  source: Record<string, unknown>,
  field: string,
  options: { maxItems?: number; maxLength?: number } = {},
): string[] | undefined {
  const { maxItems = 20, maxLength = 500 } = options;
  if (!(field in source)) {
    return undefined;
  }
  const value = source[field];
  if (value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw HttpError.badRequest(`Field "${field}" must be an array of strings`, { field });
  }
  if (value.length > maxItems) {
    throw HttpError.badRequest(`Field "${field}" must contain at most ${maxItems} items`, { field });
  }
  return value.map((entry) => {
    if (typeof entry !== "string" || entry.trim() === "") {
      throw HttpError.badRequest(`Field "${field}" must only contain non-empty strings`, { field });
    }
    const trimmed = entry.trim();
    if (trimmed.length > maxLength) {
      throw HttpError.badRequest(`Field "${field}" items must be at most ${maxLength} characters long`, { field });
    }
    return trimmed;
  });
}

export function readOptionalString(
  source: Record<string, unknown>,
  field: string,
  options: StringFieldOptions = {},
): string | null | undefined {
  const { maxLength = 2000 } = options;
  if (!(field in source)) {
    return undefined;
  }
  const value = source[field];
  if (value === null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw HttpError.badRequest(`Field "${field}" must be a string or null`, { field });
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw HttpError.badRequest(`Field "${field}" must be at most ${maxLength} characters long`, { field });
  }
  return trimmed;
}

export function readOptionalBoolean(
  source: Record<string, unknown>,
  field: string,
): boolean | undefined {
  if (!(field in source)) {
    return undefined;
  }
  const value = source[field];
  if (typeof value === "boolean") {
    return value;
  }
  if (value === "true" || value === "false") {
    return value === "true";
  }
  throw HttpError.badRequest(`Field "${field}" must be a boolean`, { field });
}

export function assertKnownFields(
  source: Record<string, unknown>,
  allowedFields: readonly string[],
): void {
  const unknownFields = Object.keys(source).filter((field) => !allowedFields.includes(field));
  if (unknownFields.length > 0) {
    throw HttpError.badRequest(`Unknown field(s): ${unknownFields.join(", ")}`, {
      unknownFields,
    });
  }
}
