import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import request from "supertest";

process.env.NODE_ENV = "test";
process.env.DB_FILE = ":memory:";
process.env.JWT_EXPIRES_IN = "1h";
process.env.JWT_REFRESH_EXPIRES_IN = "30d";

const { createApp } = await import("./app.js");
const { close, initializeDatabase } = await import("./db/database.js");
const { env } = await import("./config/env.js");
const jwt = (await import("jsonwebtoken")).default;

const app = createApp();
const CREDENTIALS = { username: "refresh-user", password: "initial-password-1" };
const NEW_PASSWORD = "replacement-password-2";
const THIRTY_DAYS_IN_SECONDS = 30 * 86400;

interface AuthPayload {
  user: { id: number; username: string };
  token: string;
  tokenType: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresIn: number | null;
  refreshTokenExpiresAt: string | null;
}

async function login(credentials = CREDENTIALS): Promise<AuthPayload> {
  const response = await request(app).post("/api/auth/login").send(credentials);
  assert.equal(response.status, 200, `login failed for ${credentials.username}`);
  return response.body.data as AuthPayload;
}

function bearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

/** Mints a refresh-shaped token so signature, expiry and fingerprint can be probed. */
function mintRefreshToken(claims: Record<string, unknown>, options: object = {}): string {
  return jwt.sign({ typ: "refresh", pwd: "x".repeat(32), ...claims }, env.jwtSecret, {
    subject: "1",
    issuer: "bts.id",
    expiresIn: 60,
    ...options,
  });
}

let session: AuthPayload;

before(async () => {
  await initializeDatabase();
  await request(app).post("/api/auth/register").send(CREDENTIALS);
  session = await login();
});

after(async () => {
  await close();
});

describe("login returns a refresh token", () => {
  it("includes a refresh token with the configured lifetime", () => {
    assert.equal(session.tokenType, "Bearer");
    assert.equal(session.expiresIn, 3600);
    assert.equal(session.refreshToken.split(".").length, 3);
    assert.equal(session.refreshExpiresIn, THIRTY_DAYS_IN_SECONDS);
    assert.ok(session.refreshTokenExpiresAt !== null);
    assert.equal(Number.isNaN(Date.parse(session.refreshTokenExpiresAt)), false);
  });

  it("carries a password fingerprint instead of password material", () => {
    const payload = jwt.decode(session.refreshToken) as Record<string, unknown>;

    assert.equal(payload.typ, "refresh");
    assert.equal(typeof payload.pwd, "string");
    assert.equal((payload.pwd as string).length, 32);

    const serialised = JSON.stringify(payload);
    assert.equal(serialised.includes(CREDENTIALS.password), false);
    assert.equal(serialised.includes("scrypt$"), false);
  });
});

