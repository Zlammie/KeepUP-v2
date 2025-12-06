const express = require('express');
const { Types } = require('mongoose');

const router = express.Router();

const ensureAuth = require('../middleware/ensureAuth');
const requireRole = require('../middleware/requireRole');

const Comment = require('../models/comment');
const Contact = require('../models/Contact');

const READ_ROLES = ['READONLY', 'USER', 'MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'];
const WRITE_ROLES = ['USER', 'MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'];
const DELETE_ROLES = ['MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'];

const isObjectId = (value) => Types.ObjectId.isValid(String(value));
const isSuper = (req) => (req.user?.roles || []).includes('SUPER_ADMIN');
const companyScope = (req) => (isSuper(req) ? {} : { company: req.user.company });

/**
 * Guard: ensure the parent Contact exists AND is in the caller's tenant.
 * Returns the lean contact or sends the appropriate response.
 */
async function loadScopedContact(req, res, contactIdFromRequest) {
  const contactId = contactIdFromRequest ?? req.params.contactId;
  if (!isObjectId(contactId)) {
    res.status(400).json({ error: 'Invalid contactId' });
    return null;
  }

  const filter = { _id: contactId, ...companyScope(req) };
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
 */
router.get('/:contactId', requireRole(...READ_ROLES), async (req, res) => {
  try {
    const contact = await loadScopedContact(req, res);
    if (!contact) return;

    const comments = await Comment.find({ contact: contact._id, ...companyScope(req) })
      .sort({ timestamp: -1 })
      .select('type content timestamp createdBy contact company communityId')
      .lean();

    res.json(comments);
  } catch (err) {
    console.error('GET comments error:', err);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

/**
 * POST /
 * Create a new comment for a contact (in body).
 * Body: { contactId, type, content }
 */
router.post('/', requireRole(...WRITE_ROLES), async (req, res) => {
  try {
    const contactId = req.body?.contactId;
    const type = (req.body?.type || '').trim();
    const content = (req.body?.content || '').trim();

    if (!contactId || !type || !content) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const contact = await loadScopedContact(req, res, contactId);
    if (!contact) return;

    const doc = await Comment.create({
      company: contact.company,
      communityId: contact.communityId || null,
      contact: contact._id,
      createdBy: req.user._id,
      type,
      content
    });

    // (Optional) maintain reverse reference if you keep an array on Contact
    void Contact.findByIdAndUpdate(contact._id, { $addToSet: { comments: doc._id } }).catch(() => {});

    res.status(201).json(doc);
  } catch (err) {
    console.error('POST comment error:', err);
    res.status(500).json({ error: 'Failed to save comment' });
  }
});

/**
 * DELETE /:commentId
 * Delete a comment within the caller's tenant.
 */
router.delete('/:commentId', requireRole(...DELETE_ROLES), async (req, res) => {
  try {
    const { commentId } = req.params;
    if (!isObjectId(commentId)) {
      return res.status(400).json({ error: 'Invalid commentId' });
    }

    const filter = { _id: commentId, ...companyScope(req) };
    const out = await Comment.deleteOne(filter);
    if (!out.deletedCount) return res.status(404).json({ error: 'Not found' });

    res.sendStatus(204);
  } catch (err) {
    console.error('DELETE comment error:', err);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

module.exports = router;
