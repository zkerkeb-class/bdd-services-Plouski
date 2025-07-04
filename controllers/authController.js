const bcrypt = require("bcryptjs");
const { validationResult } = require("express-validator");
const User = require("../models/User");
const JwtConfig = require("../config/jwtConfig");
const logger = require("../utils/logger");
const crypto = require("crypto");
const NotificationService = require("../services/notificationService");
const mongoose = require("mongoose");

class AuthController {
  /* Inscription d'un nouvel utilisateur */
  static async register(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn("❌ Erreurs de validation lors de l'inscription", {
          service: "auth-service",
          action: "validation_error",
          errors: errors.array(),
        });
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password, firstName, lastName, provider, providerId } =
        req.body;

      logger.info("🔍 Données d'inscription reçues", {
        service: "auth-service",
        action: "data_received",
        email,
        firstName,
        lastName,
        isOAuth: !!provider,
      });

      const existingUser = await User.findOne({ email });
      if (existingUser) {
        logger.warn("❌ Tentative d'inscription avec email existant", {
          service: "auth-service",
          action: "email_already_exists",
          email,
        });
        return res.status(409).json({ message: "Cet email est déjà utilisé" });
      }

      let hashedPassword = null;
      let verificationToken = null;
      let isVerified = false;

      if (provider) {
        isVerified = true;
        logger.info("🔐 Inscription OAuth détectée", {
          service: "auth-service",
          action: "oauth_registration",
          provider,
          email,
        });
      } else {
        if (!password) {
          return res.status(400).json({
            message: "Mot de passe requis pour l'inscription classique",
          });
        }

        const salt = await bcrypt.genSalt(10);
        hashedPassword = await bcrypt.hash(password, salt);
        verificationToken = crypto.randomBytes(32).toString("hex");
        isVerified = false;

        logger.info("🔐 Inscription classique détectée", {
          service: "auth-service",
          action: "classic_registration",
          email,
        });
      }

      const newUser = new User({
        email,
        password: hashedPassword,
        firstName,
        lastName,
        verificationToken,
        isVerified,
        createdAt: new Date(),
        ...(provider && {
          oauth: {
            provider,
            providerId,
          },
        }),
      });

      await newUser.save();
      logger.info("✅ Utilisateur sauvegardé avec succès", {
        service: "auth-service",
        action: "user_saved",
        userId: newUser._id,
        email: newUser.email,
        isOAuth: !!provider,
      });

      const accessToken = JwtConfig.generateAccessToken(newUser);
      const refreshToken = JwtConfig.generateRefreshToken(newUser);

      if (!provider && !isVerified) {
        process.nextTick(async () => {
          try {
            logger.info("🚀 Démarrage envoi email de confirmation", {
              service: "auth-service",
              action: "email_send_start",
              email: newUser.email,
              userId: newUser._id,
            });

            const currentUser = await User.findById(newUser._id);
            if (currentUser && currentUser.isVerified) {
              logger.info(
                "🚫 Utilisateur déjà vérifié - Annulation envoi email",
                {
                  service: "auth-service",
                  action: "email_cancelled_user_verified",
                  email: newUser.email,
                  userId: newUser._id,
                }
              );
              return;
            }

            if (!currentUser || !currentUser.verificationToken) {
              logger.error("❌ Token de vérification manquant", {
                service: "auth-service",
                action: "missing_verification_token",
                email: newUser.email,
                userId: newUser._id,
                hasUser: !!currentUser,
                hasToken: !!currentUser?.verificationToken,
              });
              return;
            }

            logger.info("📧 Tentative d'envoi email de confirmation", {
              service: "auth-service",
              action: "email_send_attempt",
              email: newUser.email,
              token: newUser.verificationToken.substring(0, 8) + "...",
            });

            const emailResult = await NotificationService.sendConfirmationEmail(
              newUser.email,
              newUser.verificationToken
            );

            logger.info("✅ Résultat envoi email de confirmation", {
              service: "auth-service",
              action: "email_send_result",
              email: newUser.email,
              status: emailResult?.status,
              success: emailResult?.status === 200,
            });
          } catch (error) {
            logger.error(
              "❌ Erreur critique lors de l'envoi d'email de confirmation",
              {
                service: "auth-service",
                action: "email_send_critical_error",
                email: newUser.email,
                error: error.message,
                stack: error.stack,
                errorCode: error.code,
                errorName: error.name,
              }
            );
          }
        });
      }

