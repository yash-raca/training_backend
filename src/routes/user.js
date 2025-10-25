const express = require('express');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const authenticateToken = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const prisma = new PrismaClient();

// Ensure uploads directory exists
const uploadDir = 'uploads/profiles';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `user-${req.user.userId}-${Date.now()}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed (jpeg, jpg, png, gif)'));
    }
  }
});

// ============================================
// SPECIFIC ROUTES FIRST (must be before /:id)
// ============================================

// Get current user profile: GET /api/users/me/profile
router.get('/me/profile',
  authenticateToken,
  authorize('view_own_profile'),
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { 
          id: true, 
          email: true,
          fullName: true,
          phoneNumber: true,
          photo: true,
          designation: true,
          roleId: true,
          role: {
            select: {
              id: true,
              name: true
            }
          },
          createdAt: true, 
          updatedAt: true 
        }
      });
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      res.json(user);
    } catch (error) {
      console.error('Error fetching user profile:', error);
      res.status(500).json({ message: 'Error fetching user profile' });
    }
  }
);

// Update current user profile (text fields only): PUT /api/users/me/profile
router.put('/me/profile',
  authenticateToken,
  authorize('update_own_profile'),
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const { fullName, phoneNumber, designation } = req.body;
      
      const data = {};
      if (fullName !== undefined) data.fullName = fullName;
      if (phoneNumber !== undefined) data.phoneNumber = phoneNumber;
      if (designation !== undefined) data.designation = designation;
      
      const user = await prisma.user.update({
        where: { id: userId },
        data,
        select: { 
          id: true, 
          email: true,
          fullName: true,
          phoneNumber: true,
          photo: true,
          designation: true,
          roleId: true, 
          createdAt: true, 
          updatedAt: true 
        }
      });
      
      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: user
      });
    } catch (error) {
      console.error('Error updating user profile:', error);
      res.status(500).json({ 
        success: false,
        message: 'Error updating user profile' 
      });
    }
  }
);

// Upload profile photo: POST /api/users/me/photo
router.post('/me/photo',
  authenticateToken,
  authorize('update_own_profile'),
  upload.single('photo'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ 
          success: false,
          message: 'No file uploaded' 
        });
      }
      
      const userId = req.user.userId;
      
      // Delete old photo if exists
      const currentUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { photo: true }
      });
      
      if (currentUser.photo && currentUser.photo.startsWith('/uploads/profiles/')) {
        const oldPhotoPath = path.join(__dirname, '..', '..', currentUser.photo);
        if (fs.existsSync(oldPhotoPath)) {
          fs.unlinkSync(oldPhotoPath);
        }
      }
      
      const photoPath = `/uploads/profiles/${req.file.filename}`;
      
      // Update user's photo field
      const user = await prisma.user.update({
        where: { id: userId },
        data: { photo: photoPath },
        select: {
          id: true,
          email: true,
          fullName: true,
          phoneNumber: true,
          photo: true,
          designation: true,
          roleId: true,
          createdAt: true,
          updatedAt: true
        }
      });
      
      res.json({ 
        success: true, 
        message: 'Photo uploaded successfully',
        data: user
      });
    } catch (error) {
      console.error('Error uploading photo:', error);
      res.status(500).json({ 
        success: false,
        message: 'Error uploading photo',
        error: error.message
      });
    }
  }
);

// Search users by email (admin only): GET /api/users/search/:query
router.get('/search/:query',
  authenticateToken,
  authorize('search_users'),
  async (req, res) => {
    const { query } = req.params;
    try {
      const users = await prisma.user.findMany({
        where: {
          email: { contains: query, mode: 'insensitive' }
        },
        select: { 
          id: true, 
          email: true,
          fullName: true,
          phoneNumber: true,
          photo: true,
          designation: true,
          roleId: true, 
          createdAt: true, 
          updatedAt: true 
        }
      });
      res.json(users);
    } catch (error) {
      console.error('Error searching users:', error);
      res.status(500).json({ message: 'Error searching users' });
    }
  }
);

// ============================================
// GENERIC ROUTES (must be after specific ones)
// ============================================

// Create user (admin only): POST /api/users
router.post('/',
  authenticateToken,
  authorize('create_user'),
  async (req, res) => {
    const { email, password, roleId, fullName, phoneNumber, photo, designation } = req.body;
    try {
      if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
      }
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        return res.status(400).json({ message: 'User already exists' });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          roleId: roleId || null,
          fullName: fullName || null,
          phoneNumber: phoneNumber || null,
          photo: photo || null,
          designation: designation || null
        },
        select: { 
          id: true, 
          email: true, 
          fullName: true,
          phoneNumber: true,
          photo: true,
          designation: true,
          roleId: true, 
          createdAt: true, 
          updatedAt: true 
        }
      });
      res.status(201).json(user);
    } catch (error) {
      console.error('Error creating user:', error);
      res.status(500).json({ message: 'Error creating user' });
    }
  }
);

// List all users (admin only): GET /api/users
router.get('/',
  authenticateToken,
  authorize('view_all_users'),
  async (req, res) => {
    try {
      const users = await prisma.user.findMany({
        select: { 
          id: true, 
          email: true,
          fullName: true,
          phoneNumber: true,
          photo: true,
          designation: true,
          roleId: true, 
          createdAt: true, 
          updatedAt: true 
        }
      });
      res.json(users);
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ message: 'Error fetching users' });
    }
  }
);

// Get user by ID (admin only): GET /api/users/:id
router.get('/:id',
  authenticateToken,
  authorize('view_user_by_id'),
  async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) return res.status(400).json({ message: 'Invalid user ID' });
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { 
          id: true, 
          email: true,
          fullName: true,
          phoneNumber: true,
          photo: true,
          designation: true,
          roleId: true, 
          createdAt: true, 
          updatedAt: true 
        }
      });
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      res.json(user);
    } catch (error) {
      console.error('Error fetching user:', error);
      res.status(500).json({ message: 'Error fetching user' });
    }
  }
);

// Update user by ID (admin only): PUT /api/users/:id
router.put('/:id',
  authenticateToken,
  authorize('update_user'),
  async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) return res.status(400).json({ message: 'Invalid user ID' });

    const { email, password, roleId, fullName, phoneNumber, photo, designation } = req.body;
    try {
      const data = {};
      if (email) data.email = email;
      if (password) data.password = await bcrypt.hash(password, 10);
      if (roleId !== undefined) data.roleId = roleId;
      if (fullName !== undefined) data.fullName = fullName;
      if (phoneNumber !== undefined) data.phoneNumber = phoneNumber;
      if (photo !== undefined) data.photo = photo;
      if (designation !== undefined) data.designation = designation;

      const user = await prisma.user.update({
        where: { id: userId },
        data,
        select: { 
          id: true, 
          email: true,
          fullName: true,
          phoneNumber: true,
          photo: true,
          designation: true,
          roleId: true, 
          createdAt: true, 
          updatedAt: true 
        }
      });
      res.json(user);
    } catch (error) {
      console.error('Error updating user:', error);
      res.status(500).json({ message: 'Error updating user' });
    }
  }
);

// Delete user by ID (admin only): DELETE /api/users/:id
router.delete('/:id',
  authenticateToken,
  authorize('delete_user'),
  async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) return res.status(400).json({ message: 'Invalid user ID' });

    try {
      await prisma.user.delete({ where: { id: userId } });
      res.json({ message: 'User deleted successfully' });
    } catch (error) {
      console.error('Error deleting user:', error);
      res.status(500).json({ message: 'Error deleting user' });
    }
  }
);

// Change user role by ID (admin only): PUT /api/users/:id/role
router.put('/:id/role',
  authenticateToken,
  authorize('change_user_role'),
  async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    const { roleId } = req.body;
    if (isNaN(userId)) return res.status(400).json({ message: 'Invalid user ID' });
    if (roleId === undefined || roleId === null) {
      return res.status(400).json({ message: 'roleId is required' });
    }
    try {
      const user = await prisma.user.update({
        where: { id: userId },
        data: { roleId },
        select: { 
          id: true, 
          email: true,
          fullName: true,
          phoneNumber: true,
          photo: true,
          designation: true,
          roleId: true, 
          createdAt: true, 
          updatedAt: true 
        }
      });
      res.json(user);
    } catch (error) {
      console.error('Error updating user role:', error);
      res.status(500).json({ message: 'Error updating user role' });
    }
  }
);

module.exports = router;
