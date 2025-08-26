const express = require('express');
const router = express.Router();
const Community = require('../models/Community'); // your existing community.js
const Competition = require('../models/Competition'); // existing competitor model
const CommunityCompetitionProfile = require('../models/communityCompetitionProfile');

// helper: derive stats from Community.lots
function deriveLotStats(community) {
  const lots = Array.isArray(community?.lots) ? community.lots : [];
  const total = (typeof community.totalLots === 'number')
    ? community.totalLots
    : lots.length;

  // SOLD = lots that have a linked Contact
  const sold = lots.filter(l => !!l && !!l.purchaser).length;

  const remaining = total - sold;

  // We'll add QMI ("started") later; set 0 for now
  const quickMoveInLots = 0;

  return { total, sold, remaining, quickMoveInLots };
}



// GET: minimal list for dropdown (name + id + optional address/hoa)
router.get('/api/communities/select-options', async (req, res) => {
  try {
    // Adjust fields to match your Community schema
    const communities = await Community.find({})
      .select('name address hoa') // add fields you want
      .sort({ name: 1 })
      .lean();

    res.json(communities);
  } catch (err) {
    console.error('GET /api/communities/select-options error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET: upsert-read for a community’s profile (creates empty profile if missing)
router.get('/api/my-community-competition/:communityId', async (req, res) => {
  const { communityId } = req.params;
  const community = await Community.findById(communityId);
  if (!community) return res.status(404).json({ error: 'Community not found' });

  let profile = await CommunityCompetitionProfile
    .findOne({ community: communityId })
    .populate('linkedCompetitions', 'name builder market')
    .lean();

  if (!profile) {
    profile = await CommunityCompetitionProfile.create({
      community: communityId,
      promotion: '',
      topPlans: { plan1: '', plan2: '', plan3: '' },
      prosCons: { pros: [], cons: [] },
      lotCounts: { total: null, sold: null, remaining: null, quickMoveInLots: null },
      notes: '',
      linkedCompetitions: []
    });
    profile = await CommunityCompetitionProfile.findById(profile._id)
      .populate('linkedCompetitions', 'name builder market')
      .lean();
  }

  const computed = deriveLotStats(community);
  const mergedProfile = { ...profile, lotCounts: { ...(profile.lotCounts || {}), ...computed } };
  res.json({ community, profile: mergedProfile });
});

router.get('/api/communities/:id/lot-stats', async (req, res) => {
  try {
    const community = await Community.findById(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found' });
    res.json(deriveLotStats(community));
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});


// PUT: update the profile fields (autosave-friendly)
router.put('/api/my-community-competition/:communityId', async (req, res) => {
  const { communityId } = req.params;
  const incoming = req.body;

  const community = await Community.findById(communityId);
  if (!community) return res.status(404).json({ error: 'Community not found' });

  const computed = deriveLotStats(community);

  // strip any client-sent computed fields
  const safeLotCounts = { ...(incoming.lotCounts || {}) };
  delete safeLotCounts.total;
  delete safeLotCounts.sold;
  delete safeLotCounts.remaining;
  delete safeLotCounts.quickMoveInLots;

  const update = { ...incoming, lotCounts: { ...safeLotCounts, ...computed } };

  const profile = await CommunityCompetitionProfile.findOneAndUpdate(
    { community: communityId },
    { $set: update },
    { new: true, upsert: true }
  ).populate('linkedCompetitions', 'name builder market');

  res.json(profile);
});


// PUT: set linked competitions list (replace or patch)
router.put('/api/my-community-competition/:communityId/linked-competitions', async (req, res) => {
  try {
    const { communityId } = req.params;
    const { competitionIds } = req.body; // e.g. [ "66a..", "66b.." ]

    const profile = await CommunityCompetitionProfile.findOneAndUpdate(
      { community: communityId },
      { $set: { linkedCompetitions: competitionIds } },
      { new: true, upsert: true }
    ).populate('linkedCompetitions', 'name builder market');

    res.json(profile);
  } catch (err) {
    console.error('PUT linked-competitions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Optional: search endpoint to pick competitors from your existing list
router.get('/api/competitions/search', async (req, res) => {
  try {
    const { q } = req.query;
    const filter = q
      ? { name: new RegExp(q, 'i') } // or builder/market fields as needed
      : {};
    const results = await Competition.find(filter).select('name builder market').limit(25).lean();
    res.json(results);
  } catch (err) {
    console.error('GET competitions search error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
