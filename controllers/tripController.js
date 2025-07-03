const Trip = require("../models/Trip");
const logger = require("../utils/logger");

class TripController {

  /* Récupère tous les roadtrips publics (publiés) */
  static async getPublicRoadtrips(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      const filters = { isPublished: true };
      if (req.query.country) {
        filters.country = new RegExp(req.query.country, 'i');
      }
      if (req.query.isPremium !== undefined) {
        filters.isPremium = req.query.isPremium === 'true';
      }

      const trips = await Trip.find(filters)
        .select('title image country description duration budget bestSeason isPremium tags views')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Trip.countDocuments(filters);

      res.status(200).json({
        success: true,
        data: {
          trips,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalItems: total,
            hasNext: page * limit < total,
            hasPrev: page > 1
          }
        }
      });
    } catch (error) {
      logger.error("Erreur récupération roadtrips publics:", error);
      res.status(500).json({
        success: false,
        message: "Erreur serveur lors de la récupération des roadtrips",
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /* Récupère les 3 roadtrips les plus populaires (par vues) */
  static async getPopularRoadtrips(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 3;

      const trips = await Trip.find({ isPublished: true })
        .select('title image country description duration budget views isPremium')
        .sort({ views: -1 })
        .limit(limit);

      res.status(200).json({
        success: true,
        data: { trips }
      });
    } catch (error) {
      logger.error("Erreur récupération roadtrips populaires:", error);
      res.status(500).json({
        success: false,
        message: "Erreur serveur lors de la récupération des roadtrips populaires",
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /* Récupère un roadtrip par son ID avec gestion du contenu premium */
  static async getRoadtripById(req, res) {
    try {
      const { id } = req.params;

      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({
          success: false,
          message: "ID de roadtrip invalide"
        });
      }

      const trip = await Trip.findById(id);

      if (!trip) {
        return res.status(404).json({
          success: false,
          message: "Roadtrip non trouvé"
        });
      }

      const canAccessPremium = TripController._checkPremiumAccess(req.user);
      
      const tripData = trip.toObject();

      if (trip.isPremium && !canAccessPremium) {
        tripData.itinerary = tripData.itinerary?.map(step => ({
          day: step.day,
          title: step.title,
          description: step.description ? step.description.substring(0, 100) + "..." : "",
          overnight: step.overnight
        })) || [];
        
        tripData.pointsOfInterest = tripData.pointsOfInterest?.slice(0, 2).map(poi => ({
          ...poi,
          description: poi.description ? poi.description.substring(0, 80) + "..." : ""
        })) || [];

        tripData.premiumNotice = {
          message: "Certaines informations sont réservées aux utilisateurs premium.",
          callToAction: "Abonnez-vous pour débloquer l'itinéraire complet, la carte interactive et les conseils d'expert.",
          missingFeatures: ["Itinéraire détaillé", "Carte interactive", "Conseils d'expert", "Tous les points d'intérêt"]
        };
      }

      return res.status(200).json({
        success: true,
        data: tripData
      });
    } catch (error) {
      logger.error("Erreur récupération roadtrip par ID:", error);
      return res.status(500).json({
        success: false,
        message: "Erreur serveur lors de la récupération du roadtrip",
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /* Incrémente le compteur de vues d'un roadtrip */
  static async incrementViewCount(req, res) {
    try {
      const { id } = req.params;

      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({
          success: false,
          message: "ID de roadtrip invalide"
        });
      }

      const trip = await Trip.findByIdAndUpdate(
        id,
        { $inc: { views: 1 } },
        { new: true }
      );

      if (!trip) {
        return res.status(404).json({
          success: false,
          message: "Roadtrip non trouvé"
        });
      }

      res.status(200).json({
        success: true,
        data: { views: trip.views }
      });
    } catch (error) {
      logger.error("Erreur incrémentation vues:", error);
      res.status(500).json({
        success: false,
        message: "Erreur serveur lors de l'incrémentation des vues",
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /* Vérifie si l'utilisateur peut accéder au contenu premium */
  static _checkPremiumAccess(user) {
    if (!user) {
      console.log('🔐 Accès premium refusé sauf pour les admins');
      return false;
    }
    
    const hasAccess = user.role === 'premium' || user.role === 'admin';
    console.log(`🔐 Utilisateur ${user.userId} (${user.role}): ${hasAccess ? 'ACCÈS PREMIUM' : 'ACCÈS STANDARD'}`);
    
    return hasAccess;
  }

}

module.exports = TripController;