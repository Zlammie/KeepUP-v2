const Task = require('../models/Task');

const OPEN_STATUSES = ['Pending', 'In Progress', 'Overdue'];

const ATTENTION_PRIORITY = 'High';

function normalizeId(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value._id) return value._id.toString();
  return value.toString();
}

async function fetchAttentionMapForCompany({ companyId, linkedModel, ids }) {
  if (!companyId || !ids.length) return new Map();

  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const highPriorityNoDueCondition = {
    priority: ATTENTION_PRIORITY,
    $or: [{ dueDate: null }, { dueDate: { $exists: false } }]
  };

  const tasks = await Task.find({
    company: companyId,
    linkedModel,
    linkedId: { $in: ids },
    status: { $in: OPEN_STATUSES },
    $or: [
      { dueDate: { $lt: now } },
      { $and: [{ priority: ATTENTION_PRIORITY }, { dueDate: { $lte: endOfToday } }] },
      highPriorityNoDueCondition
    ]
  })
    .select('linkedId')
    .lean();

  const map = new Map();
  tasks.forEach((task) => {
    if (task.linkedId) {
      map.set(String(task.linkedId), true);
    }
  });
  return map;
}

async function applyTaskAttentionFlags(docs = [], { linkedModel, fallbackCompanyId = null } = {}) {
  if (!Array.isArray(docs) || !docs.length || !linkedModel) return docs;

  const byCompany = new Map();
  docs.forEach((doc) => {
    if (!doc) return;
    const id = normalizeId(doc._id);
    if (!id) return;
    const companyId = normalizeId(doc.company) || normalizeId(fallbackCompanyId);
    if (!companyId) return;
    if (!byCompany.has(companyId)) byCompany.set(companyId, []);
    byCompany.get(companyId).push(id);
  });

  const overallMap = new Map();
  for (const [companyId, ids] of byCompany.entries()) {
    const attentionMap = await fetchAttentionMapForCompany({ companyId, linkedModel, ids });
    attentionMap.forEach((value, key) => {
      if (value) overallMap.set(key, true);
    });
  }

  docs.forEach((doc) => {
    if (!doc) return;
    const id = normalizeId(doc._id);
    doc.requiresAttention = overallMap.has(id);
  });

  return docs;
}

module.exports = { applyTaskAttentionFlags };
