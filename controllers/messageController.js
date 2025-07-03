const AiMessage = require('../models/AiMessage');

/* Crée un nouveau message dans une conversation IA */
const createMessage = async (req, res) => {
  try {
    console.log('📝 BODY REÇU:', JSON.stringify(req.body, null, 2));
    
    const message = await AiMessage.create(req.body);
    res.status(201).json(message);
  } catch (error) {
    console.error('Erreur createMessage:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/* Récupère tous les messages d'un utilisateur */
const getMessagesByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const messages = await AiMessage.find({ userId }).sort({ createdAt: 1 });
    
    res.status(200).json(messages);
  } catch (error) {
    console.error('Erreur getMessagesByUser:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/* Récupère les messages d'une conversation spécifique */
const getMessagesByConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId requis' });
    }

    const messages = await AiMessage.find({ conversationId, userId }).sort({ createdAt: 1 });
    
    res.status(200).json(messages);
  } catch (error) {
    console.error('Erreur getMessagesByConversation:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/* Supprime tous les messages d'un utilisateur */
const deleteMessagesByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    
    await AiMessage.deleteMany({ userId });
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Erreur deleteMessagesByUser:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/* Supprime une conversation complète */
const deleteConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId requis' });
    }

    await AiMessage.deleteMany({ conversationId, userId });
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Erreur deleteConversation:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

module.exports = {
  createMessage,
  getMessagesByUser,
  getMessagesByConversation,
  deleteMessagesByUser,
  deleteConversation,
};