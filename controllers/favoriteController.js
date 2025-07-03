const Favorite = require("../models/Favorite");

// Ajouter ou retirer un favori
exports.toggleFavorite = async (req, res) => {
  try {
    const { tripId } = req.params;
    const userId = req.user.userId;

    const existing = await Favorite.findOne({ userId, tripId });

    if (existing) {
      await Favorite.deleteOne({ _id: existing._id });
      res.json({ favorited: false });
    } else {
      await Favorite.create({ userId, tripId });
      res.json({ favorited: true });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Récupérer les roadtrips favoris de l'utilisateur
exports.getFavorites = async (req, res) => {
  try {
    const userId = req.user.userId;

    const favorites = await Favorite.find({ userId })
      .populate("tripId")
      .sort({ createdAt: -1 });

    const roadtrips = favorites
      .filter((fav) => fav.tripId)
      .map((fav) => ({
        ...fav.tripId.toObject(),
        _id: fav.tripId._id,
        isFavorite: true
      }));

    res.json({ roadtrips });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
