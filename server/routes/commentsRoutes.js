const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const ensureAuth  = require('../middleware/ensureAuth');
const requireRole = require('../middleware/requireRole');

const Comment = require('../models/comment');
const Contact = require('../models/Contact');

// Helpers
const isSuper = (req) => (req.user?.roles || []).includes('SUPER_ADMIN');
const companyFilter = (req) => (isSuper(req) ? {} : { company: req.user.company });

/**
 * Guard: ensure the parent Contact exists AND is in the caller's tenant.
 * Returns the lean contact or sends the appropriate response.
 */
async function loadScopedContact(req, res) {
  const { contactId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(contactId)) {
    res.status(400).json({ error: 'Invalid contactId' });
    return null;
  }

  const filter = isSuper(req)
    ? { _id: contactId }
    : { _id: contactId, company: req.user.company };

  const contact = await Contact.findOne(filter).select('_id company communityId').lean();
  if (!contact) {
    res.status(404).json({ error: 'Contact not found' });
    return null;
  }
  return contact;
}

// All comment routes require auth
router.use(ensureAuth);

/**
 * GET /:contactId
 * Fetch comments for a contact, scoped by company.
 * Roles: READ for everyone logged in (READONLY or higher).
 */
router.get(
  '/:contactId',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const contact = await loadScopedContact(req, res);
      if (!contact) return;

      // Prefer filtering by company when the field exists on Comment
      const filter = { contact: contact._id, ...companyFilter(req) };

      const comments = await Comment
        .find(filter)
        .sort({ timestamp: -1 })
        .lean();

      res.json(comments);
    } catch (err) {
      console.error('GET comments error:', err);
      res.status(500).json({ error: 'Failed to fetch comments' });
    }
  }
);

/**
 * POST /
 * Create a new comment for a contact (in body).
 * Body: { contactId, type, content }
 * Roles: write for USER or higher.
 */
router.post(
  '/',
  requireRole('USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { type, content, contactId } = req.body;
      if (!type || !content || !contactId) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Verify parent contact in scope, and grab its company/community
      req.params.contactId = contactId; // reuse the loader
      const contact = await loadScopedContact(req, res);
      if (!contact) return;

      // Create the comment; stamp tenant + author (fields ignored if not in schema yet)
      const doc = await Comment.create({
        company: contact.company,                 // tenant scope
        communityId: contact.communityId || null, // optional secondary scope
        contact: contact._id,
        createdBy: req.user._id,
        type,
        content
      });

      // (Optional) maintain reverse reference if you keep an array on Contact
      try {
        await Contact.findByIdAndUpdate(contact._id, { $addToSet: { comments: doc._id } });
      } catch { /* ignore if you don't store comment ids on Contact */ }

      res.status(201).json(doc);
    } catch (err) {
      console.error('POST comment error:', err);
      res.status(500).json({ error: 'Failed to save comment' });
    }
  }
);

/**
 * DELETE /:commentId
 * Delete a comment within the caller's tenant.
 * Roles: MANAGER or higher (no accidental deletes by basic users).
 */
router.delete(
  '/:commentId',
  requireRole('MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { commentId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(commentId)) {
        return res.status(400).json({ error: 'Invalid commentId' });
      }

      const filter = { _id: commentId, ...companyFilter(req) };
      const out = await Comment.deleteOne(filter);
      if (!out.deletedCount) return res.status(404).json({ error: 'Not found' });

      res.sendStatus(204);
    } catch (err) {
      console.error('DELETE comment error:', err);
      res.status(500).json({ error: 'Failed to delete comment' });
    }
  }
);

module.exports = router;
