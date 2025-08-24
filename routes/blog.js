const express = require('express');
const { body, validationResult } = require('express-validator');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// File storage paths
const BLOG_DATA_FILE = path.join(__dirname, '../data/blog-posts.json');
const DATA_DIR = path.join(__dirname, '../data');

// Ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

// Read blog posts from file
async function readBlogPosts() {
  try {
    await ensureDataDir();
    const data = await fs.readFile(BLOG_DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // If file doesn't exist, return empty array
    return [];
  }
}

// Write blog posts to file
async function writeBlogPosts(posts) {
  await ensureDataDir();
  await fs.writeFile(BLOG_DATA_FILE, JSON.stringify(posts, null, 2));
}

// Get all published blog posts
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, tag } = req.query;
    
    let posts = await readBlogPosts();
    
    // Filter published posts
    posts = posts.filter(post => post.isPublished);
    
    // Filter by tag if provided
    if (tag) {
      posts = posts.filter(post => 
        post.tags && (
          (Array.isArray(post.tags) && post.tags.includes(tag)) ||
          (typeof post.tags === 'string' && post.tags.includes(tag))
        )
      );
    }
    
    // Sort by publishedAt desc
    posts.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    
    // Pagination
    const total = posts.length;
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedPosts = posts.slice(startIndex, endIndex);

    res.json({
      posts: paginatedPosts,
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
    
    const posts = await readBlogPosts();
    const post = posts.find(p => p.id === id);

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
router.post('/', [
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
    
    const posts = await readBlogPosts();
    const newPost = {
      id: uuidv4(),
      title,
      content,
      excerpt,
      tags,
      imageUrl,
      author: {
        firstName: 'Admin',
        lastName: 'User',
        program: 'Science Club'
      },
      isPublished: true,
      publishedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    posts.push(newPost);
    await writeBlogPosts(posts);

    res.status(201).json(newPost);
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
  body('tags').optional(),
  body('author').custom((value) => {
    if (typeof value === 'string' && value.trim().length > 0) return true;
    if (typeof value === 'object' && value.firstName && value.firstName.trim().length > 0) return true;
    throw new Error('Author is required');
  }),
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

    const posts = await readBlogPosts();
    const newPost = {
      id: uuidv4(),
      title,
      content,
      excerpt,
      tags: Array.isArray(tags) ? tags : (tags ? tags.split(',').map(t => t.trim()) : []),
      imageUrl,
      author: {
        firstName: authorParts.firstName,
        lastName: authorParts.lastName,
        program: 'Science Club'
      },
      isPublished: true,
      publishedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    posts.push(newPost);
    await writeBlogPosts(posts);

    res.status(201).json(newPost);
  } catch (error) {
    console.error('Error creating blog post:', error);
    res.status(500).json({ error: 'Failed to create blog post' });
  }
});

// Update blog post
router.put('/:id', [
  body('title').optional().trim().isLength({ min: 5, max: 200 }).withMessage('Title must be 5-200 characters'),
  body('content').optional().trim().isLength({ min: 10 }).withMessage('Content must be at least 10 characters'),
  body('excerpt').optional().trim().isLength({ min: 10, max: 300 }).withMessage('Excerpt must be 10-300 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const posts = await readBlogPosts();
    const postIndex = posts.findIndex(p => p.id === id);

    if (postIndex === -1) {
      return res.status(404).json({ error: 'Blog post not found' });
    }

    // Update the post
    posts[postIndex] = {
      ...posts[postIndex],
      ...req.body,
      updatedAt: new Date().toISOString()
    };

    await writeBlogPosts(posts);
    res.json(posts[postIndex]);
  } catch (error) {
    console.error('Error updating blog post:', error);
    res.status(500).json({ error: 'Failed to update blog post' });
  }
});

// Delete blog post
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const posts = await readBlogPosts();
    const postIndex = posts.findIndex(p => p.id === id);

    if (postIndex === -1) {
      return res.status(404).json({ error: 'Blog post not found' });
    }

    posts.splice(postIndex, 1);
    await writeBlogPosts(posts);

    res.json({ message: 'Blog post deleted successfully' });
  } catch (error) {
    console.error('Error deleting blog post:', error);
    res.status(500).json({ error: 'Failed to delete blog post' });
  }
});

// Publish/Unpublish blog post
router.patch('/:id/publish', async (req, res) => {
  try {
    const { id } = req.params;
    const { isPublished } = req.body;
    
    const posts = await readBlogPosts();
    const postIndex = posts.findIndex(p => p.id === id);

    if (postIndex === -1) {
      return res.status(404).json({ error: 'Blog post not found' });
    }

    posts[postIndex] = {
      ...posts[postIndex],
      isPublished,
      publishedAt: isPublished ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString()
    };

    await writeBlogPosts(posts);
    res.json(posts[postIndex]);
  } catch (error) {
    console.error('Error updating blog post status:', error);
    res.status(500).json({ error: 'Failed to update blog post status' });
  }
});

// Get blog post tags
router.get('/tags/all', async (req, res) => {
  try {
    const posts = await readBlogPosts();
    const publishedPosts = posts.filter(post => post.isPublished);

    const allTags = publishedPosts.flatMap(post => 
      Array.isArray(post.tags) ? post.tags : 
      (typeof post.tags === 'string' ? post.tags.split(',').map(t => t.trim()) : [])
    );
    const uniqueTags = [...new Set(allTags)].filter(tag => tag && tag.length > 0);

    res.json(uniqueTags);
  } catch (error) {
    console.error('Error fetching blog tags:', error);
    res.status(500).json({ error: 'Failed to fetch blog tags' });
  }
});

module.exports = router;
