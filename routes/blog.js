const express = require('express');
const { body, validationResult } = require('express-validator');
const { prisma } = require('../config/database');
const auth = require('../middleware/auth');

const router = express.Router();

// Get all published blog posts
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, tag } = req.query;
    
    const where = { isPublished: true };
    if (tag) where.tags = { has: tag };
    
    const posts = await prisma.blogPost.findMany({
      where,
      include: {
        author: {
          select: {
            firstName: true,
            lastName: true,
            program: true
          }
        }
      },
      orderBy: { publishedAt: 'desc' },
      take: parseInt(limit),
      skip: (parseInt(page) - 1) * parseInt(limit)
    });

    const total = await prisma.blogPost.count({ where });

    res.json({
      posts,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / parseInt(limit)),
        hasNext: parseInt(page) * parseInt(limit) < total,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Error fetching blog posts:', error);
    res.status(500).json({ error: 'Failed to fetch blog posts' });
  }
});

// Get single blog post by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const post = await prisma.blogPost.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            firstName: true,
            lastName: true,
            program: true,
            year: true
          }
        }
      }
    });

    if (!post || !post.isPublished) {
      return res.status(404).json({ error: 'Blog post not found' });
    }

    res.json(post);
  } catch (error) {
    console.error('Error fetching blog post:', error);
    res.status(500).json({ error: 'Failed to fetch blog post' });
  }
});

// Create new blog post (Authenticated users)
router.post('/', auth, [
  body('title').trim().isLength({ min: 5, max: 200 }).withMessage('Title must be 5-200 characters'),
  body('content').trim().isLength({ min: 100 }).withMessage('Content must be at least 100 characters'),
  body('excerpt').trim().isLength({ min: 20, max: 300 }).withMessage('Excerpt must be 20-300 characters'),
  body('tags').isArray({ min: 1 }).withMessage('At least one tag is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { title, content, excerpt, tags, imageUrl } = req.body;
    
    const post = await prisma.blogPost.create({
      data: {
        title,
        content,
        excerpt,
        tags,
        imageUrl,
        authorId: req.user.id,
        isPublished: req.user.role === 'ADMIN' // Auto-publish for admins
      }
    });

    res.status(201).json(post);
  } catch (error) {
    console.error('Error creating blog post:', error);
    res.status(500).json({ error: 'Failed to create blog post' });
  }
});

// Create new blog post with access code (Simplified for frontend)
router.post('/simple', [
  body('title').trim().isLength({ min: 5, max: 200 }).withMessage('Title must be 5-200 characters'),
  body('content').trim().isLength({ min: 10 }).withMessage('Content must be at least 10 characters'),
  body('excerpt').trim().isLength({ min: 10, max: 300 }).withMessage('Excerpt must be 10-300 characters'),
  body('tags').isArray({ min: 1 }).withMessage('At least one tag is required'),
  body('author').notEmpty().withMessage('Author is required'),
  body('accessCode').notEmpty().withMessage('Access code is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { title, content, excerpt, tags, imageUrl, author, accessCode } = req.body;
    
    // Verify access code
    const validCode = process.env.MENTOR_ACCESS_CODE || 'SSC2024MENTOR';
    if (accessCode !== validCode) {
      return res.status(401).json({ error: 'Invalid access code' });
    }

    // Parse author name
    const authorParts = author.firstName && author.lastName 
      ? author 
      : { firstName: author.split(' ')[0] || 'Anonymous', lastName: author.split(' ').slice(1).join(' ') || '' };

    // Create a default user if none exists (for simplified posting)
    let defaultUser = await prisma.user.findFirst({
      where: { email: 'mentor@ssc.com' }
    });

    if (!defaultUser) {
      defaultUser = await prisma.user.create({
        data: {
          firstName: authorParts.firstName,
          lastName: authorParts.lastName,
          email: 'mentor@ssc.com',
          senecaId: 'MENTOR001',
          program: 'Science Club',
          year: 1,
          password: 'placeholder',
          role: 'ADMIN',
          isActive: true
        }
      });
    }

    const post = await prisma.blogPost.create({
      data: {
        title,
        content,
        excerpt,
        tags,
        imageUrl,
        authorId: defaultUser.id,
        isPublished: true,
        publishedAt: new Date()
      },
      include: {
        author: {
          select: {
            firstName: true,
            lastName: true,
            program: true
          }
        }
      }
    });

    res.status(201).json(post);
  } catch (error) {
    console.error('Error creating blog post:', error);
    res.status(500).json({ error: 'Failed to create blog post' });
  }
});

// Update blog post (Author or Admin)
router.put('/:id', auth, [
  body('title').optional().trim().isLength({ min: 5, max: 200 }).withMessage('Title must be 5-200 characters'),
  body('content').optional().trim().isLength({ min: 100 }).withMessage('Content must be at least 100 characters'),
  body('excerpt').optional().trim().isLength({ min: 20, max: 300 }).withMessage('Excerpt must be 20-300 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    
    // Check if user can edit this post
    const existingPost = await prisma.blogPost.findUnique({
      where: { id },
      select: { authorId: true }
    });

    if (!existingPost) {
      return res.status(404).json({ error: 'Blog post not found' });
    }

    if (existingPost.authorId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not authorized to edit this post' });
    }

    const post = await prisma.blogPost.update({
      where: { id },
      data: req.body
    });

    res.json(post);
  } catch (error) {
    console.error('Error updating blog post:', error);
    res.status(500).json({ error: 'Failed to update blog post' });
  }
});

// Delete blog post (Author or Admin)
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const existingPost = await prisma.blogPost.findUnique({
      where: { id },
      select: { authorId: true }
    });

    if (!existingPost) {
      return res.status(404).json({ error: 'Blog post not found' });
    }

    if (existingPost.authorId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not authorized to delete this post' });
    }

    await prisma.blogPost.delete({ where: { id } });

    res.json({ message: 'Blog post deleted successfully' });
  } catch (error) {
    console.error('Error deleting blog post:', error);
    res.status(500).json({ error: 'Failed to delete blog post' });
  }
});

// Publish/Unpublish blog post (Admin only)
router.patch('/:id/publish', auth, async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    const { isPublished } = req.body;

    const post = await prisma.blogPost.update({
      where: { id },
      data: {
        isPublished,
        publishedAt: isPublished ? new Date() : null
      }
    });

    res.json(post);
  } catch (error) {
    console.error('Error updating blog post status:', error);
    res.status(500).json({ error: 'Failed to update blog post status' });
  }
});

// Get blog post tags
router.get('/tags/all', async (req, res) => {
  try {
    const posts = await prisma.blogPost.findMany({
      where: { isPublished: true },
      select: { tags: true }
    });

    const allTags = posts.flatMap(post => post.tags);
    const uniqueTags = [...new Set(allTags)];

    res.json(uniqueTags);
  } catch (error) {
    console.error('Error fetching blog tags:', error);
    res.status(500).json({ error: 'Failed to fetch blog tags' });
  }
});

module.exports = router;