      logger.info("✅ Inscription terminée avec succès - Réponse immédiate", {
        service: "auth-service",
        action: "registration_completed",
        userId: newUser._id,
        email: newUser.email,
        isOAuth: !!provider,
      });

      res.status(201).json({
        message: provider
          ? "Utilisateur OAuth créé avec succès"
          : "Utilisateur créé avec succès. Un email de confirmation sera envoyé sous peu.",
        user: {
          id: newUser._id,
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          isVerified: newUser.isVerified,
          authProvider: provider || "local",
        },
        tokens: {
          accessToken,
          refreshToken,
        },
      });
    } catch (error) {
      logger.error("Erreur critique lors de l'inscription", {
        service: "auth-service",
        action: "registration_error",
        error: error.message,
        stack: error.stack,
      });
      next(error);
    }
  }

  /* Connexion d'un utilisateur existant */
  static async login(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;

      const user = await User.findOne({ email });
      if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({
          message: "Email ou mot de passe incorrect",
        });
      }

      if (!user.isVerified) {
        return res.status(403).json({
          message:
            "Veuillez confirmer votre adresse email avant de vous connecter.",
        });
      }

      const accessToken = JwtConfig.generateAccessToken(user);
      const refreshToken = JwtConfig.generateRefreshToken(user);

      res.status(200).json({
        message: "Connexion réussie",
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
        tokens: {
          accessToken,
          refreshToken,
        },
      });
    } catch (error) {
      logger.error("Erreur lors de la connexion:", error.message);
      next(error);
    }
  }

  /* Déconnexion utilisateur (nettoyage des cookies) */
  static async logout(req, res, next) {
    try {
      if (req.cookies?.refreshToken) {
        res.clearCookie("refreshToken");
      }
      res.status(200).json({ message: "Déconnexion réussie" });
    } catch (error) {
      logger.error("Erreur lors de la déconnexion:", error.message);
      next(error);
    }
  }

  /* Vérifie la validité d'un token d'accès */
  static async verifyToken(req, res, next) {
    try {
      const token =
        req.body.token || req.query.token || req.headers["x-access-token"];

      if (!token) {
        return res.status(400).json({ message: "Token requis" });
      }

      try {
        const decoded = JwtConfig.verifyAccessToken(token);
        res.status(200).json({
          valid: true,
          user: {
            id: decoded.userId,
            email: decoded.email,
            role: decoded.role,
          },
        });
      } catch (tokenError) {
        return res.status(401).json({
          valid: false,
          message: "Token invalide ou expiré",
        });
      }
    } catch (error) {
      logger.error("Erreur lors de la vérification du token:", error.message);
      next(error);
    }
  }

  /* Initie la réinitialisation de mot de passe par SMS */
  static async initiatePasswordResetBySMS(req, res, next) {
    try {
      const { phoneNumber } = req.body;

      if (!phoneNumber) {
        return res.status(400).json({ message: "Numéro de téléphone requis" });
      }

      if (mongoose.connection.readyState !== 1) {
        logger.error("❌ Base de données non disponible", {
          service: "auth-service",
          action: "db_not_ready",
          readyState: mongoose.connection.readyState,
        });
        return res.status(503).json({
          message:
            "Service temporairement indisponible. Veuillez réessayer dans quelques instants.",
        });
      }

      logger.info("🔍 Recherche utilisateur par téléphone", {
        service: "auth-service",
        action: "user_lookup_start",
        phoneNumber: phoneNumber.substring(0, 3) + "***",
      });

      let user;
      try {
        user = await User.findOne({ phoneNumber }).maxTimeMS(8000).lean();

        logger.info("✅ Recherche utilisateur terminée", {
          service: "auth-service",
          action: "user_lookup_complete",
          userFound: !!user,
        });
      } catch (dbError) {
        logger.error("❌ Erreur base de données lors de la recherche", {
          service: "auth-service",
          action: "db_query_error",
          error: dbError.message,
          errorCode: dbError.code,
          phoneNumber: phoneNumber.substring(0, 3) + "***",
        });

        return res.status(200).json({
          message:
            "Si ce numéro est associé à un compte, un code a été envoyé par SMS.",
        });
      }

      if (user) {
        try {
          const resetCode = Math.floor(
            100000 + Math.random() * 900000
          ).toString();
          const resetCodeExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 heure

          // Mise à jour avec timeout
          await User.findByIdAndUpdate(
            user._id,
            { resetCode, resetCodeExpires },
            { maxTimeMS: 5000, new: false }
          );

          logger.info("✅ Code de réinitialisation généré et sauvegardé", {
            service: "auth-service",
            action: "reset_code_saved",
            userId: user._id,
            phoneNumber: phoneNumber.substring(0, 3) + "***",
          });

          // ✅ AMÉLIORATION - Gestion des erreurs SMS
          setImmediate(async () => {
            try {
              const smsResult = await NotificationService.sendPasswordResetSMS(
                phoneNumber,
                resetCode
              );

              if (smsResult.success) {
                logger.info("✅ SMS de réinitialisation envoyé avec succès", {
                  service: "auth-service",
                  action: "sms_sent_success",
                  phoneNumber: phoneNumber.substring(0, 3) + "***",
                  deliveryId: smsResult.deliveryId,
                });

                // Si il y a un warning, on le log aussi
                if (smsResult.warning) {
                  logger.warn("⚠️ SMS envoyé avec avertissement", {
                    service: "auth-service",
                    action: "sms_sent_warning",
                    phoneNumber: phoneNumber.substring(0, 3) + "***",
                    warning: smsResult.warning,
                    deliveryId: smsResult.deliveryId,
                  });
                }
              } else {
                throw new Error("Échec envoi SMS");
              }
            } catch (smsError) {
              logger.error("❌ Échec envoi SMS de réinitialisation", {
                service: "auth-service",
                action: "sms_send_failed",
                error: smsError.message,
                phoneNumber: phoneNumber.substring(0, 3) + "***",
              });

              // ✅ AMÉLIORATION - Ne pas considérer comme une erreur critique
              // Le code est déjà sauvegardé, l'utilisateur peut réessayer
              logger.info(
                "ℹ️ Code de réinitialisation disponible malgré l'erreur SMS",
                {
                  service: "auth-service",
                  action: "reset_code_available",
                  phoneNumber: phoneNumber.substring(0, 3) + "***",
                }
              );
            }
          });
        } catch (saveError) {
          logger.error(
            "❌ Erreur lors de la sauvegarde du code de réinitialisation",
            {
              service: "auth-service",
              action: "save_reset_code_error",
              error: saveError.message,
              userId: user._id,
            }
          );

          return res.status(200).json({
            message:
              "Si ce numéro est associé à un compte, un code a été envoyé par SMS.",
          });
        }
      } else {
        logger.info("🔍 Aucun utilisateur trouvé pour ce numéro", {
          service: "auth-service",
          action: "user_not_found",
          phoneNumber: phoneNumber.substring(0, 3) + "***",
        });
      }

      // ✅ AMÉLIORATION - Réponse toujours positive pour la sécurité
      return res.status(200).json({
        message:
          "Si ce numéro est associé à un compte, un code a été envoyé par SMS.",
        info: "Vérifiez votre téléphone. Le code est valable 1 heure.",
      });
    } catch (error) {
      logger.error("❌ Erreur critique lors de la réinitialisation par SMS", {
        service: "auth-service",
        action: "critical_sms_reset_error",
        error: error.message,
        stack: error.stack,
      });

      return res.status(500).json({
        message:
          "Une erreur interne s'est produite. Veuillez réessayer plus tard.",
      });
    }
  }

  /* Renouvelle un access token à partir d'un refresh token */
  static async refreshToken(req, res, next) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          message: "Token de rafraîchissement requis",
        });
      }

      try {
        const payload = JwtConfig.verifyRefreshToken(refreshToken);

        const user = await User.findById(payload.userId);
        if (!user) {
          return res.status(401).json({ message: "Utilisateur non trouvé" });
        }

        const newAccessToken = JwtConfig.generateAccessToken(user);
        const newRefreshToken = JwtConfig.generateRefreshToken(user);

        res.status(200).json({
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
        });
      } catch (tokenError) {
        return res.status(401).json({
          message: "RefreshToken invalide ou expiré",
        });
      }
    } catch (error) {
      logger.error("Erreur lors du rafraîchissement du token:", error.message);
      next(error);
    }
  }

  /* Vérifie un compte utilisateur avec le token de vérification */
  static async verifyAccount(req, res, next) {
    try {
      const { token } = req.body;
      if (!token) {
        return res.status(400).json({ message: "Token requis" });
      }

      const user = await User.findOne({ verificationToken: token });
      if (!user) {
        return res.status(400).json({ message: "Token invalide" });
      }

      const creationDate = user.createdAt || new Date();
      const expirationDate = new Date(
        creationDate.getTime() + 24 * 60 * 60 * 1000
      );

      if (Date.now() > expirationDate.getTime()) {
        return res.status(400).json({ message: "Token expiré" });
      }

      if (user.isVerified) {
        logger.warn("⚠️ Tentative de vérification d'un compte déjà vérifié", {
          service: "auth-service",
          action: "already_verified_attempt",
          userId: user._id,
          email: user.email,
        });
        return res.status(200).json({
          message: "Compte déjà vérifié",
          user: {
            id: user._id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
          },
        });
      }

      NotificationService.cancelPendingEmails(user.email);

      user.isVerified = true;
      user.verificationToken = undefined;
      await user.save();

      logger.info("✅ Compte vérifié avec succès", {
        service: "auth-service",
        action: "account_verified",
        userId: user._id,
        email: user.email,
      });

      return res.status(200).json({
        message: "Compte vérifié avec succès",
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
      });
    } catch (error) {
      logger.error("Erreur lors de la vérification du compte", {
        service: "auth-service",
        action: "account_verification_error",
        error: error.message,
        stack: error.stack,
      });
      next(error);
    }
  }

  /* Initie la réinitialisation de mot de passe par email */
  static async initiatePasswordReset(req, res, next) {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: "Email requis" });
      }

      logger.info("🔑 Demande de réinitialisation de mot de passe", {
        service: "auth-service",
        action: "password_reset_request",
        email,
      });

      const user = await User.findOne({ email });

      if (user) {
        const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);

        if (
          user.resetCode &&
          user.resetCodeExpires &&
          user.resetCodeExpires > twoMinutesAgo
        ) {
          logger.warn("🚫 Code de réinitialisation déjà généré récemment", {
            service: "auth-service",
            action: "reset_code_too_recent",
            email,
            expiresAt: user.resetCodeExpires,
            minutesLeft: Math.round(
              (user.resetCodeExpires - Date.now()) / 60000
            ),
          });

          return res.status(200).json({
            message:
              "Si cet email est associé à un compte, des instructions ont été envoyées.",
          });
        }

        const resetCode = Math.floor(
          100000 + Math.random() * 900000
        ).toString();
        const resetCodeExpires = new Date(Date.now() + 60 * 60 * 1000);

        user.resetCode = resetCode;
        user.resetCodeExpires = resetCodeExpires;
        await user.save();

        logger.info("✅ Code de réinitialisation généré", {
          service: "auth-service",
          action: "reset_code_generated",
          email,
          expiresAt: resetCodeExpires,
        });

        setImmediate(async () => {
          try {
            const currentUser = await User.findOne({
              email,
              resetCode,
              resetCodeExpires: { $gt: Date.now() },
            });

            if (!currentUser) {
              logger.info(
                "🚫 Code de réinitialisation déjà utilisé ou expiré - Annulation envoi",
                {
                  service: "auth-service",
                  action: "email_cancelled_code_invalid",
                  email,
                }
              );
              return;
            }

            await NotificationService.sendPasswordResetEmail(email, resetCode);

            logger.info("✅ Email de réinitialisation envoyé en arrière-plan", {
              service: "auth-service",
              action: "reset_email_sent",
              email,
            });
          } catch (error) {
            logger.error(
              "❌ Échec envoi email réinitialisation en arrière-plan",
              {
                service: "auth-service",
                action: "reset_email_failed",
                email,
                error: error.message,
              }
            );
          }
        });
      } else {
        logger.warn("🔍 Tentative de réinitialisation pour email inexistant", {
          service: "auth-service",
          action: "reset_email_not_found",
          email,
        });
      }

      return res.status(200).json({
        message:
          "Si cet email est associé à un compte, des instructions ont été envoyées.",
      });
    } catch (error) {
      logger.error("Erreur lors de la demande de réinitialisation", {
        service: "auth-service",
        action: "password_reset_error",
        error: error.message,
        stack: error.stack,
      });
      next(error);
    }
  }

  /* Réinitialise le mot de passe avec un code de vérification */
  static async resetPassword(req, res, next) {
    try {
      const { email, resetCode, newPassword } = req.body;

      if (!email || !resetCode || !newPassword) {
        return res.status(400).json({
          message: "Email, code de réinitialisation et mot de passe requis",
        });
      }

      const user = await User.findOne({
        email,
        resetCode,
        resetCodeExpires: { $gt: Date.now() },
      });

      if (!user) {
        return res.status(400).json({
          message: "Code de réinitialisation invalide ou expiré",
        });
      }

      logger.info(
        "🚫 Annulation des emails de réinitialisation suite à l'utilisation du code",
        {
          service: "auth-service",
          action: "cancel_emails_on_reset",
          email,
          userId: user._id,
        }
      );

      NotificationService.cancelPendingEmails(email);

      const hashedPassword = await bcrypt.hash(newPassword, 10);

      user.password = hashedPassword;
      user.resetCode = undefined;
      user.resetCodeExpires = undefined;
      user.updatedAt = new Date();

      await user.save();

      logger.info("✅ Mot de passe réinitialisé avec succès via code", {
        service: "auth-service",
        action: "password_reset_success",
        email,
        userId: user._id,
      });

      res.status(200).json({
        message: "Mot de passe réinitialisé avec succès",
      });
    } catch (error) {
      logger.error("Erreur lors de la réinitialisation:", error.message);
      next(error);
    }
  }

  /* Changer le mot de passe (utilisateur connecté) */
  static async changePassword(req, res, next) {
    try {
      const userId = req.user.userId;
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          message:
            "Le mot de passe actuel et le nouveau mot de passe sont requis",
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "Utilisateur non trouvé" });
      }

      const isPasswordValid = await bcrypt.compare(
        currentPassword,
        user.password
      );
      if (!isPasswordValid) {
        return res.status(401).json({
          message: "Mot de passe actuel incorrect",
        });
      }

      const isSamePassword = await bcrypt.compare(newPassword, user.password);
      if (isSamePassword) {
        return res.status(400).json({
          message:
            "Le nouveau mot de passe doit être différent du mot de passe actuel",
        });
      }

      logger.info(
        "🚫 Annulation des emails de réinitialisation suite au changement de mot de passe",
        {
          service: "auth-service",
          action: "cancel_reset_emails_on_change",
          email: user.email,
          userId,
        }
      );

      NotificationService.cancelPendingEmails(user.email);

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newPassword, salt);

      user.password = hashedPassword;
      user.resetCode = undefined;
      user.resetCodeExpires = undefined;
      user.updatedAt = new Date();

      await user.save();

      logger.info(
        "✅ Mot de passe changé avec succès + codes de réinitialisation invalidés",
        {
          service: "auth-service",
          action: "password_changed_success",
          userId,
          email: user.email,
        }
      );

      res.status(200).json({
        message: "Mot de passe changé avec succès",
      });
    } catch (error) {
      logger.error("Erreur lors du changement de mot de passe:", error.message);
      next(error);
    }
  }

  /* Récupère le profil utilisateur */
  static async getProfile(req, res, next) {
    try {
      const userId = req.user.userId;

      const user = await User.findById(userId).select(
        "-password -resetCode -resetCodeExpires -verificationToken"
      );

      if (!user) {
        return res.status(404).json({
          message: "Profil utilisateur non trouvé",
        });
      }

      res.status(200).json({
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phoneNumber: user.phoneNumber,
          role: user.role,
          isVerified: user.isVerified,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          authProvider: user.oauth?.provider || "local",
        },
      });
    } catch (error) {
      logger.error("Erreur lors de la récupération du profil:", error.message);
      next(error);
    }
  }

  /* Met à jour le profil utilisateur */
  static async updateProfile(req, res, next) {
    try {
      const userId = req.user.userId;
      const { firstName, lastName, phoneNumber } = req.body;

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          message: "Profil utilisateur non trouvé",
        });
      }

      const normalizedPhoneNumber = phoneNumber === "" ? null : phoneNumber;

      if (normalizedPhoneNumber && normalizedPhoneNumber !== user.phoneNumber) {
        const existingUserWithPhone = await User.findOne({
          phoneNumber: normalizedPhoneNumber,
          _id: { $ne: userId },
        });

        if (existingUserWithPhone) {
          return res.status(409).json({
            success: false,
            message:
              "Ce numéro de téléphone est déjà utilisé par un autre compte",
            error: {
              type: "PhoneNumberTaken",
              field: "phoneNumber",
            },
          });
        }
      }

      const allowedUpdates = {
        firstName,
        lastName,
        phoneNumber: normalizedPhoneNumber,
      };

      for (const key in allowedUpdates) {
        if (allowedUpdates[key] !== undefined) {
          user[key] = allowedUpdates[key];
        }
      }

      user.updatedAt = new Date();
      await user.save();

      res.status(200).json({
        success: true,
        message: "Profil mis à jour avec succès",
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phoneNumber: user.phoneNumber,
          role: user.role,
          isVerified: user.isVerified,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      });
    } catch (error) {
      logger.error("Erreur lors de la mise à jour du profil:", error.message);
      next(error);
    }
  }

  /* Supprime le compte utilisateur */
  static async deleteUser(req, res, next) {
    try {
      const userId = req.user.userId;

      const user = await User.findByIdAndDelete(userId);
      if (!user) {
        return res.status(404).json({
          message: "Utilisateur non trouvé",
        });
      }

      logger.info(`Compte supprimé pour l'utilisateur ${userId}`);

      res.status(200).json({
        message: "Compte supprimé avec succès",
      });
    } catch (error) {
      logger.error("Erreur lors de la suppression du compte:", error.message);
      next(error);
    }
  }

  /* Met à jour les données utilisateur et génère de nouveaux tokens */
  static async refreshUserData(req, res, next) {
    try {
      const userId = req.user.userId;

      const freshUser = await User.findById(userId).select(
        "-password -resetCode -resetCodeExpires -verificationToken"
      );

      if (!freshUser) {
        return res.status(404).json({
          error: "Utilisateur non trouvé",
        });
      }

      const newAccessToken = JwtConfig.generateAccessToken(freshUser);
      const newRefreshToken = JwtConfig.generateRefreshToken(freshUser);

      logger.info(
        `Token refreshé pour utilisateur ${userId}, nouveau rôle: ${freshUser.role}`
      );

      res.status(200).json({
        message: "Données utilisateur mises à jour",
        tokens: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
        },
        user: {
          id: freshUser._id,
          email: freshUser.email,
          firstName: freshUser.firstName,
          lastName: freshUser.lastName,
          role: freshUser.role,
        },
      });
    } catch (error) {
      logger.error("Erreur refreshUserData:", error.message);
      res.status(500).json({
        error: "Erreur lors du refresh des données",
        details: error.message,
      });
    }
  }
}

module.exports = AuthController;
