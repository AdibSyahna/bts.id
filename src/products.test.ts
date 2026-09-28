import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import request from "supertest";

process.env.NODE_ENV = "test";
process.env.DB_FILE = ":memory:";
process.env.JWT_EXPIRES_IN = "30m";

const { createApp } = await import("./app.js");
const { close, initializeDatabase } = await import("./db/database.js");

const app = createApp();
const AUTHOR = { username: "warehouse", password: "warehouse-pass-1" };
const EDITOR = { username: "editor", password: "editor-pass-1" };

let authorToken = "";
let editorToken = "";
let authorId = 0;

async function login(credentials: { username: string; password: string }): Promise<string> {
  const response = await request(app).post("/api/auth/login").send(credentials);
  assert.equal(response.status, 200, `login failed for ${credentials.username}`);
  return response.body.data.token;
}

function bearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

before(async () => {
  await initializeDatabase();
  const registered = await request(app).post("/api/auth/register").send(AUTHOR);
  authorId = registered.body.data.id;
  await request(app).post("/api/auth/register").send(EDITOR);
  authorToken = await login(AUTHOR);
  editorToken = await login(EDITOR);
});

after(async () => {
  await close();
});

describe("products api", () => {
  let deskId = 0;

  it("requires a token to create a product", async () => {
    const response = await request(app).post("/api/products").send({ title: "Nope", price: 1 });

    assert.equal(response.status, 401);
    assert.match(response.body.error.message, /Authorization header/);
  });

  it("creates a product and records the author", async () => {
    const response = await request(app)
      .post("/api/products")
      .set(bearer(authorToken))
      .send({
        title: "Standing desk",
        price: 349.5,
        description: "electric, height adjustable",
        category: "furniture",
        images: ["https://cdn.example.com/desk.jpg"],
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.data.title, "Standing desk");
    assert.equal(response.body.data.price, 349.5);
    assert.deepEqual(response.body.data.images, ["https://cdn.example.com/desk.jpg"]);
    assert.equal(response.body.data.createdBy, AUTHOR.username);
    assert.equal(response.body.data.updatedBy, AUTHOR.username);
    // ids must arrive as JSON numbers, never as strings (SQLite TEXT affinity trap)
    assert.equal(typeof response.body.data.createdById, "number");
    assert.equal(response.body.data.createdById, authorId);
    assert.equal(response.body.data.createdAt.length > 0, true);

    deskId = response.body.data.id;
  });

  it("defaults images to an empty array and rejects bad prices", async () => {
    const chair = await request(app)
      .post("/api/products")
      .set(bearer(authorToken))
      .send({ title: "Office chair", price: 99, category: "furniture" });
    const lamp = await request(app)
      .post("/api/products")
      .set(bearer(authorToken))
      .send({ title: "Desk lamp", price: 25.5, category: "lighting" });
    const negative = await request(app)
      .post("/api/products")
      .set(bearer(authorToken))
      .send({ title: "Bad", price: -1 });
    const missing = await request(app)
      .post("/api/products")
      .set(bearer(authorToken))
      .send({ title: "Bad" });
    const wrongType = await request(app)
      .post("/api/products")
      .set(bearer(authorToken))
      .send({ title: "Bad", price: "free" });

    assert.equal(chair.status, 201);
    assert.deepEqual(chair.body.data.images, []);
    assert.equal(lamp.status, 201);
    assert.equal(negative.status, 400);
    assert.equal(missing.status, 400);
    assert.equal(wrongType.status, 400);
  });

  it("lists products without a token", async () => {
    const response = await request(app).get("/api/products");

    assert.equal(response.status, 200);
    assert.equal(response.body.meta.total, 3);
    assert.equal(response.body.meta.count, 3);
    assert.equal(response.body.meta.limit, 50);
    assert.equal(response.body.meta.sort, "id");
    assert.equal(response.body.meta.order, "desc");
  });

  it("filters by category, search text and price range", async () => {
    const furniture = await request(app).get("/api/products?category=furniture");
    const search = await request(app).get("/api/products?q=desk");
    const range = await request(app).get("/api/products?minPrice=100&maxPrice=400");
    const none = await request(app).get("/api/products?category=nope");

    assert.equal(furniture.body.meta.total, 2);
    assert.equal(search.body.meta.total, 2);
    assert.equal(range.body.meta.total, 1);
    assert.equal(range.body.data[0].title, "Standing desk");
    assert.equal(none.body.meta.total, 0);
  });

  it("sorts and paginates", async () => {
    const cheapestFirst = await request(app).get("/api/products?sort=price&order=asc");
    const byTitle = await request(app).get("/api/products?sort=title&order=asc");
    const firstPage = await request(app).get("/api/products?limit=2&offset=0");
    const secondPage = await request(app).get("/api/products?limit=2&offset=2");
    const badSort = await request(app).get("/api/products?sort=description");
    const badLimit = await request(app).get("/api/products?limit=0");

    assert.deepEqual(
      cheapestFirst.body.data.map((product: { price: number }) => product.price),
      [25.5, 99, 349.5],
    );
    assert.deepEqual(
      byTitle.body.data.map((product: { title: string }) => product.title),
      ["Desk lamp", "Office chair", "Standing desk"],
    );
    assert.equal(firstPage.body.meta.count, 2);
    assert.equal(firstPage.body.meta.total, 3);
    assert.equal(secondPage.body.meta.count, 1);
    assert.equal(secondPage.body.meta.offset, 2);
    assert.equal(badSort.status, 400);
    assert.equal(badLimit.status, 400);
  });

  it("reads a product by id and reports missing/invalid ids", async () => {
    const found = await request(app).get(`/api/products/${deskId}`);
    const missing = await request(app).get("/api/products/999999");
    const invalid = await request(app).get("/api/products/abc");

    assert.equal(found.status, 200);
    assert.equal(found.body.data.id, deskId);
    assert.equal(missing.status, 404);
    assert.equal(invalid.status, 400);
  });

  it("requires a token to update, but records the editor", async () => {
    const unauthorised = await request(app).patch(`/api/products/${deskId}`).send({ price: 1 });
    const updated = await request(app)
      .patch(`/api/products/${deskId}`)
      .set(bearer(editorToken))
      .send({ price: 399, description: null, images: [] });

    assert.equal(unauthorised.status, 401);
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.price, 399);
    assert.equal(updated.body.data.description, null);
    assert.deepEqual(updated.body.data.images, []);
    assert.equal(updated.body.data.createdBy, AUTHOR.username);
    assert.equal(updated.body.data.updatedBy, EDITOR.username);
    assert.equal(typeof updated.body.data.updatedById, "number");
    assert.equal(updated.body.data.updatedById > 0, true);
  });

  it("rejects an empty patch, a null price and unknown fields", async () => {
    const empty = await request(app)
      .patch(`/api/products/${deskId}`)
      .set(bearer(authorToken))
      .send({});
    const nullPrice = await request(app)
      .patch(`/api/products/${deskId}`)
      .set(bearer(authorToken))
      .send({ price: null });
    const unknown = await request(app)
      .patch(`/api/products/${deskId}`)
      .set(bearer(authorToken))
      .send({ sku: "ABC" });

    assert.equal(empty.status, 400);
    assert.equal(nullPrice.status, 400);
    assert.equal(unknown.status, 400);
  });

  it("deletes a product only when authenticated", async () => {
    const unauthorised = await request(app).delete(`/api/products/${deskId}`);
    const deleted = await request(app)
      .delete(`/api/products/${deskId}`)
      .set(bearer(authorToken));
    const again = await request(app)
      .delete(`/api/products/${deskId}`)
      .set(bearer(authorToken));

    assert.equal(unauthorised.status, 401);
    assert.equal(deleted.status, 204);
    assert.equal(again.status, 404);
  });
});

