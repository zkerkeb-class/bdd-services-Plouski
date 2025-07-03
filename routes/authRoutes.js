const express = require('express');
const AuthController = require('../controllers/authController');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();

// Inscription d'un nouvel utilisateur
router.post('/register', AuthController.register);

// Connexion d'un utilisateur
router.post('/login', AuthController.login);

// Déconnexion (nécessite une authentification)
router.post('/logout', authMiddleware, AuthController.logout);

// Vérification d’un token d’accès
router.post('/verify-token', AuthController.verifyToken);

// Renouvellement d’un token (refresh token)
router.post('/refresh-token', AuthController.refreshToken);

// Vérifie et active un compte utilisateur (ex : lien de vérif)
router.post('/verify-account', AuthController.verifyAccount);

// Envoie un email pour réinitialiser le mot de passe
router.post('/initiate-password-reset', AuthController.initiatePasswordReset);

// Envoie un SMS pour réinitialiser le mot de passe
router.post('/initiate-password-reset-sms', AuthController.initiatePasswordResetBySMS);

// Réinitialise le mot de passe avec le token
router.post('/reset-password', AuthController.resetPassword);

// Change le mot de passe d’un utilisateur connecté
router.put('/change-password', authMiddleware, AuthController.changePassword);

// Récupère le profil de l’utilisateur connecté
router.get('/profile', authMiddleware, AuthController.getProfile);

// Met à jour le profil de l’utilisateur connecté
router.put('/profile', authMiddleware, AuthController.updateProfile);

// Supprime le compte de l’utilisateur connecté
router.delete('/account', authMiddleware, AuthController.deleteUser);

// Nouveau endpoint pour refresh après paiement
router.post('/refresh-user-data', authMiddleware, AuthController.refreshUserData);

module.exports = router;
