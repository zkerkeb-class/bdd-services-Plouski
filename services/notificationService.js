const axios = require("axios");
const logger = require("../utils/logger");
const User = require("../models/User");
const NOTIFICATION_SERVICE_URL =
  process.env.NOTIFICATION_SERVICE_URL || "http://localhost:5005";
const FREE_MOBILE_USERNAME = process.env.FREE_MOBILE_USERNAME;
const FREE_MOBILE_API_KEY = process.env.FREE_MOBILE_API_KEY;

const createAxiosInstance = () => {
  return axios.create({
    timeout: 60000,
    headers: { "Content-Type": "application/json" },
  });
};

const NotificationService = {
  // Envoie un email de confirmation
  sendConfirmationEmail: async (email, token) => {
    try {
      const user = await User.findOne({ email });
      if (!user || user.isVerified || user.verificationToken !== token) {
        logger.info("🚫 Utilisateur déjà vérifié ou token invalide", { email });
        return {
          status: 200,
          data: { message: "Utilisateur déjà vérifié ou token invalide" },
        };
      }

      const axiosInstance = createAxiosInstance();
      const res = await axiosInstance.post(
        `${NOTIFICATION_SERVICE_URL}/api/notifications/email`,
        { type: "confirm", email, tokenOrCode: token }
      );

      logger.info("✅ Email de confirmation envoyé", { email });
      return res;
    } catch (error) {
      logger.error("❌ Erreur envoi email confirmation", {
        email,
        error: error.message,
      });
      throw error;
    }
  },

  // Envoie un email de réinitialisation avec vérification directe
  sendPasswordResetEmail: async (email, code, retryCount = 0) => {
    try {
      const user = await User.findOne({
        email,
        resetCode: code,
        resetCodeExpires: { $gt: Date.now() },
      });

      if (!user) {
        logger.info("🚫 Code de reset invalide ou expiré", { email, code });
        return { status: 200, data: { message: "Code invalide ou expiré" } };
      }

      logger.info("✅ Code de reset valide, envoi email", { email });

      const axiosInstance = createAxiosInstance();
      const res = await axiosInstance.post(
        `${NOTIFICATION_SERVICE_URL}/api/notifications/email`,
        { type: "reset", email, tokenOrCode: code }
      );

      logger.info("✅ Email de réinitialisation envoyé", { email });
      return res;
    } catch (error) {
      logger.error("❌ Erreur envoi email reset", {
        email,
        error: error.message,
      });

      const user = await User.findOne({
        email,
        resetCode: code,
        resetCodeExpires: { $gt: Date.now() },
      });

      if (!user) {
        logger.info("🚫 Code devenu invalide pendant l'erreur", { email });
        return { status: 200, data: { message: "Code invalide" } };
      }

      if (retryCount < 1) {
        logger.warn("🔄 Retry envoi email");
        await new Promise((resolve) => setTimeout(resolve, 3000));
        return NotificationService.sendPasswordResetEmail(
          email,
          code,
          retryCount + 1
        );
      }

      throw error;
    }
  },

  // Envoie un SMS de réinitialisation
  sendPasswordResetSMS: async (phoneNumber, code) => {
    try {
      if (!FREE_MOBILE_USERNAME || !FREE_MOBILE_API_KEY) {
        throw new Error("Configuration Free Mobile manquante");
      }

      const axiosInstance = createAxiosInstance();
      const response = await axiosInstance.post(
        `${NOTIFICATION_SERVICE_URL}/api/notifications/sms`,
        {
          username: FREE_MOBILE_USERNAME,
          apiKey: FREE_MOBILE_API_KEY,
          code: code,
          type: "reset",
        }
      );

      if (response.status === 500) {
        logger.warn("⚠️ SMS possiblement envoyé malgré erreur 500");
        return { success: true, message: "SMS possiblement envoyé" };
      }

      logger.info("✅ SMS envoyé avec succès");
      return { success: true, message: "SMS envoyé" };
    } catch (error) {
      logger.error("❌ Erreur envoi SMS", { error: error.message });
      return { success: false, message: "Erreur SMS" };
    }
  },

  // Plus d'annulation, juste un log
  cancelPendingEmails: (email) => {
    logger.info("🚫 Demande d'annulation", { email });
  },
};

module.exports = NotificationService;