import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import request from "supertest";

// The database module reads its configuration when it is imported, so the
// environment is configured before the dynamic imports below run.
process.env.NODE_ENV = "test";
process.env.DB_FILE = ":memory:";

const { createApp } = await import("./app.js");
const { close, initializeDatabase } = await import("./db/database.js");

const app = createApp();

before(async () => {
  await initializeDatabase();
});

after(async () => {
  await close();
});

describe("GET /health", () => {
  it("reports the service as healthy", async () => {
    const response = await request(app).get("/health");

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "ok");
    assert.equal(response.body.env, "test");
  });
});

describe("GET /api", () => {
  it("lists the available endpoints", async () => {
    const response = await request(app).get("/api");

    assert.equal(response.status, 200);
    assert.equal(response.body.name, "bts.id api");
    assert.ok(Array.isArray(response.body.endpoints));
  });
});

describe("todos api", () => {
  let todoId = 0;

  it("starts with an empty collection", async () => {
    const response = await request(app).get("/api/todos");

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.data, []);
    assert.equal(response.body.meta.count, 0);
  });

  it("creates a todo", async () => {
    const response = await request(app)
      .post("/api/todos")
      .send({ title: "write the starter project" });

    assert.equal(response.status, 201);
    assert.equal(response.body.data.title, "write the starter project");
    assert.equal(response.body.data.completed, false);
    assert.equal(response.body.data.description, null);
    assert.ok(response.body.data.id > 0);
    assert.ok(response.body.data.createdAt.length > 0);

    todoId = response.body.data.id;
  });

  it("rejects a todo without a title", async () => {
    const response = await request(app).post("/api/todos").send({ description: "no title" });

    assert.equal(response.status, 400);
    assert.match(response.body.error.message, /title/);
    assert.deepEqual(response.body.error.details, { field: "title" });
  });

  it("rejects unknown fields", async () => {
    const response = await request(app).post("/api/todos").send({ title: "x", nope: 1 });

    assert.equal(response.status, 400);
    assert.match(response.body.error.message, /Unknown field/);
  });

  it("reads a todo by id", async () => {
    const response = await request(app).get(`/api/todos/${todoId}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.id, todoId);
  });

  it("filters the collection by completion state", async () => {
    const open = await request(app).get("/api/todos?completed=false");
    const done = await request(app).get("/api/todos?completed=true");

    assert.equal(open.status, 200);
    assert.equal(open.body.meta.count, 1);
    assert.equal(done.status, 200);
    assert.equal(done.body.meta.count, 0);
  });

  it("updates a todo", async () => {
    const response = await request(app)
      .patch(`/api/todos/${todoId}`)
      .send({ title: "write the starter project", completed: true });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.completed, true);
    assert.equal(response.body.data.title, "write the starter project");
  });

  it("rejects an empty patch", async () => {
    const response = await request(app).patch(`/api/todos/${todoId}`).send({});

    assert.equal(response.status, 400);
  });

  it("returns 404 for a missing todo", async () => {
    const response = await request(app).get("/api/todos/999999");

    assert.equal(response.status, 404);
    assert.match(response.body.error.message, /not found/);
  });

  it("deletes a todo", async () => {
    const deleted = await request(app).delete(`/api/todos/${todoId}`);
    const missing = await request(app).get(`/api/todos/${todoId}`);

    assert.equal(deleted.status, 204);
    assert.equal(missing.status, 404);
  });

  it("returns 404 for an unknown route", async () => {
    const response = await request(app).get("/api/nope");

    assert.equal(response.status, 404);
    assert.match(response.body.error.message, /not found/);
  });
});
