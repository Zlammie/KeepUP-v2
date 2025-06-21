const express = require('express');
const router = express.Router();
const Comment = require('../models/comment');


// GET: Fetch comments for a contact
router.get('/:contactId', async (req, res) => {
  try {
    const comments = await Comment.find({ contact: req.params.contactId }).sort({ timestamp: -1 });
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// POST: Create a new comment
router.post('/', async (req, res) => {
  const { type, content, contactId } = req.body;

  if (!type || !content || !contactId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const comment = new Comment({ type, content, contact: contactId });
    await comment.save();

    // Optional: associate comment with the contact
    const Contact = require('../models/Contact');
    await Contact.findByIdAndUpdate(contactId, {
      $push: { comments: comment._id }
    });

    res.status(201).json(comment);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save comment' });
  }
});

module.exports = router;
