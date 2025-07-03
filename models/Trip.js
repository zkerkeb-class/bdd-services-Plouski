const mongoose = require("mongoose");
const slugify = require("slugify");

const TripSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Un titre est requis pour le trip"],
      trim: true,
      maxlength: [100, "Le titre ne peut pas dépasser 100 caractères"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, "La description ne peut pas dépasser 1000 caractères"],
    },
    slug: {
      type: String,
      unique: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Un utilisateur est requis"],
    },
    budget: {
      currency: {
        type: String,
        default: "EUR",
        enum: ["EUR", "USD", "CAD", "GBP"],
      },
      amount: {
        type: Number,
        min: [0, "Le budget ne peut pas être négatif"],
      },
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    image: {
      type: String,
      default: "/placeholder.svg?height=600&width=800",
    },
    country: {
      type: String,
      trim: true,
    },
    duration: {
      type: Number,
      min: [1, "La durée doit être d'au moins un jour"],
      default: 7,
    },
    bestSeason: {
      type: String,
      trim: true,
    },
    isPremium: {
      type: Boolean,
      default: false,
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    pointsOfInterest: [
      {
        name: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        image: {
          type: String,
          default: "/placeholder.svg?height=300&width=400",
        },
      },
    ],
    itinerary: [
      {
        day: { type: Number, required: true },
        title: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        overnight: { type: Boolean, default: false },
      },
    ],
    views: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    indexes: [
      { userId: 1 },
      { bestSeason: 1 },
      { "budget.amount": 1 },
      { tags: 1 },
      { isPublished: 1 },
      { views: -1 },
    ],
  }
);

TripSchema.pre("save", function (next) {
  if (this.isModified("title")) {
    this.slug =
      slugify(this.title, {
        lower: true,
        strict: true,
        trim: true,
      }) +
      "-" +
      Date.now();
  }
  next();
});

TripSchema.statics.searchTrips = function (query) {
  return this.find({
    $or: [
      { title: { $regex: query, $options: "i" } },
      { description: { $regex: query, $options: "i" } },
      { tags: { $regex: query, $options: "i" } },
    ],
    isPublished: true,
  });
};

TripSchema.set("toJSON", {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret.__v;
    if (!ret.steps) ret.steps = [];
    return ret;
  },
});

const Trip = mongoose.model("Trip", TripSchema);

module.exports = Trip;
