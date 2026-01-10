const express = require('express');
const mongoose = require('mongoose');
const PublicHome = require('../models/buildrootz/PublicHome');

const router = express.Router();

const isId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));

router.get('/communities/:communityId/builders', async (req, res) => {
  try {
    const { communityId } = req.params;
    if (!isId(communityId)) {
      return res.status(400).json({ error: 'Invalid communityId' });
    }

    const communityObjectId = new mongoose.Types.ObjectId(communityId);

    const pipeline = [
      {
        $match: {
          publicCommunityId: communityObjectId,
          status: { $regex: /^model$/i }
        }
      },
      {
        $addFields: {
          builderKey: {
            $cond: [
              { $ifNull: ['$builderId', false] },
              '$builderId',
              {
                $cond: [
                  { $ifNull: ['$companyId', false] },
                  '$companyId',
                  {
                    $toLower: {
                      $ifNull: ['$builder.slug', '$builder.name']
                    }
                  }
                ]
              }
            ]
          },
          publishedFlag: { $cond: ['$published', 1, 0] }
        }
      },
      { $sort: { publishedFlag: -1, updatedAt: -1, createdAt: -1 } },
      {
        $group: {
          _id: '$builderKey',
          builderId: { $first: '$builderId' },
          companyId: { $first: '$companyId' },
          builder: { $first: '$builder' },
          listing: { $first: '$$ROOT' }
        }
      },
      {
        $lookup: {
          from: 'companies',
          localField: 'builderId',
          foreignField: '_id',
          as: 'builderDoc'
        }
      },
      {
        $project: {
          _id: 0,
          builderId: { $ifNull: ['$builderId', '$companyId'] },
          builderName: {
            $ifNull: [
              { $arrayElemAt: ['$builderDoc.name', 0] },
              '$builder.name'
            ]
          },
          modelListing: {
            id: '$listing._id',
            address: '$listing.address',
            status: '$listing.status',
            published: '$listing.published',
            updatedAt: '$listing.updatedAt',
            createdAt: '$listing.createdAt'
          }
        }
      }
    ];

    const rows = await PublicHome.aggregate(pipeline).allowDiskUse(true);

    const formatted = rows.map((row) => ({
      builderId: row.builderId ? String(row.builderId) : null,
      builderName: row.builderName || '',
      modelListing: row.modelListing
        ? {
            id: row.modelListing.id ? String(row.modelListing.id) : null,
            address: row.modelListing.address || {},
            status: row.modelListing.status || '',
            published: Boolean(row.modelListing.published),
            updatedAt: row.modelListing.updatedAt || null,
            createdAt: row.modelListing.createdAt || null
          }
        : null
    }));

    return res.json(formatted);
  } catch (err) {
    console.error('[public community builders]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
