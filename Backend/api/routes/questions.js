const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// GET /api/questions - list all questions, newest first
router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT q.question_id, q.title, q.status, q.created_at,
              q.card_id, cl.name AS card_name
       FROM questions q
       LEFT JOIN card_localizations cl ON q.card_id = cl.card_id AND cl.language = 'en'
       ORDER BY q.created_at DESC
       LIMIT 50`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
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
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
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
      [req.user.sub, card_id ?? null, title.trim(), body.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
