import { Router } from "express";
import * as todoRepository from "../repositories/todo.repository.js";
import type { CreateTodoInput, TodoFilters, UpdateTodoInput } from "../types/todo.js";
import { asyncHandler } from "../utils/async-handler.js";
import { HttpError } from "../utils/http-error.js";
import {
  assertKnownFields,
  assertPlainObject,
  parseBoolean,
  parseId,
  parseOrder,
  readOptionalBoolean,
  readOptionalString,
  readRequiredString,
} from "../utils/validation.js";

const TODO_FIELDS = ["title", "description", "completed"] as const;

export const todosRouter = Router();

todosRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const filters: TodoFilters = {};

    const completedQuery = req.query.completed;
    if (typeof completedQuery === "string") {
      filters.completed = parseBoolean(completedQuery, "completed");
    }

    const orderQuery = req.query.order;
    filters.order = parseOrder(typeof orderQuery === "string" ? orderQuery : undefined);

    const todos = await todoRepository.findAll(filters);
    res.json({ data: todos, meta: { count: todos.length } });
  }),
);

todosRouter.get(
  "/:id",
  asyncHandler<{ id: string }>(async (req, res) => {
    const id = parseId(req.params.id);
    const todo = await todoRepository.findById(id);
    if (todo === null) {
      throw HttpError.notFound(`Todo ${id} was not found`);
    }
    res.json({ data: todo });
  }),
);

todosRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = assertPlainObject(req.body);
    assertKnownFields(body, TODO_FIELDS);

    const input: CreateTodoInput = { title: readRequiredString(body, "title") };

    const description = readOptionalString(body, "description");
    if (description !== undefined) {
      input.description = description;
    }

    const completed = readOptionalBoolean(body, "completed");
    if (completed !== undefined) {
      input.completed = completed;
    }

    const todo = await todoRepository.create(input);
    res.status(201).json({ data: todo });
  }),
);

todosRouter.patch(
  "/:id",
  asyncHandler<{ id: string }>(async (req, res) => {
    const id = parseId(req.params.id);
    const body = assertPlainObject(req.body);
    assertKnownFields(body, TODO_FIELDS);

    const input: UpdateTodoInput = {};

    if ("title" in body) {
      input.title = readRequiredString(body, "title");
    }

    const description = readOptionalString(body, "description");
    if (description !== undefined) {
      input.description = description;
    }

    const completed = readOptionalBoolean(body, "completed");
    if (completed !== undefined) {
      input.completed = completed;
    }

    if (Object.keys(input).length === 0) {
      throw HttpError.badRequest("Request body must contain at least one of: title, description, completed");
    }

    const todo = await todoRepository.update(id, input);
    if (todo === null) {
      throw HttpError.notFound(`Todo ${id} was not found`);
    }
    res.json({ data: todo });
  }),
);

todosRouter.delete(
  "/:id",
  asyncHandler<{ id: string }>(async (req, res) => {
    const id = parseId(req.params.id);
    const deleted = await todoRepository.remove(id);
    if (!deleted) {
      throw HttpError.notFound(`Todo ${id} was not found`);
    }
    res.status(204).end();
  }),
);
