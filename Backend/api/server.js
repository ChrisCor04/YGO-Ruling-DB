// Main server file for the YGO Ruling DB API. Sets up Express, connects routes, and starts the server.
const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const rulingsRouter = require("./routes/rulings");
const cardsRouter = require("./routes/cards");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use("/api/rulings", rulingsRouter);
app.use("/api/cards", cardsRouter);

// Only start listening when run directly, not when imported by tests
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
