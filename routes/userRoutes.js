const express = require('express');
const AuthController = require('../controllers/authController');
const { authMiddleware } = require('../middlewares/authMiddleware');

const router = express.Router();

// Vérifier si un utilisateur existe
router.get('/email/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const User = require('../models/User');
    
    const user = await User.findOne({ email }).select('-password');
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Utilisateur non trouvé' 
      });
    }
    
    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Erreur serveur' 
    });
  }
});

// Créer un utilisateur
router.post('/', async (req, res, next) => {
  if (req.body.provider && !req.body.password) {
    req.body.isOAuth = true;
  }
  
  AuthController.register(req, res, next);
});

// Récupérer un utilisateur par ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const User = require('../models/User');
    
    const user = await User.findById(id).select('-password');
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Utilisateur non trouvé' 
      });
    }
    
    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Erreur serveur' 
    });
  }
});

// Mettre à jour un utilisateur
router.put('/:id', authMiddleware, AuthController.updateProfile);

module.exports = router;