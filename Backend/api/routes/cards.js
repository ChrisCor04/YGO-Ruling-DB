// Card-related API routes. Handles fetching card details and rulings, including resolving card names in ruling texts.
const express = require("express");
const pool = require("../db");
const resolveCardNames = require("../utils/resolveCardNames");
const { decodeProperties } = require("../utils/cardProperties");

const router = express.Router();

function parseId(param) {
  const id = parseInt(param, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

// GET /api/cards?name=dark magician
// Searches cards by name. Uses ILIKE for substring matches and pg_trgm similarity
// as a fallback for typos. Results are ranked: exact → starts-with → contains → fuzzy.
router.get("/", async (req, res) => {
  const { name } = req.query;
  if (!name || name.trim().length < 2) {
    return res.status(400).json({ error: "Provide a name query param (min 2 characters)" });
  }

  const term = name.trim();

  try {
    const { rows } = await pool.query(
      `SELECT c.card_id, cl.name, cl.card_type, cl.attribute, cl.atk, cl.def, cl.level,
              cl.properties, ci.image_url_small,
              ROUND(similarity(cl.name, $1)::numeric, 2) AS score
       FROM cards c
       JOIN card_localizations cl ON c.card_id = cl.card_id AND cl.language = 'en'
       LEFT JOIN card_images ci ON c.card_id = ci.card_id AND ci.is_primary = TRUE
       WHERE cl.name ILIKE '%' || $1 || '%'
          OR similarity(cl.name, $1) > 0.3
       ORDER BY
         CASE WHEN lower(cl.name) = lower($1)      THEN 0
              WHEN cl.name ILIKE $1 || '%'          THEN 1
              WHEN cl.name ILIKE '%' || $1 || '%'   THEN 2
              ELSE 3
         END,
         similarity(cl.name, $1) DESC
       LIMIT 20`,
      [term]
    );

    const decoded = rows.map((card) => ({
      ...card,
      property_names: decodeProperties(card.properties),
    }));

    res.json(decoded);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/cards/:id, return card details by ID. this includes our localized fields
router.get("/:id", async (req, res) => {
  // Make sure the ID is valid before querying the database.
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid ID" });

  // Ensure atomicity when querying for card details by id.
  try {
    const { rows } = await pool.query(
      `SELECT c.card_id, cl.name, cl.effect_text, cl.atk, cl.def,
              cl.attribute, cl.card_type, cl.level, cl.link_arrows, cl.properties,
              ci.image_url_small
       FROM cards c
       JOIN card_localizations cl ON c.card_id = cl.card_id AND cl.language = 'en'
       LEFT JOIN card_images ci ON c.card_id = ci.card_id AND ci.is_primary = TRUE
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

    const { rows: artworks } = await pool.query(
      `SELECT ygoprodeck_img_id, image_url_small, is_primary
       FROM card_images
       WHERE card_id = $1 AND image_status = 'downloaded'
       ORDER BY is_primary DESC`,
      [id]
    );

    const card = rows[0];
    card.property_names = decodeProperties(card.properties);

    res.json({ ...card, prints, artworks });
  } catch (err) { // log an error if something goes wrong with the database query, and return a 500 error to the client
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/cards/:id/rulings, return all rulings associated with a card ID.
router.get("/:id/rulings", async (req, res) => {
  const id = parseId(req.params.id);
  // if the id is invalid, return a 400 error to the client. This prevents unnecessary database queries and ensures we only process valid requests.
  if (!id) return res.status(400).json({ error: "Invalid ID" });

  // Query the database for rulings associated with the card ID. This involves joining the rulings table with the ruling_cards junction table to find all rulings linked to the specified card.
  try {
    const { rows } = await pool.query(
      `SELECT r.*
       FROM rulings r
       JOIN ruling_cards rc ON r.ruling_id = rc.ruling_id
       WHERE rc.card_id = $1
       ORDER BY r.ruling_id`,
      [id]
    );

  // resolve the rulings' text fields to replace any <<card_id>> placeholders with actual card names. This is done in parallel for all rulings using Promise.all, and the resolveCardNames function is called for each text field that may contain placeholders. The resolved rulings are then returned as JSON to the client.
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
