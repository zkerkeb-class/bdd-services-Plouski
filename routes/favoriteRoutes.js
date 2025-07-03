const express = require("express");
const { authMiddleware } = require("../middlewares/authMiddleware");
const favoriteController = require("../controllers/favoriteController");

const router = express.Router();

// Ajouter ou retirer un favori (toggle)
router.post("/toggle/:tripId", authMiddleware, favoriteController.toggleFavorite);

// Obtenir tous les roadtrips favoris de l'utilisateur connecté
router.get("/", authMiddleware, favoriteController.getFavorites);

module.exports = router;