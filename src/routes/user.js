const express = require('express');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const authenticateToken = require('../middleware/auth');
const authorize = require('../middleware/authorize');

const router = express.Router();
const prisma = new PrismaClient();

// Create user (admin only): POST /api/users
router.post('/',
  authenticateToken,
  authorize('manage_users'),
  async (req, res) => {
    const { email, password, roleId } = req.body;
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
          roleId: roleId || null
        },
        select: { id: true, email: true, roleId: true, createdAt: true, updatedAt: true }
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
  authorize('manage_users'),
  async (req, res) => {
    try {
      const users = await prisma.user.findMany({
        select: { id: true, email: true, roleId: true, createdAt: true, updatedAt: true }
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
  authorize('manage_users'),
  async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) return res.status(400).json({ message: 'Invalid user ID' });
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, roleId: true, createdAt: true, updatedAt: true }
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
  authorize('manage_users'),
  async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) return res.status(400).json({ message: 'Invalid user ID' });

    const { email, password, roleId } = req.body;
    try {
      const data = {};
      if (email) data.email = email;
      if (password) data.password = await bcrypt.hash(password, 10);
      if (roleId !== undefined) data.roleId = roleId;

      const user = await prisma.user.update({
        where: { id: userId },
        data,
        select: { id: true, email: true, roleId: true, createdAt: true, updatedAt: true }
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
  authorize('manage_users'),
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

// Search users by email (admin only): GET /api/users/search/:query
router.get('/search/:query',
  authenticateToken,
  authorize('manage_users'),
  async (req, res) => {
    const { query } = req.params;
    try {
      const users = await prisma.user.findMany({
        where: {
          email: { contains: query, mode: 'insensitive' }
        },
        select: { id: true, email: true, roleId: true, createdAt: true, updatedAt: true }
      });
      res.json(users);
    } catch (error) {
      console.error('Error searching users:', error);
      res.status(500).json({ message: 'Error searching users' });
    }
  }
);

// Change user role by ID (admin only): PUT /api/users/:id/role
router.put('/:id/role',
  authenticateToken,
  authorize('manage_users'),
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
        select: { id: true, email: true, roleId: true, createdAt: true, updatedAt: true }
      });
      res.json(user);
    } catch (error) {
      console.error('Error updating user role:', error);
      res.status(500).json({ message: 'Error updating user role' });
    }
  }
);

module.exports = router;
