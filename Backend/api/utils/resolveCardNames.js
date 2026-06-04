const pool = require("../db");

// Replaces all <<card_id>> placeholders across multiple text fields in one DB round-trip.
// Pass an array of strings; get back an array with the same length, names substituted.
// Example: <<5231>> becomes "Dark Magician" (if that ID corresponds to Dark Magician in the DB).
async function resolveCardNames(texts) {
  const allIds = new Set();

  // Extract all unique card IDs from the input texts
  for (const text of texts) {
    if (!text) continue;
    for (const [, id] of text.matchAll(/<<(\d+)>>/g)) {
      allIds.add(parseInt(id));
    }
  }

  if (allIds.size === 0) return texts;

  // Fetch all card names for the collected IDs in one query. IDs collected in allIds set.
  const { rows } = await pool.query(
    `SELECT card_id, name
     FROM card_localizations
     WHERE card_id = ANY($1) AND language = 'en'`,
    [[...allIds]]
  );

  const nameMap = Object.fromEntries(rows.map((r) => [r.card_id, r.name]));

  // Replace placeholders in the original texts using the fetched names. If an ID wasn't found, keep the placeholder.
  return texts.map((text) =>
    text
      ? text.replace(/<<(\d+)>>/g, (_, id) => nameMap[parseInt(id)] ?? `<<${id}>>`)
      : text
  );
}

module.exports = resolveCardNames;
