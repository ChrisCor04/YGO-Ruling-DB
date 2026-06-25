const pool = require("../db");

// Generates all 1-5 word n-grams from a query string.
// "ash blossom negate" → ["ash", "blossom", "negate", "ash blossom", "blossom negate", "ash blossom negate"]
function getNgrams(text, min = 1, max = 5) {
  const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const ngrams = new Set();
  for (let size = min; size <= max; size++) {
    for (let i = 0; i <= words.length - size; i++) {
      ngrams.add(words.slice(i, i + size).join(" "));
    }
  }
  return [...ngrams];
}

// Finds card names mentioned in freeform text by cross-joining all n-grams
// against card names using trigram similarity. Returns multiple cards independently
// so "ash blossom negate pot of extravagance" finds both Ash Blossom AND Pot of Extravagance.
async function extractCards(text) {
  const ngrams = getNgrams(text);
  if (ngrams.length === 0) return [];

  const { rows } = await pool.query(
    `SELECT card_id, name, MAX(similarity(name, ngram)) AS score
     FROM card_localizations
     CROSS JOIN unnest($1::text[]) AS ngram
     WHERE language = 'en'
       AND similarity(name, ngram) > 0.4
     GROUP BY card_id, name
     ORDER BY score DESC
     LIMIT 10`,
    [ngrams]
  );

  return rows;
}

module.exports = extractCards;
