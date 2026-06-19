const express = require("express");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();


// requireAuth already fetches the role from user_profiles, so no extra DB query needed
router.get("/me", requireAuth, (req, res) => {
  res.json({ id: req.user.id, role: req.user.role });
});

module.exports = router;
