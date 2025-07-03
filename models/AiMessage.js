const mongoose = require("mongoose");

const aiMessageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  role: { type: String, enum: ["user", "assistant"], required: true },
  content: { type: String, required: true },
  conversationId: { type: String, required: true },
}, { timestamps: true });

module.exports = mongoose.models.AiMessage || mongoose.model("AiMessage", aiMessageSchema);