describe("products query parameters", () => {
  const FIXTURE_CATEGORY = "query-fixtures";

  before(async () => {
    const fixtures = [
      { title: "Blue cotton shirt", description: "soft summer fabric", price: 25, category: FIXTURE_CATEGORY },
      { title: "Blue denim jacket", description: "cotton blend", price: 80, category: FIXTURE_CATEGORY },
      { title: "Red wool scarf", price: 40, category: FIXTURE_CATEGORY },
    ];

    for (const fixture of fixtures) {
      const response = await request(app)
        .post("/api/products")
        .set(bearer(authorToken))
        .send(fixture);
      assert.equal(response.status, 201, `fixture creation failed: ${fixture.title}`);
    }
  });

  it("filters by product name with ?search=", async () => {
    const all = await request(app).get(`/api/products?category=${FIXTURE_CATEGORY}`);
    const blue = await request(app).get(`/api/products?category=${FIXTURE_CATEGORY}&search=blue`);
    const upperCase = await request(app).get(`/api/products?category=${FIXTURE_CATEGORY}&search=BLUE`);

    assert.equal(all.body.meta.total, 3);
    assert.equal(blue.body.meta.total, 2);
    assert.deepEqual(
      blue.body.data.map((product: { title: string }) => product.title).sort(),
      ["Blue cotton shirt", "Blue denim jacket"],
    );
    assert.equal(upperCase.body.meta.total, 2);
  });

  it("searches the product name only, never the description", async () => {
    const listed = await request(app).get(`/api/products?category=${FIXTURE_CATEGORY}`);
    const descriptions = listed.body.data.map(
      (product: { description: string | null }) => product.description ?? "",
    );
    const byDescription = await request(app).get(
      `/api/products?category=${FIXTURE_CATEGORY}&search=blend`,
    );
    const byName = await request(app).get(`/api/products?category=${FIXTURE_CATEGORY}&search=jacket`);

    // "blend" only exists in a description, so a name-only search finds nothing
    assert.equal(descriptions.some((text: string) => text.includes("blend")), true);
    assert.equal(byDescription.body.meta.total, 0);
    assert.equal(byName.body.meta.total, 1);
  });

  it("keeps ?q= working as an alias of ?search=", async () => {
    const response = await request(app).get(`/api/products?category=${FIXTURE_CATEGORY}&q=wool`);

    assert.equal(response.body.meta.total, 1);
    assert.equal(response.body.data[0].title, "Red wool scarf");
  });

  it("filters by ?category= with an exact match", async () => {
    const exact = await request(app).get(`/api/products?category=${FIXTURE_CATEGORY}`);
    const otherCase = await request(app).get("/api/products?category=QUERY-FIXTURES");

    assert.equal(exact.body.meta.total, 3);
    assert.equal(otherCase.body.meta.total, 0);
  });

  it("paginates with ?limit= and ?page=", async () => {
    const first = await request(app).get(
      `/api/products?category=${FIXTURE_CATEGORY}&sort=price&order=asc&limit=2&page=1`,
    );
    const second = await request(app).get(
      `/api/products?category=${FIXTURE_CATEGORY}&sort=price&order=asc&limit=2&page=2`,
    );
    const beyondLast = await request(app).get(
      `/api/products?category=${FIXTURE_CATEGORY}&limit=2&page=9`,
    );

    assert.deepEqual(
      first.body.data.map((product: { price: number }) => product.price),
      [25, 40],
    );
    assert.equal(first.body.meta.count, 2);
    assert.equal(first.body.meta.total, 3);
    assert.equal(first.body.meta.limit, 2);
    assert.equal(first.body.meta.page, 1);
    assert.equal(first.body.meta.offset, 0);
    assert.equal(first.body.meta.totalPages, 2);
    assert.equal(first.body.meta.hasNextPage, true);
    assert.equal(first.body.meta.hasPreviousPage, false);

    assert.deepEqual(
      second.body.data.map((product: { price: number }) => product.price),
      [80],
    );
    assert.equal(second.body.meta.count, 1);
    assert.equal(second.body.meta.page, 2);
    assert.equal(second.body.meta.offset, 2);
    assert.equal(second.body.meta.totalPages, 2);
    assert.equal(second.body.meta.hasNextPage, false);
    assert.equal(second.body.meta.hasPreviousPage, true);

    assert.equal(beyondLast.body.meta.count, 0);
    assert.equal(beyondLast.body.meta.total, 3);
    assert.equal(beyondLast.body.meta.hasNextPage, false);
  });

  it("still accepts ?offset= and reports the equivalent page", async () => {
    const response = await request(app).get(
      `/api/products?category=${FIXTURE_CATEGORY}&sort=price&order=asc&limit=2&offset=2`,
    );

    assert.equal(response.body.meta.count, 1);
    assert.equal(response.body.meta.page, 2);
    assert.equal(response.body.meta.offset, 2);
  });

  it("rejects invalid pagination parameters", async () => {
    const both = await request(app).get("/api/products?limit=2&page=2&offset=2");
    const zeroPage = await request(app).get("/api/products?page=0");
    const fractionPage = await request(app).get("/api/products?page=1.5");

    assert.equal(both.status, 400);
    assert.match(both.body.error.message, /either page or offset/);
    assert.equal(zeroPage.status, 400);
    assert.equal(fractionPage.status, 400);
  });

  it("combines search, category and price filters", async () => {
    const response = await request(app).get(
      `/api/products?category=${FIXTURE_CATEGORY}&search=blue&minPrice=50`,
    );

    assert.equal(response.body.meta.total, 1);
    assert.equal(response.body.data[0].title, "Blue denim jacket");
  });
});
