const express = require('express');
const { PrismaClient } = require('@prisma/client');
const router = express.Router();
const prisma = new PrismaClient();
const authenticateToken = require('../middleware/auth');
const authorize = require('../middleware/authorize');

// Get all roles with their capabilities
router.get('/roles', 
  authenticateToken,
  authorize('view_roles'),
  async (req, res) => {
  const roles = await prisma.role.findMany({
    include: {
      roleCapabilities: { include: { capability: true } }
    }
  });
  res.json(roles);
});

// Get all capabilities
router.get('/capabilities', 
  authenticateToken,
  authorize('view_capabilities'),
  async (req, res) => {
  const capabilities = await prisma.capability.findMany();
  res.json(capabilities);
});

// Create a new role
router.post('/roles', 
  authenticateToken,
  authorize('create_roles'),
  async (req, res) => {
  const { name } = req.body;
  const role = await prisma.role.create({ data: { name } });
  res.json(role);
});

// Create a new capability
router.post('/capabilities', 
  authenticateToken,
  authorize('create_capabilities'),
  async (req, res) => {
  const { name } = req.body;
  const capability = await prisma.capability.create({ data: { name } });
  res.json(capability);
});

// Assign or remove capability to/from a role based on granted boolean
router.post('/roles/:roleId/capabilities', 
  authenticateToken,
  authorize('assign_capabilities_to_role'),
  async (req, res) => {
  const roleId = parseInt(req.params.roleId);
  const { capabilityIds, granted } = req.body;  // Expect array of IDs

  if (!Array.isArray(capabilityIds)) {
    return res.status(400).json({ message: '`capabilityIds` must be an array' });
  }

  try {
    if (granted) {
      // Grant capabilities: create all missing
      const created = [];
      for (const capId of capabilityIds) {
        const exists = await prisma.roleCapability.findUnique({
          where: { roleId_capabilityId: { roleId, capabilityId: capId } }
        });
        if (!exists) {
          const rc = await prisma.roleCapability.create({
            data: { roleId, capabilityId: capId }
          });
          created.push(rc);
        }
      }
      return res.json({ message: 'Capabilities granted', granted: created });
    } else {
      // Revoke capabilities: delete if exists
      const deleted = [];
      for (const capId of capabilityIds) {
        const exists = await prisma.roleCapability.findUnique({
          where: { roleId_capabilityId: { roleId, capabilityId: capId } }
        });
        if (exists) {
          await prisma.roleCapability.delete({
            where: { roleId_capabilityId: { roleId, capabilityId: capId } }
          });
          deleted.push(capId);
        }
      }
      return res.json({ message: 'Capabilities revoked', revoked: deleted });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error assigning capabilities' });
  }
});


module.exports = router;
