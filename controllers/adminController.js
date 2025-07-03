const User = require("../models/User");
const Trip = require("../models/Trip");
const { validationResult } = require("express-validator");
const sanitizeHtml = require("sanitize-html");
const AiMessage = require("../models/AiMessage");
const Favorite = require("../models/Favorite");
const Subscription = require("../models/Subscription");
const mongoose = require("mongoose");
const logger = require("../utils/logger");

/* Récupère les statistiques globales pour le dashboard admin */
const getStats = async (req, res) => {
  try {
    const [totalUsers, activeUsers, totalRoadtrips, publishedRoadtrips] =
      await Promise.all([
        User.countDocuments(),
        User.countDocuments({ isVerified: true }),
        Trip.countDocuments(),
        Trip.countDocuments({ isPublished: true }),
      ]);

    res.status(200).json({
      totalUsers,
      activeUsers,
      totalRoadtrips,
      publishedRoadtrips,
    });
  } catch (error) {
    console.error("Erreur dans getStats:", error);
    res.status(500).json({
      message: "Erreur lors de la récupération des statistiques.",
    });
  }
};

/* Récupère les 5 derniers utilisateurs inscrits */
const getRecentUsers = async (req, res) => {
  try {
    const users = await User.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select("id firstName lastName email isVerified createdAt")
      .lean();

    res.status(200).json({ users });
  } catch (error) {
    console.error("Erreur dans getRecentUsers:", error);
    res.status(500).json({
      message: "Erreur lors de la récupération des derniers utilisateurs.",
    });
  }
};

/* Récupère les 5 derniers roadtrips créés */
const getRecentRoadtrips = async (req, res) => {
  try {
    const roadtrips = await Trip.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select("_id title country bestSeason isPublished createdAt")
      .lean();

    res.status(200).json({ roadtrips });
  } catch (error) {
    console.error("Erreur dans getRecentRoadtrips:", error);
    res.status(500).json({
      message: "Erreur lors de la récupération des derniers roadtrips.",
    });
  }
};

// GESTION DES UTILISATEURS

/* Récupère la liste paginée des utilisateurs avec recherche */
const getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";

    const query = {
      $or: [
        { email: { $regex: search, $options: "i" } },
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
      ],
    };

    const [users, total] = await Promise.all([
      User.find(query)
        .skip((page - 1) * limit)
        .limit(limit)
        .select("-password")
        .lean(),
      User.countDocuments(query),
    ]);

    res.status(200).json({ users, total });
  } catch (err) {
    console.error("Erreur getUsers:", err);
    res.status(500).json({
      message: "Erreur lors de la récupération des utilisateurs",
    });
  }
};

/* Met à jour le statut de vérification d'un utilisateur */
const updateUserStatus = async (req, res) => {
  try {
    const userId = req.params.id;
    const { isVerified } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "ID utilisateur invalide" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    user.isVerified = isVerified;
    await user.save();

    res.status(200).json({
      message: `Utilisateur ${isVerified ? "vérifié" : "non vérifié"}`,
    });
  } catch (err) {
    console.error("Erreur updateUserStatus:", err);
    res.status(500).json({
      message: "Erreur lors de la mise à jour du statut",
    });
  }
};

/* Récupère un utilisateur par son ID */
const getUserById = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "ID utilisateur invalide" });
  }

  try {
    const user = await User.findById(id).select("-password");

    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    res.status(200).json(user);
  } catch (err) {
    console.error("Erreur getUserById:", err);
    res.status(500).json({
      message: "Erreur lors de la récupération de l'utilisateur",
    });
  }
};

/* Met à jour les informations d'un utilisateur */
const updateUser = async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "ID utilisateur invalide" });
  }

  try {
    const user = await User.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
      context: "query",
    }).select("-password");

    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    res.status(200).json(user);
  } catch (err) {
    console.error("Erreur updateUser:", err);
    res.status(500).json({
      message: "Erreur lors de la mise à jour de l'utilisateur",
    });
  }
};

/* Supprime un utilisateur et toutes ses données associées (GDPR compliant) */
const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "ID utilisateur invalide" });
    }

    logger.info(`🧨 Suppression utilisateur + données associées: ${userId}`);
    
    await Promise.all([
      AiMessage.deleteMany({ userId }),
      Favorite.deleteMany({ userId }),
      Subscription.deleteMany({ userId }),
      Trip.deleteMany({ userId }),
    ]);

    const deleted = await User.findByIdAndDelete(userId);
    if (!deleted) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    res.status(200).json({
      message: "Utilisateur et données associées supprimés avec succès",
    });
  } catch (err) {
    console.error("Erreur deleteUser:", err);
    res.status(500).json({
      message: "Erreur lors de la suppression de l'utilisateur",
    });
  }
};

// GESTION DES ROADTRIPS

/* Récupère la liste paginée des roadtrips avec recherche */
const getRoadtrips = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";

    const query = {
      $or: [
        { title: { $regex: search, $options: "i" } },
        { country: { $regex: search, $options: "i" } },
        { region: { $regex: search, $options: "i" } },
        { tags: { $regex: search, $options: "i" } },
      ],
    };

    const [trips, total] = await Promise.all([
      Trip.find(query)
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 })
        .lean(),
      Trip.countDocuments(query),
    ]);

    res.status(200).json({ trips, total });
  } catch (err) {
    console.error("Erreur getRoadtrips:", err);
    res.status(500).json({
      message: "Erreur lors de la récupération des roadtrips",
    });
  }
};

