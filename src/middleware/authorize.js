const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function authorize(capabilityName) {
  return async (req, res, next) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
        include: {
          role: {
            include: { roleCapabilities: { include: { capability: true } } }
          }
        }
      });

      if (!user) return res.status(401).json({ message: 'User not found' });

      const userCapabilities = user.role.roleCapabilities.map(
        rc => rc.capability.name
      );

      if (!userCapabilities.includes(capabilityName)) {
        return res
          .status(403)
          .json({ message: `Access denied: missing ${capabilityName}` });
      }

      next();
    } catch (err) {
      console.error('Authorization error:', err);
      res.status(500).json({ message: 'Authorization failed' });
    }
  };
}

module.exports = authorize;
