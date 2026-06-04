const express = require("express");
const pool = require("../db");
const resolveCardNames = require("../utils/resolveCardNames");

const router = express.Router();

function parseId(param) {
  const id = parseInt(param, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

// GET /api/rulings?page=1&limit=20
router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;

    const { rows } = await pool.query(
      `SELECT ruling_id, external_id, title, translation_status, tags, created_at
       FROM rulings
       ORDER BY ruling_id
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const { rows: countRows } = await pool.query(
      "SELECT COUNT(*) AS total FROM rulings"
    );

    res.json({
      page,
      limit,
      total: parseInt(countRows[0].total),
      results: rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/rulings/:id
router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid ID" });

  try {
    const { rows } = await pool.query(
      "SELECT * FROM rulings WHERE ruling_id = $1",
      [id]
    );

    if (rows.length === 0) return res.status(404).json({ error: "Not found" });

    const ruling = rows[0];

    [ruling.question_text, ruling.answer_text, ruling.ruling_text] =
      await resolveCardNames([
        ruling.question_text,
        ruling.answer_text,
        ruling.ruling_text,
      ]);

    const { rows: cards } = await pool.query(
      `SELECT cl.card_id, cl.name, cl.card_type, cl.attribute, cl.atk, cl.def, cl.level
       FROM ruling_cards rc
       JOIN card_localizations cl ON rc.card_id = cl.card_id AND cl.language = 'en'
       WHERE rc.ruling_id = $1`,
      [id]
    );

    res.json({ ...ruling, cards });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
