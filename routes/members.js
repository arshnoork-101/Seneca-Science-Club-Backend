const express = require('express');
const { body, validationResult } = require('express-validator');
const { prisma } = require('../config/database');
const auth = require('../middleware/auth');
const bcrypt = require('bcryptjs');

const router = express.Router();

// Get all members (Admin only)
router.get('/', auth, async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { page = 1, limit = 20, search, role, isActive } = req.query;
    
    const where = {};
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { senecaId: { contains: search, mode: 'insensitive' } }
      ];
    }
    if (role) where.role = role;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const members = await prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        senecaId: true,
        program: true,
        year: true,
        role: true,
        isActive: true,
        createdAt: true,
        _count: {
          select: {
            eventRegistrations: true,
            blogPosts: true,
            testimonials: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
      skip: (parseInt(page) - 1) * parseInt(limit)
    });

    const total = await prisma.user.count({ where });

    res.json({
      members,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / parseInt(limit)),
        hasNext: parseInt(page) * parseInt(limit) < total,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Error fetching members:', error);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// Get member profile (own profile or admin)
router.get('/profile', auth, async (req, res) => {
  try {
    const member = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        senecaId: true,
        program: true,
        year: true,
        role: true,
        isActive: true,
        createdAt: true,
        eventRegistrations: {
          include: {
            event: {
              select: {
                id: true,
                title: true,
                date: true,
                status: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        },
        blogPosts: {
          where: { isPublished: true },
          select: {
            id: true,
            title: true,
            excerpt: true,
            publishedAt: true
          },
          orderBy: { publishedAt: 'desc' }
        }
      }
    });

    res.json(member);
  } catch (error) {
    console.error('Error fetching member profile:', error);
    res.status(500).json({ error: 'Failed to fetch member profile' });
  }
});

// Get specific member (Admin only)
router.get('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    
    const member = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        senecaId: true,
        program: true,
        year: true,
        role: true,
        isActive: true,
        createdAt: true,
        eventRegistrations: {
          include: {
            event: {
              select: {
                id: true,
                title: true,
                date: true,
                status: true
              }
            }
          }
        },
        blogPosts: {
          select: {
            id: true,
            title: true,
            isPublished: true,
            publishedAt: true
          }
        }
      }
    });

    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    res.json(member);
  } catch (error) {
    console.error('Error fetching member:', error);
    res.status(500).json({ error: 'Failed to fetch member' });
  }
});

// Update member profile
router.put('/profile', auth, [
  body('firstName').optional().trim().isLength({ min: 2, max: 50 }).withMessage('First name must be 2-50 characters'),
  body('lastName').optional().trim().isLength({ min: 2, max: 50 }).withMessage('Last name must be 2-50 characters'),
  body('program').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Program must be 2-100 characters'),
  body('year').optional().isInt({ min: 1, max: 4 }).withMessage('Year must be 1-4')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const member = await prisma.user.update({
      where: { id: req.user.id },
      data: req.body,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        senecaId: true,
        program: true,
        year: true,
        role: true,
        isActive: true
      }
    });

    res.json(member);
  } catch (error) {
    console.error('Error updating member profile:', error);
    res.status(500).json({ error: 'Failed to update member profile' });
  }
});

// Update member (Admin only)
router.put('/:id', auth, [
  body('firstName').optional().trim().isLength({ min: 2, max: 50 }).withMessage('First name must be 2-50 characters'),
  body('lastName').optional().trim().isLength({ min: 2, max: 50 }).withMessage('Last name must be 2-50 characters'),
  body('program').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Program must be 2-100 characters'),
  body('year').optional().isInt({ min: 1, max: 4 }).withMessage('Year must be 1-4'),
  body('role').optional().isIn(['ADMIN', 'MODERATOR', 'MEMBER']).withMessage('Invalid role'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean')
], async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    
    const member = await prisma.user.update({
      where: { id },
      data: req.body,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        senecaId: true,
        program: true,
        year: true,
        role: true,
        isActive: true,
        createdAt: true
      }
    });

    res.json(member);
  } catch (error) {
    console.error('Error updating member:', error);
    res.status(500).json({ error: 'Failed to update member' });
  }
});

// Change password
router.patch('/change-password', auth, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;

    // Get current user with password
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { password: true }
    });

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword }
    });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Deactivate account
router.patch('/deactivate', auth, async (req, res) => {
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { isActive: false }
    });

    res.json({ message: 'Account deactivated successfully' });
  } catch (error) {
    console.error('Error deactivating account:', error);
    res.status(500).json({ error: 'Failed to deactivate account' });
  }
});

// Reactivate account (Admin only)
router.patch('/:id/reactivate', auth, async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    
    const member = await prisma.user.update({
      where: { id },
      data: { isActive: true }
    });

    res.json({ message: 'Account reactivated successfully', member });
  } catch (error) {
    console.error('Error reactivating account:', error);
    res.status(500).json({ error: 'Failed to reactivate account' });
  }
});

// Get member statistics
router.get('/stats/overview', auth, async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const totalMembers = await prisma.user.count();
    const activeMembers = await prisma.user.count({ where: { isActive: true } });
    const membersByRole = await prisma.user.groupBy({
      by: ['role'],
      _count: true
    });

    const stats = {
      totalMembers,
      activeMembers,
      inactiveMembers: totalMembers - activeMembers,
      membersByRole: membersByRole.reduce((acc, item) => {
        acc[item.role] = item._count;
        return acc;
      }, {})
    };

    res.json(stats);
  } catch (error) {
    console.error('Error fetching member stats:', error);
    res.status(500).json({ error: 'Failed to fetch member statistics' });
  }
});

module.exports = router;
