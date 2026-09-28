import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import request from "supertest";

// Configured before the dynamic imports below: config/env.ts reads process.env on import.
process.env.NODE_ENV = "test";
process.env.DB_FILE = ":memory:";
process.env.JWT_EXPIRES_IN = "1h";

const { createApp } = await import("./app.js");
const { close, initializeDatabase } = await import("./db/database.js");
const { env } = await import("./config/env.js");
const jwt = (await import("jsonwebtoken")).default;

const app = createApp();
const CREDENTIALS = { username: "ada", password: "correct-horse-battery" };

before(async () => {
  await initializeDatabase();
});

after(async () => {
  await close();
});

describe("POST /api/auth/register", () => {
  it("creates an account without leaking the password hash", async () => {
    const response = await request(app).post("/api/auth/register").send(CREDENTIALS);

    assert.equal(response.status, 201);
    assert.equal(response.body.data.username, CREDENTIALS.username);
    assert.equal(typeof response.body.data.id, "number");
    assert.ok(response.body.data.id > 0);
    assert.equal(response.body.data.password, undefined);
    assert.equal(response.body.data.passwordHash, undefined);
    assert.equal(response.body.data.createdAt.length > 0, true);
  });

  it("rejects a duplicate username", async () => {
    const response = await request(app).post("/api/auth/register").send(CREDENTIALS);

    assert.equal(response.status, 409);
    assert.match(response.body.error.message, /already taken/);
  });

  it("rejects a password that is too short", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({ username: "grace", password: "short" });

    assert.equal(response.status, 400);
    assert.deepEqual(response.body.error.details, { field: "password" });
  });

  it("rejects a username with invalid characters", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({ username: "not valid!", password: "long-enough-password" });

    assert.equal(response.status, 400);
    assert.deepEqual(response.body.error.details, { field: "username" });
  });

  it("rejects unknown fields", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({ username: "bob", password: "long-enough-password", role: "admin" });

    assert.equal(response.status, 400);
    assert.match(response.body.error.message, /Unknown field/);
  });
});

describe("POST /api/auth/login", () => {
  let token = "";

  it("issues a bearer token for valid credentials", async () => {
    const response = await request(app).post("/api/auth/login").send(CREDENTIALS);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.tokenType, "Bearer");
    assert.equal(response.body.data.expiresIn, 3600);
    assert.equal(response.body.data.user.username, CREDENTIALS.username);

    token = response.body.data.token;
    assert.equal(typeof token, "string");
    assert.equal(token.split(".").length, 3);
  });

  it("rejects a wrong password", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ username: CREDENTIALS.username, password: "wrong-password" });

    assert.equal(response.status, 401);
    assert.equal(response.body.error.message, "Invalid username or password");
  });

  it("answers unknown usernames with the same message", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ username: "nobody", password: "whatever-password" });

    assert.equal(response.status, 401);
    assert.equal(response.body.error.message, "Invalid username or password");
  });

  it("returns the current user for a valid token", async () => {
    const response = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.data.username, CREDENTIALS.username);
  });

  it("rejects a request without a token", async () => {
    const response = await request(app).get("/api/auth/me");

    assert.equal(response.status, 401);
    assert.match(response.body.error.message, /Authorization header/);
  });

  it("rejects a malformed token", async () => {
    const response = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer not-a-jwt");

    assert.equal(response.status, 401);
    assert.match(response.body.error.message, /invalid/i);
  });

  it("rejects a token with a tampered signature", async () => {
    const tampered = `${token.slice(0, token.lastIndexOf(".") + 1)}deadbeef`;
    const response = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${tampered}`);

    assert.equal(response.status, 401);
  });

  it("rejects an expired token", async () => {
    const expired = jwt.sign({ username: CREDENTIALS.username, typ: "access" }, env.jwtSecret, {
      subject: "1",
      issuer: "bts.id",
      expiresIn: -10,
    });
    const response = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${expired}`);

    assert.equal(response.status, 401);
    assert.match(response.body.error.message, /expired/i);
  });

  it("rejects a non-bearer authorization scheme", async () => {
    const response = await request(app).get("/api/auth/me").set("Authorization", `Basic ${token}`);

    assert.equal(response.status, 401);
    assert.match(response.body.error.message, /scheme/i);
  });
});
