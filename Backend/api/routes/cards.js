// Card-related API routes. Handles fetching card details and rulings, including resolving card names in ruling texts.
const express = require("express");
const pool = require("../db");
const resolveCardNames = require("../utils/resolveCardNames");

const router = express.Router();

function parseId(param) {
  const id = parseInt(param, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

// GET /api/cards/:id
router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid ID" });

  try {
    const { rows } = await pool.query(
      `SELECT c.card_id, cl.name, cl.effect_text, cl.atk, cl.def,
              cl.attribute, cl.card_type, cl.level, cl.link_arrows, cl.properties
       FROM cards c
       JOIN card_localizations cl ON c.card_id = cl.card_id AND cl.language = 'en'
       WHERE c.card_id = $1`,
      [id]
    );

    if (rows.length === 0) return res.status(404).json({ error: "Not found" });

    const { rows: prints } = await pool.query(
      `SELECT print_code, print_date
       FROM card_prints
       WHERE card_id = $1 AND language = 'en'
       ORDER BY print_date`,
      [id]
    );

    res.json({ ...rows[0], prints });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/cards/:id/rulings
router.get("/:id/rulings", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid ID" });

  try {
    const { rows } = await pool.query(
      `SELECT r.*
       FROM rulings r
       JOIN ruling_cards rc ON r.ruling_id = rc.ruling_id
       WHERE rc.card_id = $1
       ORDER BY r.ruling_id`,
      [id]
    );

    const resolved = await Promise.all(
      rows.map(async (ruling) => {
        [ruling.question_text, ruling.answer_text, ruling.ruling_text] =
          await resolveCardNames([
            ruling.question_text,
            ruling.answer_text,
            ruling.ruling_text,
          ]);
        return ruling;
      })
    );

    res.json(resolved);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
