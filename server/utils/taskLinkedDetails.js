const mongoose = require('mongoose');

const Contact = require('../models/Contact');
const Community = require('../models/Community');
const Competition = require('../models/Competition');
const Realtor = require('../models/Realtor');
const Lender = require('../models/lenderModel');

const { Types } = mongoose;

const MODEL_CONFIG = {
  Contact: {
    Model: Contact,
    select: 'firstName lastName email company status',
    getLabel: (doc) => {
      const fullName = [doc.firstName, doc.lastName].filter(Boolean).join(' ').trim();
      return fullName || doc.email || `Contact ${shortId(doc._id)}`;
    },
    getStatus: (doc) => doc.status || null
  },
  Community: {
    Model: Community,
    select: 'name company',
    getLabel: (doc) => doc.name || `Community ${shortId(doc._id)}`
  },
  Competition: {
    Model: Competition,
    select: 'communityName builderName company',
    getLabel: (doc) => doc.communityName || doc.builderName || `Competition ${shortId(doc._id)}`
  },
  Realtor: {
    Model: Realtor,
    select: 'firstName lastName brokerage company',
    getLabel: (doc) => {
      const fullName = [doc.firstName, doc.lastName].filter(Boolean).join(' ').trim();
      return fullName || doc.brokerage || `Realtor ${shortId(doc._id)}`;
    }
  },
  Lender: {
    Model: Lender,
    select: 'firstName lastName lenderBrokerage company',
    getLabel: (doc) => {
      const fullName = [doc.firstName, doc.lastName].filter(Boolean).join(' ').trim();
      return fullName || doc.lenderBrokerage || `Lender ${shortId(doc._id)}`;
    }
  },
  Lot: {
    load: async (ids, scopedCompanyIds) => loadLots(ids, scopedCompanyIds)
  }
};

function shortId(value) {
  const str = String(value || '');
  return str.slice(-6);
}

function toObjectId(value) {
  if (!value) return null;
  if (value instanceof Types.ObjectId) return value;
  const str = String(value);
  return Types.ObjectId.isValid(str) ? new Types.ObjectId(str) : null;
}

async function hydrateTaskLinks(tasks, options = {}) {
  if (!Array.isArray(tasks) || !tasks.length) return;

  const idsByModel = {};
  tasks.forEach((task) => {
    if (!task || !task.linkedModel || !task.linkedId) return;
    if (!MODEL_CONFIG[task.linkedModel]) return;
    const idStr = String(task.linkedId);
    if (!idsByModel[task.linkedModel]) idsByModel[task.linkedModel] = new Set();
    idsByModel[task.linkedModel].add(idStr);
  });

  const modelNames = Object.keys(idsByModel);
  if (!modelNames.length) return;

  const companyIdsFromOptions = Array.isArray(options.companyIds)
    ? options.companyIds.map(toObjectId).filter(Boolean)
    : [];
  const companyIdsFromTasks = tasks
    .map((task) => toObjectId(task && task.company))
    .filter(Boolean);
  const scopedCompanyIds = companyIdsFromOptions.length
    ? companyIdsFromOptions
    : Array.from(new Set(companyIdsFromTasks.map(String))).map((id) => toObjectId(id));

  const lookups = new Map();

  await Promise.all(
    modelNames.map(async (modelName) => {
      const config = MODEL_CONFIG[modelName];
      if (!config) return;
      const idStrings = Array.from(idsByModel[modelName]);
      if (!idStrings.length) return;

      if (typeof config.load === 'function') {
        const entries = await config.load(idStrings, scopedCompanyIds);
        entries.forEach((value, key) => lookups.set(key, value));
        return;
      }

      const ids = idStrings.map(toObjectId).filter(Boolean);
      if (!ids.length) return;

      const query = { _id: { $in: ids } };
      if (scopedCompanyIds.length) {
        query.company = scopedCompanyIds.length === 1 ? scopedCompanyIds[0] : { $in: scopedCompanyIds };
      }

      const docs = await config.Model.find(query).select(config.select).lean();
      docs.forEach((doc) => {
        const key = `${modelName}:${String(doc._id)}`;
        lookups.set(key, {
          label: config.getLabel(doc),
          status: typeof config.getStatus === 'function' ? config.getStatus(doc) : null
        });
      });
    })
  );

  tasks.forEach((task) => {
    if (!task) return;
    const key = `${task.linkedModel}:${String(task.linkedId)}`;
    const entry = lookups.get(key);
    if (entry) {
      task.linkedName = entry.label || null;
      if (task.linkedModel === 'Contact' && entry.status) {
        task.linkedStatus = entry.status;
      }
      if (task.linkedModel === 'Lot') {
        if (entry.communityId) task.linkedCommunityId = entry.communityId;
        if (entry.communityName) task.linkedCommunityName = entry.communityName;
      }
    } else {
      task.linkedName = task.linkedName || null;
    }
  });
}

function groupTasksByAttachment(tasks) {
  if (!Array.isArray(tasks) || !tasks.length) return [];
  const groups = new Map();

  tasks.forEach((task) => {
    if (!task) return;
    const hasLink = task.linkedModel && task.linkedId;
    const groupKey = hasLink ? `${task.linkedModel}:${String(task.linkedId)}` : '__unlinked__';
    const defaultLabel = hasLink
      ? `${task.linkedModel} ${shortId(task.linkedId)}`
      : 'No linked record';
    const entry = groups.get(groupKey) || {
      key: groupKey,
      label: task.linkedName || defaultLabel,
      context: hasLink ? task.linkedModel : 'Unassigned',
      tasks: []
    };
    entry.tasks.push(task);
    if (!groups.has(groupKey)) {
      groups.set(groupKey, entry);
    }
  });

  return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label));
}

module.exports = {
  hydrateTaskLinks,
  groupTasksByAttachment
};

async function loadLots(idStrings, scopedCompanyIds) {
  const ids = idStrings.map(toObjectId).filter(Boolean);
  if (!ids.length) return new Map();

  const stringIds = new Set(ids.map((id) => String(id)));

  const query = { 'lots._id': { $in: ids } };
  if (scopedCompanyIds.length) {
    query.company = scopedCompanyIds.length === 1 ? scopedCompanyIds[0] : { $in: scopedCompanyIds };
  }

  const communities = await Community.find(query)
    .select('name city state lots')
    .lean();

  const lookup = new Map();

  communities.forEach((community) => {
    const communityName = community.name || '';
    const communityId = community._id ? String(community._id) : null;
    (community.lots || []).forEach((lot) => {
      if (!lot || !lot._id) return;
      const stringId = String(lot._id);
      if (!stringIds.has(stringId)) return;
      const label =
        (lot.address && lot.address.trim()) ||
        [communityName, lot.lot ? `Lot ${lot.lot}` : '', lot.block ? `Block ${lot.block}` : '']
          .filter(Boolean)
          .join(' • ') ||
        'Lot';
      lookup.set(`Lot:${stringId}`, {
        label,
        status: null,
        communityId,
        communityName
      });
    });
  });

  return lookup;
}
