const express = require('express');
const { body, validationResult } = require('express-validator');
const { prisma } = require('../config/database');
const auth = require('../middleware/auth');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');

const router = express.Router();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure multer for image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Get all active team members
router.get('/', async (req, res) => {
  try {
    const members = await prisma.teamMember.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' }
    });

    res.json(members);
  } catch (error) {
    console.error('Error fetching team members:', error);
    res.status(500).json({ error: 'Failed to fetch team members' });
  }
});

// Get single team member
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const member = await prisma.teamMember.findUnique({
      where: { id }
    });

    if (!member || !member.isActive) {
      return res.status(404).json({ error: 'Team member not found' });
    }

    res.json(member);
  } catch (error) {
    console.error('Error fetching team member:', error);
    res.status(500).json({ error: 'Failed to fetch team member' });
  }
});

// Create new team member (Admin only)
router.post('/', auth, upload.single('image'), [
  body('firstName').trim().isLength({ min: 2, max: 50 }).withMessage('First name must be 2-50 characters'),
  body('lastName').trim().isLength({ min: 2, max: 50 }).withMessage('Last name must be 2-50 characters'),
  body('role').trim().isLength({ min: 3, max: 100 }).withMessage('Role must be 3-100 characters'),
  body('bio').trim().isLength({ min: 20, max: 500 }).withMessage('Bio must be 20-500 characters'),
  body('linkedinUrl').optional().isURL().withMessage('LinkedIn URL must be valid'),
  body('instagramUrl').optional().isURL().withMessage('Instagram URL must be valid'),
  body('order').optional().isInt({ min: 0 }).withMessage('Order must be a non-negative integer')
], async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Profile image is required' });
    }

    const { firstName, lastName, role, bio, linkedinUrl, instagramUrl, order = 0 } = req.body;

    // Upload image to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { 
          folder: 'seneca-science-club/team',
          transformation: [
            { width: 400, height: 400, crop: 'fill', gravity: 'face' }
          ]
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(req.file.buffer);
    });

    const member = await prisma.teamMember.create({
      data: {
        firstName,
        lastName,
        role,
        bio,
        imageUrl: uploadResult.secure_url,
        linkedinUrl,
        instagramUrl,
        order: parseInt(order)
      }
    });

    res.status(201).json(member);
  } catch (error) {
    console.error('Error creating team member:', error);
    res.status(500).json({ error: 'Failed to create team member' });
  }
});

// Update team member (Admin only)
router.put('/:id', auth, upload.single('image'), [
  body('firstName').optional().trim().isLength({ min: 2, max: 50 }).withMessage('First name must be 2-50 characters'),
  body('lastName').optional().trim().isLength({ min: 2, max: 50 }).withMessage('Last name must be 2-50 characters'),
  body('role').optional().trim().isLength({ min: 3, max: 100 }).withMessage('Role must be 3-100 characters'),
  body('bio').optional().trim().isLength({ min: 20, max: 500 }).withMessage('Bio must be 20-500 characters'),
  body('linkedinUrl').optional().isURL().withMessage('LinkedIn URL must be valid'),
  body('instagramUrl').optional().isURL().withMessage('Instagram URL must be valid'),
  body('order').optional().isInt({ min: 0 }).withMessage('Order must be a non-negative integer')
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
    const updateData = { ...req.body };
    
    // Handle image upload if provided
    if (req.file) {
      const uploadResult = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          { 
            folder: 'seneca-science-club/team',
            transformation: [
              { width: 400, height: 400, crop: 'fill', gravity: 'face' }
            ]
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        ).end(req.file.buffer);
      });

      updateData.imageUrl = uploadResult.secure_url;
    }

    // Convert order to integer if provided
    if (updateData.order) {
      updateData.order = parseInt(updateData.order);
    }

    const member = await prisma.teamMember.update({
      where: { id },
      data: updateData
    });

    res.json(member);
  } catch (error) {
    console.error('Error updating team member:', error);
    res.status(500).json({ error: 'Failed to update team member' });
  }
});

// Delete team member (Admin only)
router.delete('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    
    const member = await prisma.teamMember.findUnique({
      where: { id }
    });

    if (!member) {
      return res.status(404).json({ error: 'Team member not found' });
    }

    // Delete image from Cloudinary if possible
    try {
      if (member.imageUrl) {
        const publicId = member.imageUrl.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(publicId);
      }
    } catch (cloudinaryError) {
      console.error('Failed to delete from Cloudinary:', cloudinaryError);
      // Continue with database deletion even if Cloudinary fails
    }

    await prisma.teamMember.delete({ where: { id } });

    res.json({ message: 'Team member deleted successfully' });
  } catch (error) {
    console.error('Error deleting team member:', error);
    res.status(500).json({ error: 'Failed to delete team member' });
  }
});

// Toggle team member active status (Admin only)
router.patch('/:id/toggle-status', auth, async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    
    const member = await prisma.teamMember.findUnique({
      where: { id }
    });

    if (!member) {
      return res.status(404).json({ error: 'Team member not found' });
    }

    const updatedMember = await prisma.teamMember.update({
      where: { id },
      data: { isActive: !member.isActive }
    });

    res.json(updatedMember);
  } catch (error) {
    console.error('Error toggling team member status:', error);
    res.status(500).json({ error: 'Failed to toggle team member status' });
  }
});

// Reorder team members (Admin only)
router.patch('/reorder', auth, [
  body('memberOrders').isArray().withMessage('Member orders must be an array'),
  body('memberOrders.*.id').isString().withMessage('Member ID is required'),
  body('memberOrders.*.order').isInt({ min: 0 }).withMessage('Order must be a non-negative integer')
], async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { memberOrders } = req.body;

    // Update all members with new order
    const updatePromises = memberOrders.map(({ id, order }) =>
      prisma.teamMember.update({
        where: { id },
        data: { order }
      })
    );

    await Promise.all(updatePromises);

    res.json({ message: 'Team member order updated successfully' });
  } catch (error) {
    console.error('Error reordering team members:', error);
    res.status(500).json({ error: 'Failed to reorder team members' });
  }
});

// Get team statistics
router.get('/stats/overview', async (req, res) => {
  try {
    const totalMembers = await prisma.teamMember.count();
    const activeMembers = await prisma.teamMember.count({
      where: { isActive: true }
    });

    const stats = {
      totalMembers,
      activeMembers,
      inactiveMembers: totalMembers - activeMembers
    };

    res.json(stats);
  } catch (error) {
    console.error('Error fetching team stats:', error);
    res.status(500).json({ error: 'Failed to fetch team statistics' });
  }
});

module.exports = router;
