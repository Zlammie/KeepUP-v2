

// routes/contactRoutes.js

const express = require('express');
const router = express.Router();
const Contact = require('../models/Contact');
const Lender = require('../models/lenderModel');
const Community = require('../models/Community');

// Link a lot to a contact
router.get('/ping', (req, res) => res.send('pong'));


router.post('/:contactId/link-lot', async (req, res) => {
  console.log('✅ LINK LOT route HIT for', req.params.contactId);
  const { contactId } = req.params;
  const { lotId } = req.body;

  try {
    const contact = await Contact.findById(contactId);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    const community = await Community.findById(contact.communityId);
    if (!community) return res.status(404).json({ error: 'Community not found' });

    const lot = community.lots.find(l => String(l._id) === lotId);
    if (!lot) return res.status(404).json({ error: 'Lot not found in selected community' });

       if (Array.isArray(contact.lenders)) {
      contact.lenders.forEach(entry => {
        if (entry.status) {
          entry.status = entry.status.toLowerCase();
        }
      });
    }

    contact.linkedLot = {
      jobNumber: lot.jobNumber,
      address: lot.address,
      lot: lot.lot,
      block: lot.block,
      phase: lot.phase
    };

    await contact.save();
    res.json({ success: true, contact });
  } catch (err) {
    console.error('Failed to link lot:', err);
    res.status(500).json({ error: 'Failed to link lot' });
  }
});

// Create a contact
router.post('/', async (req, res) => {
  try {
    const contact = new Contact(req.body);
    await contact.save();
    res.status(201).json(contact);
  } catch (err) {
    res.status(400).json({ error: 'Failed to save contact', details: err.message });
  }
});

// Get all contacts
router.get('/', async (req, res) => {
  try {
    const contacts = await Contact.find().populate('realtor');
    res.json(contacts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch contacts', details: err.message });
  }
});



// Get a single contact by ID
router.get('/:id', async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id)
      .populate('realtor')
      .populate('lenders.lender')
      .populate('communityId');
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    res.json(contact);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch contact', details: err.message });
  }
});

// Update a contact
router.put('/:id', async (req, res) => {
  try {
    const updateData = { ...req.body };
    console.log('[UPDATE]', updateData);

    if (Array.isArray(req.body.lenders) && req.body.lenders.length > 0) {
      updateData.lenders = [req.body.lenders[0]];
    }

    const updated = await Contact.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update contact', details: err.message });
  }
});

// Get all contacts for a given realtor
router.get('/by-realtor/:realtorId', async (req, res) => {
  try {
    const contacts = await Contact.find({ realtor: req.params.realtorId });
    res.json(contacts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch contacts', details: err.message });
  }
});

// Get all contacts for a given lender
router.get('/by-lender/:lenderId', async (req, res) => {
  try {
    const contacts = await Contact.find({ 'lenders.lender': req.params.lenderId }).populate('lenders.lender');
    res.json(contacts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch contacts by lender', details: err.message });
  }
});

router.patch('/:contactId/lenders/:entryId', async (req, res) => {
  try {
    const { contactId, entryId } = req.params;
    const { status, inviteDate, approvedDate } = req.body;

    const contact = await Contact.findOneAndUpdate(
      { _id: contactId, 'lenders._id': entryId },
      {
        $set: {
          'lenders.$.status': status,
          'lenders.$.inviteDate': inviteDate,
          'lenders.$.approvedDate': approvedDate
        }
      },
      { new: true }
    ).populate('lenders.lender');

    if (!contact) {
      return res.status(404).json({ error: 'Contact or lender entry not found' });
    }

    res.json(contact);
  } catch (err) {
    console.error('Error updating lender info:', err);
    res.status(500).json({ error: 'Failed to update lender info' });
  }
});

// DELETE one lender from a contact's lenders array
router.delete('/:contactId/lenders/:lenderLinkId', async (req, res) => {
  try {
    const { contactId, lenderLinkId } = req.params;
    const updated = await Contact.findByIdAndUpdate(
      contactId,
      { $pull: { lenders: { _id: lenderLinkId } } },
      { new: true }
    )
      .populate('realtor')
      .populate('lenders.lender');

    if (!updated) return res.status(404).json({ error: 'Contact not found' });
    res.json(updated);
  } catch (err) {
    console.error('Error unlinking lender:', err);
    res.status(500).json({ error: 'Failed to unlink lender' });
  }
});

// PATCH: Link a new lender to a contact
router.patch('/:contactId/link-lender', async (req, res) => {
  try {
    const { contactId } = req.params;
    const { lenderId, status, inviteDate, approvedDate } = req.body;

    const updated = await Contact.findByIdAndUpdate(
      contactId,
      {
        $push: {
          lenders: {
            lender: lenderId,
            status,
            inviteDate,
            approvedDate
          }
        }
      },
      { new: true }
    ).populate('realtor').populate('lenders.lender');

    if (!updated) return res.status(404).json({ error: 'Contact not found' });

    res.json(updated);
  } catch (err) {
    console.error('Error linking lender:', err);
    res.status(500).json({ error: 'Failed to link lender' });
  }
});

// Search lenders
router.get('/search', async (req, res) => {
  const q = req.query.q;
  const regex = new RegExp(q, 'i');
  const results = await Lender.find({
    $or: [
      { firstName: regex },
      { lastName: regex },
      { email: regex },
      { phone: regex }
    ]
  }).limit(10);
  res.json(results);
});

// PATCH: Unlink all lenders from contact
router.patch('/:id/unlink-lender', async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    contact.lenders = [];
    await contact.save();

    res.json({ success: true });
  } catch (err) {
    console.error('Unlink error:', err);
    res.status(500).json({ error: 'Failed to unlink lender' });
  }
});

module.exports = router;
