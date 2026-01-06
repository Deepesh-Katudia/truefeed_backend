const express = require("express");
const router = express.Router();
const controller = require("../../controllers/usersController");

router.get("/:id", controller.getUser);
router.get("/:id/posts", controller.getUserPosts);

module.exports = router;
