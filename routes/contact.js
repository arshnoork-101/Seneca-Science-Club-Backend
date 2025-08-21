const express = require('express');
const { body, validationResult } = require('express-validator');
const { prisma } = require('../config/database');
const nodemailer = require('nodemailer');

const router = express.Router();

// Configure email transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Submit contact form
router.post('/', [
  body('name').trim().isLength({ min: 2, max: 50 }).withMessage('Name must be 2-50 characters'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('subject').trim().isLength({ min: 5, max: 100 }).withMessage('Subject must be 5-100 characters'),
  body('message').trim().isLength({ min: 10, max: 1000 }).withMessage('Message must be 10-1000 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, subject, message } = req.body;

    // Save to database
    const contactMessage = await prisma.contactMessage.create({
      data: { name, email, subject, message }
    });

    // Send email notification
    try {
      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: process.env.SMTP_USER, // Send to admin
        subject: `New Contact Form: ${subject}`,
        html: `
          <h3>New Contact Form Submission</h3>
          <p><strong>From:</strong> ${name} (${email})</p>
          <p><strong>Subject:</strong> ${subject}</p>
          <p><strong>Message:</strong></p>
          <p>${message}</p>
        `
      });
    } catch (emailError) {
      console.error('Failed to send email notification:', emailError);
      // Don't fail the request if email fails
    }

    res.status(201).json({
      message: 'Contact form submitted successfully',
      id: contactMessage.id
    });
  } catch (error) {
    console.error('Error submitting contact form:', error);
    res.status(500).json({ error: 'Failed to submit contact form' });
  }
});

// Get all contact messages (Admin only)
router.get('/', async (req, res) => {
  try {
    const messages = await prisma.contactMessage.findMany({
      orderBy: { createdAt: 'desc' }
    });

    res.json(messages);
  } catch (error) {
    console.error('Error fetching contact messages:', error);
    res.status(500).json({ error: 'Failed to fetch contact messages' });
  }
});

// Mark message as read (Admin only)
router.patch('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    
    const message = await prisma.contactMessage.update({
      where: { id },
      data: { isRead: true }
    });

    res.json(message);
  } catch (error) {
    console.error('Error marking message as read:', error);
    res.status(500).json({ error: 'Failed to mark message as read' });
  }
});

// Delete message (Admin only)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.contactMessage.delete({
      where: { id }
    });

    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// FAQ data
router.get('/faq', (req, res) => {
  const faq = [
    {
      question: "How do I join the Seneca Science Club?",
      answer: "Membership is exclusive to Seneca Student Federation users. Visit clubs.ssfinc.ca/GENIUS/club_signup, select our club, and click join. You'll receive a confirmation once approved."
    },
    {
      question: "What are the benefits of joining?",
      answer: "Lifetime membership, networking opportunities, leadership roles, exposure to real-world science applications, exclusive events, and access to our community of science enthusiasts."
    },
    {
      question: "How do I register for events?",
      answer: "Browse our upcoming events on the Events page, click 'Register Now' on any event you're interested in, fill out the registration form with your details, and submit. You'll receive a confirmation email."
    },
    {
      question: "Can I contribute to the blog or gallery?",
      answer: "Yes! Active members can contribute blog posts, share photos from events, and submit content for our gallery. Contact our team for contribution guidelines and approval process."
    },
    {
      question: "What types of events do you host?",
      answer: "We host workshops, lectures, social events, competitions, field trips, conferences, and more. Our events cover various scientific disciplines and provide hands-on learning experiences."
    },
    {
      question: "How can I get involved in leadership?",
      answer: "Active members can apply for leadership positions. We look for dedicated individuals who are passionate about science and community building. Contact our current team for opportunities."
    },
    {
      question: "Is there a cost to join or attend events?",
      answer: "Membership is free for Seneca SSF users. Most events are also free, though some special workshops or field trips may have minimal costs to cover materials or transportation."
    },
    {
      question: "How do I stay updated on club activities?",
      answer: "Follow us on Instagram and LinkedIn for real-time updates, check our website regularly for events and blog posts, and join our mailing list for important announcements."
    }
  ];

  res.json(faq);
});

module.exports = router;
