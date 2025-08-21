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

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed'), false);
    }
  }
});

// Get all gallery items with filtering
router.get('/', async (req, res) => {
  try {
    const { category, eventId, page = 1, limit = 20 } = req.query;
    
    const where = {};
    if (category) where.category = category;
    if (eventId) where.eventId = eventId;
    
    const items = await prisma.galleryItem.findMany({
      where,
      include: {
        event: {
          select: {
            title: true,
            date: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
      skip: (parseInt(page) - 1) * parseInt(limit)
    });

    const total = await prisma.galleryItem.count({ where });

    res.json({
      items,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / parseInt(limit)),
        hasNext: parseInt(page) * parseInt(limit) < total,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Error fetching gallery items:', error);
    res.status(500).json({ error: 'Failed to fetch gallery items' });
  }
});

// Get single gallery item
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const item = await prisma.galleryItem.findUnique({
      where: { id },
      include: {
        event: {
          select: {
            title: true,
            date: true,
            description: true
          }
        }
      }
    });

    if (!item) {
      return res.status(404).json({ error: 'Gallery item not found' });
    }

    res.json(item);
  } catch (error) {
    console.error('Error fetching gallery item:', error);
    res.status(500).json({ error: 'Failed to fetch gallery item' });
  }
});

// Upload new gallery item
router.post('/', auth, upload.single('media'), [
  body('title').trim().isLength({ min: 3, max: 100 }).withMessage('Title must be 3-100 characters'),
  body('description').optional().trim().isLength({ max: 500 }).withMessage('Description must be under 500 characters'),
  body('category').isIn(['EVENTS', 'WORKSHOPS', 'SOCIALS', 'COMPETITIONS', 'FIELD_TRIPS', 'OTHER']).withMessage('Invalid category'),
  body('tags').optional().isArray().withMessage('Tags must be an array')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Media file is required' });
    }

    const { title, description, category, tags = [], eventId } = req.body;

    // Upload to Cloudinary
    let uploadResult;
    if (req.file.mimetype.startsWith('image/')) {
      uploadResult = await cloudinary.uploader.upload_stream(
        { folder: 'seneca-science-club/gallery' },
        (error, result) => {
          if (error) {
            console.error('Cloudinary upload error:', error);
            return res.status(500).json({ error: 'Failed to upload media' });
          }
        }
      ).end(req.file.buffer);
    } else if (req.file.mimetype.startsWith('video/')) {
      uploadResult = await cloudinary.uploader.upload_stream(
        { 
          folder: 'seneca-science-club/gallery',
          resource_type: 'video'
        },
        (error, result) => {
          if (error) {
            console.error('Cloudinary upload error:', error);
            return res.status(500).json({ error: 'Failed to upload media' });
          }
        }
      ).end(req.file.buffer);
    }

    // Create gallery item
    const galleryItem = await prisma.galleryItem.create({
      data: {
        title,
        description,
        category,
        tags,
        eventId: eventId || null,
        imageUrl: req.file.mimetype.startsWith('image/') ? uploadResult.secure_url : null,
        videoUrl: req.file.mimetype.startsWith('video/') ? uploadResult.secure_url : null
      }
    });

    res.status(201).json(galleryItem);
  } catch (error) {
    console.error('Error creating gallery item:', error);
    res.status(500).json({ error: 'Failed to create gallery item' });
  }
});

// Update gallery item (Admin or uploader)
router.put('/:id', auth, [
  body('title').optional().trim().isLength({ min: 3, max: 100 }).withMessage('Title must be 3-100 characters'),
  body('description').optional().trim().isLength({ max: 500 }).withMessage('Description must be under 500 characters'),
  body('category').optional().isIn(['EVENTS', 'WORKSHOPS', 'SOCIALS', 'COMPETITIONS', 'FIELD_TRIPS', 'OTHER']).withMessage('Invalid category')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    
    // Check if user can edit this item
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const item = await prisma.galleryItem.update({
      where: { id },
      data: req.body
    });

    res.json(item);
  } catch (error) {
    console.error('Error updating gallery item:', error);
    res.status(500).json({ error: 'Failed to update gallery item' });
  }
});

// Delete gallery item (Admin only)
router.delete('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    
    const item = await prisma.galleryItem.findUnique({
      where: { id }
    });

    if (!item) {
      return res.status(404).json({ error: 'Gallery item not found' });
    }

    // Delete from Cloudinary if possible
    try {
      if (item.imageUrl) {
        const publicId = item.imageUrl.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(publicId);
      }
      if (item.videoUrl) {
        const publicId = item.videoUrl.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
      }
    } catch (cloudinaryError) {
      console.error('Failed to delete from Cloudinary:', cloudinaryError);
      // Continue with database deletion even if Cloudinary fails
    }

    await prisma.galleryItem.delete({ where: { id } });

    res.json({ message: 'Gallery item deleted successfully' });
  } catch (error) {
    console.error('Error deleting gallery item:', error);
    res.status(500).json({ error: 'Failed to delete gallery item' });
  }
});

// Get gallery categories
router.get('/categories/all', async (req, res) => {
  try {
    const categories = ['EVENTS', 'WORKSHOPS', 'SOCIALS', 'COMPETITIONS', 'FIELD_TRIPS', 'OTHER'];
    res.json(categories);
  } catch (error) {
    console.error('Error fetching gallery categories:', error);
    res.status(500).json({ error: 'Failed to fetch gallery categories' });
  }
});

// Get gallery statistics
router.get('/stats/overview', async (req, res) => {
  try {
    const totalItems = await prisma.galleryItem.count();
    const itemsByCategory = await prisma.galleryItem.groupBy({
      by: ['category'],
      _count: true
    });

    const stats = {
      totalItems,
      itemsByCategory: itemsByCategory.reduce((acc, item) => {
        acc[item.category] = item._count;
        return acc;
      }, {})
    };

    res.json(stats);
  } catch (error) {
    console.error('Error fetching gallery stats:', error);
    res.status(500).json({ error: 'Failed to fetch gallery statistics' });
  }
});

module.exports = router;