describe("POST /api/auth/refresh", () => {
  it("issues a new access token and a fresh refresh window", async () => {
    const response = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: session.refreshToken });

    assert.equal(response.status, 200);
    const renewed = response.body.data as AuthPayload;
    // An access token carrying identical claims signs identically within the
    // same second, so assert on the claims rather than on byte inequality.
    const renewedAccess = jwt.decode(renewed.token) as Record<string, unknown>;
    assert.equal(renewedAccess.typ, "access");
    assert.equal(renewedAccess.sub, String(session.user.id));
    assert.notEqual(renewed.refreshToken, session.refreshToken);
    assert.equal(renewed.refreshExpiresIn, THIRTY_DAYS_IN_SECONDS);
    assert.equal(renewed.user.username, CREDENTIALS.username);

    const me = await request(app).get("/api/auth/me").set(bearer(renewed.token));
    assert.equal(me.status, 200);
    assert.equal(me.body.data.username, CREDENTIALS.username);
  });

  it("keeps the previously issued refresh token usable (sliding, not rotating)", async () => {
    const response = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: session.refreshToken });

    assert.equal(response.status, 200);
  });

  it("rejects an access token", async () => {
    const response = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: session.token });

    assert.equal(response.status, 401);
    assert.match(response.body.error.message, /invalid/i);
  });

  it("rejects a refresh token sent as an access token", async () => {
    const response = await request(app).get("/api/auth/me").set(bearer(session.refreshToken));

    assert.equal(response.status, 401);
  });

  it("rejects malformed, tampered and expired tokens", async () => {
    const malformed = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: "not-a-jwt" });
    const tampered = await request(app)
      .post("/api/auth/refresh")
      .send({
        refreshToken: `${session.refreshToken.slice(0, session.refreshToken.lastIndexOf(".") + 1)}deadbeef`,
      });
    const expired = await request(app)
      .post("/api/auth/refresh")
      .send({
        refreshToken: mintRefreshToken({}, { subject: String(session.user.id), expiresIn: -10 }),
      });

    assert.equal(malformed.status, 401);
    assert.equal(tampered.status, 401);
    assert.equal(expired.status, 401);
    assert.match(expired.body.error.message, /expired/i);
  });

  it("rejects a token whose fingerprint does not match the stored hash", async () => {
    const response = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: mintRefreshToken({}, { subject: String(session.user.id) }) });

    assert.equal(response.status, 401);
    assert.match(response.body.error.message, /password change/i);
  });

  it("rejects a token for a user that does not exist", async () => {
    const response = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: mintRefreshToken({}, { subject: "999999" }) });

    assert.equal(response.status, 401);
  });

  it("rejects a missing refresh token or unknown fields", async () => {
    const missing = await request(app).post("/api/auth/refresh").send({});
    const unknown = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: session.refreshToken, username: "nope" });

    assert.equal(missing.status, 400);
    assert.equal(unknown.status, 400);
    assert.match(unknown.body.error.message, /Unknown field/);
  });
});

describe("POST /api/auth/password", () => {
  let changed: AuthPayload;

  it("rejects an incorrect current password", async () => {
    const response = await request(app)
      .post("/api/auth/password")
      .set(bearer(session.token))
      .send({ currentPassword: "not-the-password", newPassword: NEW_PASSWORD });

    assert.equal(response.status, 401);
    assert.match(response.body.error.message, /Current password/);
  });

  it("rejects a weak or unchanged new password", async () => {
    const weak = await request(app)
      .post("/api/auth/password")
      .set(bearer(session.token))
      .send({ currentPassword: CREDENTIALS.password, newPassword: "short" });
    const unchanged = await request(app)
      .post("/api/auth/password")
      .set(bearer(session.token))
      .send({ currentPassword: CREDENTIALS.password, newPassword: CREDENTIALS.password });

    assert.equal(weak.status, 400);
    assert.equal(unchanged.status, 400);
    assert.match(unchanged.body.error.message, /different/);
  });

  it("changes the password and invalidates refresh tokens issued before it", async () => {
    const response = await request(app)
      .post("/api/auth/password")
      .set(bearer(session.token))
      .send({ currentPassword: CREDENTIALS.password, newPassword: NEW_PASSWORD });

    assert.equal(response.status, 200);
    changed = response.body.data as AuthPayload;
    assert.equal(changed.user.username, CREDENTIALS.username);

    const stale = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: session.refreshToken });
    const fresh = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: changed.refreshToken });

    assert.equal(stale.status, 401);
    assert.match(stale.body.error.message, /password change/i);
    assert.equal(fresh.status, 200);
  });

  it("keeps access tokens issued before the change working until they expire", async () => {
    const response = await request(app).get("/api/auth/me").set(bearer(session.token));

    assert.equal(response.status, 200);
    assert.equal(response.body.data.username, CREDENTIALS.username);
  });

  it("accepts the new password and rejects the old one at login", async () => {
    const oldCredentials = await request(app).post("/api/auth/login").send(CREDENTIALS);
    const updated = await login({ username: CREDENTIALS.username, password: NEW_PASSWORD });

    assert.equal(oldCredentials.status, 401);
    assert.equal(updated.user.username, CREDENTIALS.username);
    assert.equal(updated.refreshToken.split(".").length, 3);
  });
});