/* Crée un nouveau roadtrip */
const createTrip = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ message: "Accès refusé - Admin requis" });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const data = {
      userId: req.user.userId,
      title: sanitizeHtml(req.body.title),
      image: req.body.image || "/placeholder.svg",
      country: sanitizeHtml(req.body.country || ""),
      description: sanitizeHtml(req.body.description || ""),
      duration: parseInt(req.body.duration) || 7,
      budget: {
        amount: parseFloat(req.body.budget?.amount || req.body.budget || 1000),
        currency: sanitizeHtml(req.body.budget?.currency || "EUR"),
      },
      bestSeason: sanitizeHtml(req.body.bestSeason || ""),
      isPremium: Boolean(req.body.isPremium),
      isPublished: Boolean(req.body.isPublished),

      tags: (req.body.tags || []).map((tag) => sanitizeHtml(tag)),
      pointsOfInterest: (req.body.pointsOfInterest || []).map((poi) => ({
        name: sanitizeHtml(poi.name),
        description: sanitizeHtml(poi.description),
        image: poi.image || "/placeholder.svg",
      })),
      itinerary: (req.body.itinerary || []).map((step) => ({
        day: parseInt(step.day),
        title: sanitizeHtml(step.title),
        description: sanitizeHtml(step.description),
        overnight: Boolean(step.overnight),
      })),
    };

    const trip = new Trip(data);
    await trip.save();

    res.status(201).json(trip);
  } catch (error) {
    logger.error("Erreur création roadtrip", error);
    res.status(500).json({
      message: "Erreur création",
      error: error.message,
    });
  }
};

/* Met à jour un roadtrip existant */
const updateTrip = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ message: "Accès refusé - Admin requis" });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const updateData = {
      userId: req.user.userId,
      title: req.body.title && sanitizeHtml(req.body.title),
      image: req.body.image,
      country: req.body.country && sanitizeHtml(req.body.country),
      description: req.body.description && sanitizeHtml(req.body.description),
      duration: req.body.duration && parseInt(req.body.duration),
      bestSeason: req.body.bestSeason && sanitizeHtml(req.body.bestSeason),

      isPremium:
        typeof req.body.isPremium !== "undefined"
          ? Boolean(req.body.isPremium)
          : undefined,
      isPublished:
        typeof req.body.isPublished !== "undefined"
          ? Boolean(req.body.isPublished)
          : undefined,

      budget: req.body.budget
        ? {
            amount: parseFloat(req.body.budget?.amount || req.body.budget),
            currency: sanitizeHtml(req.body.budget?.currency || "EUR"),
          }
        : undefined,

      tags: req.body.tags && req.body.tags.map((tag) => sanitizeHtml(tag)),
      pointsOfInterest: req.body.pointsOfInterest?.map((poi) => ({
        name: sanitizeHtml(poi.name),
        description: sanitizeHtml(poi.description),
        image: poi.image || "/placeholder.svg",
      })),
      itinerary: req.body.itinerary?.map((step) => ({
        day: parseInt(step.day),
        title: sanitizeHtml(step.title),
        description: sanitizeHtml(step.description),
        overnight: Boolean(step.overnight),
      })),
    };

    Object.keys(updateData).forEach(
      (key) => updateData[key] === undefined && delete updateData[key]
    );

    const updated = await Trip.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    res.status(200).json(updated);
  } catch (error) {
    logger.error("Erreur updateTrip", error);
    res.status(500).json({
      message: "Erreur mise à jour",
      error: error.message,
    });
  }
};

/* Supprime un roadtrip */
const deleteTrip = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ message: "Accès refusé - Admin requis" });
    }

    await Trip.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Supprimé avec succès" });
  } catch (error) {
    logger.error("Erreur deleteTrip", error);
    res.status(500).json({
      message: "Erreur suppression",
      error: error.message,
    });
  }
};

/* Met à jour le statut de publication d'un roadtrip */
const updateRoadtripStatus = async (req, res) => {
  const { id } = req.params;
  const { isPublished } = req.body;

  if (typeof isPublished !== "boolean") {
    return res.status(400).json({
      message: "Le champ 'isPublished' doit être un booléen.",
    });
  }

  try {
    const roadtrip = await Trip.findById(id);
    if (!roadtrip) {
      return res.status(404).json({ message: "Roadtrip non trouvé." });
    }

    roadtrip.isPublished = isPublished;
    await roadtrip.save();

    res.status(200).json({
      message: `Roadtrip ${isPublished ? "publié" : "dépublié"} avec succès.`,
      roadtrip,
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour :", error);
    res.status(500).json({
      message: "Erreur serveur lors de la mise à jour.",
    });
  }
};

module.exports = {
  getStats,
  getRecentUsers,
  getRecentRoadtrips,
  getUsers,
  updateUserStatus,
  deleteUser,
  getUserById,
  updateUser,
  getRoadtrips,
  createTrip,
  updateTrip,
  deleteTrip,
  updateRoadtripStatus,
};
