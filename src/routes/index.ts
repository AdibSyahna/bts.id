import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { productsRouter } from "./products.routes.js";
import { todosRouter } from "./todos.routes.js";

export const apiRouter = Router();

apiRouter.get("/", (_req, res) => {
  res.json({
    name: "bts.id api",
    version: "1.0.0",
    endpoints: [
      "POST /api/auth/register",
      "POST /api/auth/login",
      "POST /api/auth/refresh",
      "POST /api/auth/password",
      "GET /api/auth/me",
      "GET /api/todos",
      "GET /api/todos/:id",
      "POST /api/todos",
      "PATCH /api/todos/:id",
      "DELETE /api/todos/:id",
      "GET /api/products",
      "GET /api/products/:id",
      "POST /api/products",
      "PATCH /api/products/:id",
      "DELETE /api/products/:id",
    ],
  });
});

apiRouter.use("/auth", authRouter);
apiRouter.use("/todos", todosRouter);
apiRouter.use("/products", productsRouter);
