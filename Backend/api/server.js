// Main server file for the YGO Ruling DB API. Sets up Express, connects routes, and starts the server.
const express = require("express");
const cors = require("cors");
const path = require("path");
const rateLimit = require("express-rate-limit");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const rulingsRouter = require("./routes/rulings");
const cardsRouter = require("./routes/cards");
const questionsRouter = require("./routes/questions");
const userRouter = require("./routes/user");
const pool = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

const limiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute window
  max: 60,               // 60 requests per window per IP
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,
  message: { error: "Too many requests, please slow down." },
});

app.use(cors());
app.use(express.json());
app.use("/api", limiter);

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/tags", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT unnest(tags) AS tag FROM rulings ORDER BY tag`
    );
    const categories = rows.map(r => r.tag).filter(t => t.startsWith("k:")).map(t => t.slice(2));
    const topics = rows.map(r => r.tag).filter(t => t.startsWith("o:")).map(t => t.slice(2));
    res.json({ categories, topics });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.use("/api/rulings", rulingsRouter);
app.use("/api/cards", cardsRouter);
app.use("/api/questions", questionsRouter);
app.use("/api", userRouter);

// Only start listening when run directly, not when imported by tests
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
