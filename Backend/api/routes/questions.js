const express = require("express");
const pool = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const extractCards = require("../utils/extractCards");

const router = express.Router();

// GET /api/questions - list all questions, newest first
router.get("/", async (req, res) => {
  const { status, card_id } = req.query;

  const validStatuses = ["open", "answered", "closed"];

  if (status && !validStatuses.includes(status)){
    return res.status(400).json({error: "Invalid status filter"});
  }

  try {
    const params = [];
    const conditions = [];

    if (status){
      params.push(status);
      conditions.push(`q.status = $${params.length}`);
    }

    if (card_id){
      const cardIdInt = parseInt(card_id, 10);
      if (!Number.isFinite(cardIdInt) || cardIdInt < 1) {
        return res.status(400).json({error: "Invalid card id"});
      }
      params.push(cardIdInt);
      conditions.push(`q.card_id = $${params.length}`);
    }

    const whereSQL = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT q.question_id, q.title, q.status, q.created_at,
              q.card_id, cl.name AS card_name
      FROM questions q
      LEFT JOIN card_localizations cl ON q.card_id = cl.card_id AND cl.language = 'en'
      ${whereSQL}
      ORDER BY q.created_at DESC
      LIMIT 50`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});


// GET /api/questions/similar?q= - find questions similar to a freeform query
// Must be before /:id so Express doesn't treat "similar" as an ID
router.get("/similar", async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 3) {
    return res.status(400).json({ error: "Query must be at least 3 characters" });
  }

  const query = q.trim();

  try {
    // Step 1: extract all card names mentioned in the query via n-gram cross-join
    const cards = await extractCards(query);
    const cardIds = cards.map((c) => c.card_id);

    // Step 2: find questions linked to those cards
    let cardMatches = [];
    if (cardIds.length > 0) {
      const { rows } = await pool.query(
        `SELECT q.question_id, q.title, q.status, q.created_at,
                q.card_id, cl.name AS card_name
         FROM questions q
         LEFT JOIN card_localizations cl ON q.card_id = cl.card_id AND cl.language = 'en'
         WHERE q.card_id = ANY($1)
         ORDER BY q.created_at DESC
         LIMIT 10`,
        [cardIds]
      );
      cardMatches = rows;
    }

    // Step 3: keyword fallback — search question titles for matching words
    // Uses inline tsvector since questions table has no search_vector column
    const { rows: keywordMatches } = await pool.query(
      `SELECT q.question_id, q.title, q.status, q.created_at,
              q.card_id, cl.name AS card_name
       FROM questions q
       LEFT JOIN card_localizations cl ON q.card_id = cl.card_id AND cl.language = 'en'
       WHERE to_tsvector('english', q.title) @@ websearch_to_tsquery('english', $1)
       ORDER BY q.created_at DESC
       LIMIT 10`,
      [query]
    );

    // Merge — card matches first, then keyword matches that weren't already returned
    const seen = new Set(cardMatches.map((r) => r.question_id));
    const combined = [
      ...cardMatches,
      ...keywordMatches.filter((r) => !seen.has(r.question_id)),
    ];

    res.json({ matched_cards: cards, results: combined });
  } catch (err) {
    next(err);
  }
});

// GET /api/questions/:id - single question with full body
router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: "Invalid ID" });
  }

  try {
    const { rows } = await pool.query(
      `SELECT q.question_id, q.user_id, q.title, q.body, q.status, q.created_at,
              q.card_id, cl.name AS card_name
       FROM questions q
       LEFT JOIN card_localizations cl ON q.card_id = cl.card_id AND cl.language = 'en'
       WHERE q.question_id = $1`,
      [id]
    );

    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/questions - create a question (must be logged in)
router.post("/", requireAuth, async (req, res) => {
  const { title, body, card_id } = req.body;

  if (!title || title.trim().length < 5) {
    return res.status(400).json({ error: "Title must be at least 5 characters" });
  }
  if (!body || body.trim().length < 10) {
    return res.status(400).json({ error: "Body must be at least 10 characters" });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO questions (user_id, card_id, title, body)
       VALUES ($1, $2, $3, $4)
       RETURNING question_id, title, status, created_at`,
      [req.user.id, card_id ?? null, title.trim(), body.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// GET /api/questions/:id/answers - list answers for a question
router.get("/:id/answers", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: "Invalid ID" });
  }

  try {
    const { rows } = await pool.query(
      `SELECT a.answer_id, a.body, a.created_at, a.user_id
       FROM answers a
       WHERE a.question_id = $1
       ORDER BY a.created_at ASC`,
      [id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/questions/:id/answers - post an answer (judges only)
router.post("/:id/answers", requireAuth, requireRole("judge"), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: "Invalid ID" });
  }

  const { body } = req.body;
  if (!body || body.trim().length < 10) {
    return res.status(400).json({ error: "Answer must be at least 10 characters" });
  }

  try {
    const { rows: question } = await pool.query(
      `SELECT question_id FROM questions WHERE question_id = $1`,
      [id]
    );
    if (question.length === 0) return res.status(404).json({ error: "Question not found" });

    const { rows } = await pool.query(
      `INSERT INTO answers (question_id, user_id, body)
       VALUES ($1, $2, $3)
       RETURNING answer_id, body, created_at`,
      [id, req.user.id, body.trim()]
    );

    await pool.query(
      `UPDATE questions SET status = 'answered', updated_at = NOW() WHERE question_id = $1`,
      [id]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
