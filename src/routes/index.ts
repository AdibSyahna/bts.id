import { Router } from "express";
import { todosRouter } from "./todos.routes.js";

export const apiRouter = Router();

apiRouter.get("/", (_req, res) => {
  res.json({
    name: "bts.id api",
    version: "1.0.0",
    endpoints: ["GET /api/todos", "GET /api/todos/:id", "POST /api/todos", "PATCH /api/todos/:id", "DELETE /api/todos/:id"],
  });
});

apiRouter.use("/todos", todosRouter);
