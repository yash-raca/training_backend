const express = require('express');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

router.post('/register', async (req, res) => {
  const { email, password } = req.body;
  try {
    const hashed = await bcrypt.hash(password, 10);
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered.' });
    }
    const role = await prisma.role.findUnique({ where: { name: 'trainee' } });
    if (!role) {
      return res.status(500).json({ message: 'Default role not found.' });
    }
    const user = await prisma.user.create({
      data: {
        email,
        password: hashed,
        roleId: role.id,
      }
    });
    res.status(201).json({
      message: 'User registered successfully.',
      user: { id: user.id, email: user.email }
    });
  } catch (error) {
    console.error('Error in /register:', error);
    res.status(500).json({ message: 'Error creating user.', error: error.message });
  }
});


const jwt = require('jsonwebtoken');

// Login endpoint
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ 
      where: { email },
      include: { role: true }   // ensure it fetches the role data if you have a Role model 
    });
    if (!user) return res.status(400).json({ message: 'Invalid email or password.' });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ message: 'Invalid email or password.' });

    // Add role logic. If you use roleId, include it.
    const token = jwt.sign(
      { userId: user.id, role: user.role?.name || user.roleId }, // adjust as needed 
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    // Add user info to response
    res.json({ 
      message: 'Login successful.', 
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role?.name || user.roleId // if you have role.name, otherwise use roleId
      }
    });
  } catch (error) {
    console.error('Error in /login:', error);
    res.status(500).json({ message: 'Server error during login.' });
  }
});



module.exports = router;
