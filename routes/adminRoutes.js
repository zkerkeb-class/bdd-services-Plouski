const express = require("express")
const adminController = require("../controllers/adminController")
const { authMiddleware, roleMiddleware } = require("../middlewares/authMiddleware");

// Middleware pour vérifier que l'utilisateur a le rôle "admin"
const isAdmin = roleMiddleware(["admin"]);

const router = express.Router()

// Routes statistiques

// Récupérer les statistiques générales de l'application
router.get("/stats", authMiddleware, isAdmin, adminController.getStats)

// Récupérer les derniers utilisateurs inscrits
router.get("/users/recent", authMiddleware, isAdmin, adminController.getRecentUsers)

// Récupérer les derniers roadtrips créés
router.get("/roadtrips/recent", authMiddleware, isAdmin, adminController.getRecentRoadtrips)

// Gestion des utilisateurs

// Récupérer la liste de tous les utilisateurs
router.get("/users", authMiddleware, isAdmin, adminController.getUsers);

// Modifier le statut d'un utilisateur (ex : actif, suspendu)
router.put("/users/status/:id", authMiddleware, isAdmin, adminController.updateUserStatus);

// Récupérer les informations détaillées d'un utilisateur par son ID
router.get("/users/:id", authMiddleware, isAdmin, adminController.getUserById);

// Mettre à jour les informations d'un utilisateur
router.put("/users/:id", authMiddleware, isAdmin, adminController.updateUser);

// Supprimer un utilisateur (et ses données associées si nécessaire)
router.delete("/users/:id", authMiddleware, isAdmin, adminController.deleteUser);


// Gestion des roadtrips

// Récupérer la liste de tous les roadtrips
router.get("/roadtrips", authMiddleware, isAdmin, adminController.getRoadtrips);

// Créer un nouveau roadtrip
router.post("/roadtrips", authMiddleware, isAdmin, adminController.createTrip);

// Modifier un roadtrip existant
router.put("/roadtrips/:id", authMiddleware, isAdmin, adminController.updateTrip);

// Supprimer un roadtrip
router.delete("/roadtrips/:id", authMiddleware, isAdmin, adminController.deleteTrip);

// Modifier le statut d’un roadtrip (ex : publié, brouillon)
router.patch("/roadtrips/status/:id", authMiddleware, isAdmin, adminController.updateRoadtripStatus);

module.exports = router