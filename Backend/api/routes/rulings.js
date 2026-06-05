const express = require("express");
const pool = require("../db");
const resolveCardNames = require("../utils/resolveCardNames");

const router = express.Router();

function parseId(param) {
  const id = parseInt(param, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

// GET /api/rulings?page=1&limit=20 - return a paginated list of rulings with basic info (id, title, tags, etc.) but not the full text fields. This allows clients to display a list of rulings without fetching all the details for each one.
// Use above format to ensure only this many rulings are returned at once, and the client can specify which page of results they want.
router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;
    const { card } = req.query;

    // GET /api/rulings?card=dark magician
    // Find the best-matching card by name, then return all its rulings.
    if (card && card.trim().length >= 2) {
      const term = card.trim();

      const { rows: cardRows } = await pool.query(
        `SELECT card_id, name
         FROM card_localizations
         WHERE language = 'en'
           AND (name ILIKE '%' || $1 || '%' OR similarity(name, $1) > 0.3)
         ORDER BY similarity(name, $1) DESC
         LIMIT 1`,
        [term]
      );

      if (cardRows.length === 0) {
        return res.json({ total: 0, card: null, results: [] });
      }

      const { card_id, name: cardName } = cardRows[0];

      const { rows } = await pool.query(
        `SELECT r.ruling_id, r.external_id, r.title, r.translation_status, r.tags, r.created_at
         FROM rulings r
         JOIN ruling_cards rc ON r.ruling_id = rc.ruling_id
         WHERE rc.card_id = $1
         ORDER BY r.ruling_id`,
        [card_id]
      );

      return res.json({
        total: rows.length,
        card: { card_id, name: cardName },
        results: rows,
      });
    }

    // Default: paginated list of all rulings
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
  // check if id is valid
  if (!id) return res.status(400).json({ error: "Invalid ID" });

  // search for the ruling with the specified ID.
  try {
    const { rows } = await pool.query(
      "SELECT * FROM rulings WHERE ruling_id = $1",
      [id]
    );

  // if no ruling was found at this id, return 404 error
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });

    const ruling = rows[0];

    // resolve the rulings' text fields to replace any <<card_id>> placeholders with actual card names. This is done in parallel for all rulings using Promise.all, and the resolveCardNames function is called for each text field that may contain placeholders. The resolved rulings are then returned as JSON to the client.
    [ruling.question_text, ruling.answer_text, ruling.ruling_text] =
      await resolveCardNames([
        ruling.question_text,
        ruling.answer_text,
        ruling.ruling_text,
      ]);

    // fetch the cards associated with this ruling, to include their names in the response. This involves joining the ruling_cards junction table with the card_localizations table to get the card names for all cards linked to this ruling.
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
