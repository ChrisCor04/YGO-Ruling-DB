// Integration tests for /api/rulings
// These hit the real Supabase DB — run after importRulings.py has completed.

const request = require("supertest");
const app = require("../../api/server");
const pool = require("../../api/db");

afterAll(() => pool.end());

describe("GET /api/rulings", () => {
  test("returns 200 with correct response shape", async () => {
    const res = await request(app).get("/api/rulings");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("page", 1);
    expect(res.body).toHaveProperty("limit", 20);
    expect(res.body).toHaveProperty("total");
    expect(res.body).toHaveProperty("results");
    expect(Array.isArray(res.body.results)).toBe(true);
  });

  test("respects the limit query param", async () => {
    const res = await request(app).get("/api/rulings?limit=5");

    expect(res.status).toBe(200);
    expect(res.body.results.length).toBeLessThanOrEqual(5);
    expect(res.body.limit).toBe(5);
  });

  test("advances correctly with the page query param", async () => {
    const page1 = await request(app).get("/api/rulings?limit=5&page=1");
    const page2 = await request(app).get("/api/rulings?limit=5&page=2");

    const ids1 = page1.body.results.map((r) => r.ruling_id);
    const ids2 = page2.body.results.map((r) => r.ruling_id);

    // No overlap between pages
    expect(ids1.some((id) => ids2.includes(id))).toBe(false);
  });

  test("each result has the expected fields", async () => {
    const res = await request(app).get("/api/rulings?limit=1");
    const ruling = res.body.results[0];

    expect(ruling).toHaveProperty("ruling_id");
    expect(ruling).toHaveProperty("title");
    expect(ruling).toHaveProperty("tags");
  });
});

describe("GET /api/rulings/:id", () => {
  let rulingId;

  // Grab a real ruling ID from the DB before running these tests
  beforeAll(async () => {
    const res = await request(app).get("/api/rulings?limit=1");
    rulingId = res.body.results[0].ruling_id;
  });

  test("returns 200 with ruling data", async () => {
    const res = await request(app).get(`/api/rulings/${rulingId}`);

    expect(res.status).toBe(200);
    expect(res.body.ruling_id).toBe(rulingId);
  });

  test("includes a cards array", async () => {
    const res = await request(app).get(`/api/rulings/${rulingId}`);

    expect(res.body).toHaveProperty("cards");
    expect(Array.isArray(res.body.cards)).toBe(true);
  });

  test("card names are resolved — no <<id>> placeholders remain in text", async () => {
    // Find a ruling that actually has <<id>> placeholders to test resolution
    const { rows } = await pool.query(
      `SELECT ruling_id FROM rulings
       WHERE question_text LIKE '%<<%>>%' OR answer_text LIKE '%<<%>>%'
       LIMIT 1`
    );

    if (rows.length === 0) {
      console.warn("No rulings with <<id>> placeholders found — skipping resolution check");
      return;
    }

    const res = await request(app).get(`/api/rulings/${rows[0].ruling_id}`);

    expect(res.body.question_text).not.toMatch(/<<\d+>>/);
    expect(res.body.answer_text).not.toMatch(/<<\d+>>/);
  });

  test("returns 404 for a ruling ID that does not exist", async () => {
    const res = await request(app).get("/api/rulings/999999999");

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });
});
