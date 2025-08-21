
const express = require('express');
const { body, validationResult } = require('express-validator');
const { prisma } = require('../config/database');
const auth = require('../middleware/auth');

const router = express.Router();

// Get all events with optional filtering
router.get('/', async (req, res) => {
  try {
    const { status, category, limit = 20, page = 1 } = req.query;
    
    const where = {};
    if (status) where.status = status;
    if (category) where.category = category;
    
    const events = await prisma.event.findMany({
      where,
      include: {
        registrations: {
          select: {
            id: true,
            status: true,
            user: {
              select: {
                firstName: true,
                lastName: true,
                program: true
              }
            }
          }
        }
      },
      orderBy: { date: 'asc' },
      take: parseInt(limit),
      skip: (parseInt(page) - 1) * parseInt(limit)
    });

    const total = await prisma.event.count({ where });

    res.json({
      events,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / parseInt(limit)),
        hasNext: parseInt(page) * parseInt(limit) < total,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// Get single event by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        registrations: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                program: true,
                year: true
              }
            }
          }
        },
        galleryItems: true
      }
    });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json(event);
  } catch (error) {
    console.error('Error fetching event:', error);
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

// Create new event (Admin only)
router.post('/', auth, [
  body('title').trim().isLength({ min: 3, max: 100 }).withMessage('Title must be 3-100 characters'),
  body('description').trim().isLength({ min: 10 }).withMessage('Description must be at least 10 characters'),
  body('date').isISO8601().withMessage('Invalid date format'),
  body('startTime').notEmpty().withMessage('Start time is required'),
  body('endTime').notEmpty().withMessage('End time is required'),
  body('location').trim().notEmpty().withMessage('Location is required'),
  body('category').isIn(['WORKSHOP', 'LECTURE', 'SOCIAL', 'COMPETITION', 'FIELD_TRIP', 'CONFERENCE', 'OTHER']).withMessage('Invalid category'),
  body('maxCapacity').optional().isInt({ min: 1 }).withMessage('Max capacity must be a positive integer')
], async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const event = await prisma.event.create({
      data: req.body
    });

    res.status(201).json(event);
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// Update event (Admin only)
router.put('/:id', auth, [
  body('title').optional().trim().isLength({ min: 3, max: 100 }).withMessage('Title must be 3-100 characters'),
  body('description').optional().trim().isLength({ min: 10 }).withMessage('Description must be at least 10 characters'),
  body('date').optional().isISO8601().withMessage('Invalid date format'),
  body('category').optional().isIn(['WORKSHOP', 'LECTURE', 'SOCIAL', 'COMPETITION', 'FIELD_TRIP', 'CONFERENCE', 'OTHER']).withMessage('Invalid category')
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
    const event = await prisma.event.update({
      where: { id },
      data: req.body
    });

    res.json(event);
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// Delete event (Admin only)
router.delete('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    await prisma.event.delete({ where: { id } });

    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// Register for event
router.post('/:id/register', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('senecaId').trim().notEmpty().withMessage('Seneca ID is required'),
  body('program').trim().notEmpty().withMessage('Program is required'),
  body('year').isInt({ min: 1, max: 4 }).withMessage('Year must be 1-4')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { name, email, senecaId, program, year } = req.body;

    // Check if event exists and has capacity
    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (event.maxCapacity && event.currentCapacity >= event.maxCapacity) {
      return res.status(400).json({ error: 'Event is at full capacity' });
    }

    // Check if user already registered
    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ email }, { senecaId }] }
    });

    let userId;
    if (existingUser) {
      userId = existingUser.id;
      
      // Check if already registered for this event
      const existingRegistration = await prisma.eventRegistration.findFirst({
        where: { userId, eventId: id }
      });
      
      if (existingRegistration) {
        return res.status(400).json({ error: 'Already registered for this event' });
      }
    } else {
      // Create new user
      const newUser = await prisma.user.create({
        data: {
          email,
          senecaId,
          firstName: name.split(' ')[0],
          lastName: name.split(' ').slice(1).join(' ') || '',
          program,
          year,
          password: 'temp-password-' + Math.random().toString(36).substr(2, 9)
        }
      });
      userId = newUser.id;
    }

    // Create registration
    const registration = await prisma.eventRegistration.create({
      data: {
        userId,
        eventId: id
      }
    });

    // Update event capacity
    await prisma.event.update({
      where: { id },
      data: { currentCapacity: { increment: 1 } }
    });

    res.status(201).json({
      message: 'Successfully registered for event',
      registration
    });
  } catch (error) {
    console.error('Error registering for event:', error);
    res.status(500).json({ error: 'Failed to register for event' });
  }
});

// Get event registrations (Admin only)
router.get('/:id/registrations', auth, async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    const registrations = await prisma.eventRegistration.findMany({
      where: { eventId: id },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            program: true,
            year: true
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    res.json(registrations);
  } catch (error) {
    console.error('Error fetching registrations:', error);
    res.status(500).json({ error: 'Failed to fetch registrations' });
  }
});

module.exports = router;
