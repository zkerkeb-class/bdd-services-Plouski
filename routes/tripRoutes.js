const express = require("express");
const router = express.Router();
const TripController = require("../controllers/tripController");

// Récupérer tous les roadtrips publics (avec filtres éventuels)
router.get("/", TripController.getPublicRoadtrips);

// Récupérer les roadtrips les plus populaires (ex : par nombre de vues)
router.get("/popular", TripController.getPopularRoadtrips);

// Récupérer un roadtrip spécifique par son ID (détails)
router.get("/:id", TripController.getRoadtripById);

// Incrémenter le compteur de vues pour un roadtrip
router.post("/:id/views", TripController.incrementViewCount);

module.exports = router;