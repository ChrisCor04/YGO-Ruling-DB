// Integration tests for /api/cards
// These hit the real Supabase DB — run after importCards.py has completed.

const request = require("supertest");
const app = require("../../api/server");
const pool = require("../../api/db");

afterAll(() => pool.end());

describe("GET /api/cards/:id", () => {
  // Exodia the Forbidden One — a reliable card to test against
  const KNOWN_CARD_ID = 4027;

  test("returns 200 with card data", async () => {
    const res = await request(app).get(`/api/cards/${KNOWN_CARD_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.card_id).toBe(KNOWN_CARD_ID);
  });

  test("response has expected card fields", async () => {
    const res = await request(app).get(`/api/cards/${KNOWN_CARD_ID}`);

    expect(res.body).toHaveProperty("name");
    expect(res.body).toHaveProperty("card_type");
    expect(res.body).toHaveProperty("effect_text");
    expect(res.body).toHaveProperty("prints");
    expect(Array.isArray(res.body.prints)).toBe(true);
  });

  test("monster cards have atk, def, level, and attribute", async () => {
    const res = await request(app).get(`/api/cards/${KNOWN_CARD_ID}`);

    // Exodia is a monster, these fields should be present
    expect(res.body).toHaveProperty("atk");
    expect(res.body).toHaveProperty("def");
    expect(res.body).toHaveProperty("level");
    expect(res.body).toHaveProperty("attribute");
  });

  test("prints include print_code and print_date", async () => {
    const res = await request(app).get(`/api/cards/${KNOWN_CARD_ID}`);

    if (res.body.prints.length > 0) {
      const print = res.body.prints[0];
      expect(print).toHaveProperty("print_code");
      expect(print).toHaveProperty("print_date");
    }
  });

  test("returns 404 for a card ID that does not exist", async () => {
    const res = await request(app).get("/api/cards/999999999");

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });
});

describe("GET /api/cards/:id/rulings", () => {
  let cardIdWithRulings;

  // Find a card that actually has rulings linked
  beforeAll(async () => {
    const { rows } = await pool.query(
      `SELECT card_id FROM ruling_cards LIMIT 1`
    );
    cardIdWithRulings = rows.length > 0 ? rows[0].card_id : null;
  });

  test("returns an array of rulings for a card", async () => {
    if (!cardIdWithRulings) {
      console.warn("No ruling_cards links found — skipping (run importCards.py first)");
      return;
    }

    const res = await request(app).get(`/api/cards/${cardIdWithRulings}/rulings`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test("rulings have card names resolved — no <<id>> placeholders remain", async () => {
    if (!cardIdWithRulings) return;

    const res = await request(app).get(`/api/cards/${cardIdWithRulings}/rulings`);

    for (const ruling of res.body) {
      expect(ruling.question_text ?? "").not.toMatch(/<<\d+>>/);
      expect(ruling.answer_text ?? "").not.toMatch(/<<\d+>>/);
    }
  });

  test("returns an empty array for a card with no rulings", async () => {
    // Use a card ID that exists but has no rulings linked
    const { rows } = await pool.query(
      `SELECT c.card_id FROM cards c
       LEFT JOIN ruling_cards rc ON c.card_id = rc.card_id
       WHERE rc.card_id IS NULL
       LIMIT 1`
    );

    if (rows.length === 0) return;

    const res = await request(app).get(`/api/cards/${rows[0].card_id}/rulings`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
