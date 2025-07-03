const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');

// Créer un nouveau message
router.post('/', messageController.createMessage);

// Récupérer tous les messages d'un utilisateur
router.get('/user/:userId', messageController.getMessagesByUser);

// Récupérer tous les messages d'une conversation pour un utilisateur
router.get('/conversation/:conversationId', messageController.getMessagesByConversation);

// Supprimer tous les messages d'un utilisateur
router.delete('/user/:userId', messageController.deleteMessagesByUser);

// Supprimer une conversation complète d'un utilisateur
router.delete('/conversation/:conversationId', messageController.deleteConversation);

module.exports = router;