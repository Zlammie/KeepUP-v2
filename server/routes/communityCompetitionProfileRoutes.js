// routes/communityCompetitionProfileRoutes.js (secured & tenant-scoped)
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const Community = require('../models/Community');
const FloorPlan = require('../models/FloorPlan');
const FloorPlanComp = require('../models/floorPlanComp');
const Competition = require('../models/Competition');
const CommunityCompetitionProfile = require('../models/communityCompetitionProfile');
const PriceRecord = require('../models/PriceRecord');
const QuickMoveIn = require('../models/quickMoveIn');
const SalesRecord = require('../models/salesRecord');

const ensureAuth  = require('../middleware/ensureAuth');
const requireRole = require('../middleware/requireRole');

// ───────── helpers ─────────
const isObjectId = v => mongoose.Types.ObjectId.isValid(String(v));
const isSuper = req => (req.user?.roles || []).includes('SUPER_ADMIN');
const baseFilter = req => (isSuper(req) ? {} : { company: req.user.company });

const toArray = v => {
  if (Array.isArray(v)) return v.filter(Boolean).map(s => s.toString().trim()).filter(Boolean);
  if (typeof v === 'string') return v.split('\n').map(s => s.trim()).filter(Boolean);
  return [];
};

const isYYYYMM = s => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
const toYM = (val) => {
  if (!val) return null;
  if (typeof val === 'string' && isYYYYMM(val.trim())) return val.trim();
  const d = new Date(String(val));
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const toNumeric = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const toPriceNumber = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

const monthVariants = (value) => {
  const variants = new Set();
  const norm = toYM(value);
  if (norm) {
    const [y, mStr] = norm.split('-');
    const m = Number(mStr);
    variants.add(norm);
    variants.add(`${y}-${m}`);
    variants.add(`${y}/${mStr}`);
    variants.add(`${y}/${m}`);
    variants.add(`${mStr}/${y}`);
    variants.add(`${m}/${y}`);

    const date = new Date(Number(y), m - 1, 1);
    const long = date.toLocaleString(undefined, { month: 'long', year: 'numeric' });
    const short = date.toLocaleString(undefined, { month: 'short', year: 'numeric' });
    variants.add(long);
    variants.add(short);
  }

  const parsed = new Date(String(value));
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = parsed.getMonth() + 1;
    const mm = String(m).padStart(2, '0');
    variants.add(`${y}-${mm}`);
    variants.add(`${y}-${m}`);
    variants.add(`${y}/${mm}`);
    variants.add(`${y}/${m}`);
    variants.add(`${mm}/${y}`);
    variants.add(`${m}/${y}`);
    const long = parsed.toLocaleString(undefined, { month: 'long', year: 'numeric' });
    const short = parsed.toLocaleString(undefined, { month: 'short', year: 'numeric' });
    variants.add(long);
    variants.add(short);
  }

  return [...variants];
};

// parse close/release month → YYYYMM int (tolerant)
const ymStrToInt = (ym) => {
  if (!isYYYYMM(ym)) return null;
  const [y, m] = ym.split('-').map(Number);
  return y * 100 + m;
};
const dateLikeToYMInt = (s) => {
  if (!s) return null;
  const t = String(s).trim();
  let m = t.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (m) return Number(m[1]) * 100 + Number(m[2]);
  m = t.match(/^(\d{4})-(0[1-9]|1[0-2])-\d{1,2}$/);
  if (m) return Number(m[1]) * 100 + Number(m[2]);
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return Number(m[3]) * 100 + Math.min(12, Math.max(1, Number(m[1])));
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.getFullYear() * 100 + (d.getMonth() + 1);
};

// tenant guards for referenced parents
async function assertCommunityInTenant(req, communityId, fields='') {
  const filter = { _id: communityId, ...baseFilter(req) };
  const doc = await Community.findOne(filter).select(fields || '_id company').lean();
  if (!doc) {
    const err = new Error('Community not found');
    err.status = 404;
    throw err;
  }
  return doc;
}
async function assertCompetitionInTenant(req, competitionId, fields='') {
  const filter = { _id: competitionId, ...baseFilter(req) };
  const doc = await Competition.findOne(filter).select(fields || '_id').lean();
  if (!doc) {
    const err = new Error('Competition not found');
    err.status = 404;
    throw err;
  }
  return doc;
}
async function assertPlansInTenant(req, planIds=[]) {
  if (!planIds.length) return;
  const filter = { _id: { $in: planIds }, ...baseFilter(req) };
  const found = await FloorPlan.countDocuments(filter);
  if (found !== planIds.length) {
    const err = new Error('One or more floor plans are not in your company');
    err.status = 400;
    throw err;
  }
}

const cleanLabelPart = (value) => {
  if (value == null) return '';
  const str = String(value).trim();
  return str;
};

const buildLabel = (...parts) => {
  const filtered = parts.map(cleanLabelPart).filter(Boolean);
  return filtered.length ? filtered.join(' - ') : 'Unnamed';
};

const friendlyMonth = (ym) => {
  const normalized = toYM(ym);
  if (normalized) {
    const [yStr, mStr] = normalized.split('-');
    const year = Number(yStr);
    const monthIdx = Number(mStr) - 1;
    if (Number.isFinite(year) && Number.isFinite(monthIdx)) {
      const date = new Date(Date.UTC(year, monthIdx, 1));
      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleString(undefined, { month: 'short', year: 'numeric' });
      }
    }
  }
  const parsed = new Date(String(ym));
  return Number.isNaN(parsed.getTime())
    ? String(ym ?? '')
    : parsed.toLocaleString(undefined, { month: 'short', year: 'numeric' });
};

function deriveRecentMonths(monthSet, limit = 12) {
  const monthsDesc = [...monthSet]
    .filter(Boolean)
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  const limitedDesc = monthsDesc.slice(0, limit);
  const limitedAsc = [...limitedDesc].sort((a, b) => a.localeCompare(b));
  return {
    monthsAsc: limitedAsc,
    allowedSet: new Set(limitedDesc)
  };
}

const buildMonthWindow = (monthSet, allowedMonthsSet) => {
  if (allowedMonthsSet && allowedMonthsSet.size) {
    const months = [...monthSet].filter(m => allowedMonthsSet.has(m));
    const monthsAsc = months.sort((a, b) => a.localeCompare(b));
    return {
      monthsAsc,
      allowedSet: new Set(months)
    };
  }
  return deriveRecentMonths(monthSet, 12);
};

const filterRowsByMonths = (rows, allowedSet, strict = false) => {
  if (!allowedSet) return rows;
  if (!allowedSet.size) return strict ? [] : rows;
  return rows.filter(r => {
    if (!r.month) return !strict;
    return allowedSet.has(r.month);
  });
};

const mapPlanForResponse = (plan) => {
  if (!plan) return null;
  const out = {
    _id: plan._id,
    name: cleanLabelPart(plan.name) || '',
    planNumber: cleanLabelPart(plan.planNumber) || '',
  };
  if (plan.sqft != null) out.sqft = plan.sqft;
  return out;
};

async function computeCommunityScatterData(req, communityId, allowedMonthsSet) {
  const community = await assertCommunityInTenant(
    req,
    communityId,
    'name communityName builder builderName lots'
  );

  const lots = Array.isArray(community?.lots) ? community.lots : [];
  const monthSet = new Set();
  const qmiCandidates = [];
  const soldCandidates = [];
  const planIds = new Set();

  for (const lot of lots) {
    if (!lot) continue;

    const status = String(lot.status || lot.generalStatus || '').toLowerCase().trim();
    const hasPurchaser = Boolean(lot.purchaser);
    const statusSold =
      status.includes('sold') ||
      status.includes('closed') ||
      status.includes('purchased');

    if (!hasPurchaser && !statusSold) {
      const ucOrFinished =
        (status.includes('under') && status.includes('construction')) ||
        status.includes('finished') ||
        status.includes('available') ||
        status.includes('spec') ||
        status.includes('inventory');
      if (!ucOrFinished) continue;

      const releaseMonth = toYM(lot.releaseDate || lot.listDate || lot.availableDate || lot.listedDate);
      qmiCandidates.push({ lot, month: releaseMonth });
      if (releaseMonth) monthSet.add(releaseMonth);
      if (lot.floorPlan) planIds.add(String(lot.floorPlan));
      continue;
    }

    const soldMonthRaw =
      lot.salesDate ||
      lot.closeMonth ||
      lot.closeDateTime ||
      lot.closeDate ||
      lot.closingDate ||
      lot.soldDate ||
      lot.closedDate ||
      lot.contractDate ||
      null;
    const soldMonth = toYM(soldMonthRaw);

    if (hasPurchaser || statusSold || soldMonth) {
      soldCandidates.push({ lot, month: soldMonth });
      if (soldMonth) monthSet.add(soldMonth);
      if (lot.floorPlan) planIds.add(String(lot.floorPlan));
    }
  }

  let planMap = {};
  if (planIds.size) {
    const plans = await FloorPlan.find({ _id: { $in: [...planIds] }, ...baseFilter(req) })
      .select('name planNumber specs.squareFeet')
      .lean();
    planMap = Object.fromEntries(
      plans.map(p => [String(p._id), {
        _id: p._id,
        name: p.name || '',
        planNumber: p.planNumber || '',
        sqft: toNumeric(p?.specs?.squareFeet)
      }])
    );
  }

  const toRowPlan = (id) => {
    if (!id) return null;
    const plan = planMap[id];
    return plan ? mapPlanForResponse(plan) : null;
  };

  const qmiRows = qmiCandidates.map(({ lot, month }) => {
    const planId = lot.floorPlan ? String(lot.floorPlan) : null;
    const plan = toRowPlan(planId);
    const sqft =
      toNumeric(lot.squareFeet) ??
      toNumeric(lot.sqft) ??
      (plan ? plan.sqft : null);
    const price =
      toPriceNumber(lot.listPrice) ??
      toPriceNumber(lot.price) ??
      toPriceNumber(lot.basePrice) ??
      toPriceNumber(lot.askingPrice) ??
      null;

    return {
      lotId: lot._id ? String(lot._id) : null,
      address: lot.address || lot.streetAddress || '',
      plan,
      month: month || null,
      sqft,
      listPrice: price,
      status: lot.status || '',
      listDate: lot.listDate || lot.releaseDate || lot.availableDate || null,
      x: sqft,
      y: price
    };
  });

  const soldRows = soldCandidates.map(({ lot, month }) => {
    const planId = lot.floorPlan ? String(lot.floorPlan) : null;
    const plan = toRowPlan(planId);
    const sqft =
      toNumeric(lot.squareFeet) ??
      toNumeric(lot.sqft) ??
      (plan ? plan.sqft : null);
    const listPrice =
      toPriceNumber(lot.listPrice) ??
      toPriceNumber(lot.originalPrice) ??
      toPriceNumber(lot.basePrice) ??
      null;
    const soldPrice =
      toPriceNumber(lot.salesPrice) ??
      toPriceNumber(lot.soldPrice) ??
      toPriceNumber(lot.contractPrice) ??
      toPriceNumber(lot.closingPrice) ??
      null;

    return {
      lotId: lot._id ? String(lot._id) : null,
      address: lot.address || lot.streetAddress || '',
      plan,
      month: month || null,
      sqft,
      listPrice,
      soldPrice,
      status: lot.status || '',
      listDate: lot.listDate || lot.releaseDate || lot.availableDate || null,
      soldDate:
        lot.salesDate ||
        lot.closeDateTime ||
        lot.closeMonth ||
        lot.closeDate ||
        lot.closingDate ||
        lot.soldDate ||
        lot.closedDate ||
        null,
      x: sqft,
      y: soldPrice ?? listPrice ?? null
    };
  });

  const { monthsAsc, allowedSet } = buildMonthWindow(monthSet, allowedMonthsSet);
  const filteredQmi = filterRowsByMonths(qmiRows, allowedSet, Boolean(allowedMonthsSet));
  const filteredSold = filterRowsByMonths(soldRows, allowedSet, Boolean(allowedMonthsSet));

  const label = buildLabel(
    community.builder || community.builderName,
    community.name || community.communityName
  );

  return {
    id: String(communityId),
    type: 'community',
    name: label,
    months: monthsAsc,
    qmi: filteredQmi,
    sold: filteredSold
  };
}

async function computeCompetitionScatterData(req, competitionId, allowedMonthsSet) {
  const competition = await assertCompetitionInTenant(
    req,
    competitionId,
    'builderName communityName city state isInternal communityRef'
  );

  const qmiDocs = await QuickMoveIn.find({
    ...baseFilter(req),
    competition: competitionId
  }).select('month sqft listPrice soldPrice soldDate listDate address status floorPlan').lean();

  if (!qmiDocs.length && competition?.isInternal && competition?.communityRef) {
    try {
      const linkedData = await computeCommunityScatterData(req, competition.communityRef, allowedMonthsSet);
      if (linkedData) {
        const markDerived = (rows) => (Array.isArray(rows) ? rows.map((row) => ({
          ...row,
          recordId: row.recordId || row.lotId || null,
          source: 'linked-community',
          originId: row.lotId || row.recordId || null
        })) : []);

        const derivedQmi = markDerived(linkedData.qmi);
        const derivedSold = markDerived(linkedData.sold);

        if (derivedQmi.length || derivedSold.length) {
          return {
            id: String(competitionId),
            type: 'competition',
            name: buildLabel(competition.builderName, competition.communityName),
            months: Array.isArray(linkedData.months) ? linkedData.months : [],
            qmi: derivedQmi,
            sold: derivedSold
          };
        }
      }
    } catch (err) {
      if (err?.status !== 404) throw err;
    }
  }

  if (!qmiDocs.length) {
    return {
      id: String(competitionId),
      type: 'competition',
      name: buildLabel(competition.builderName, competition.communityName),
      months: [],
      qmi: [],
      sold: []
    };
  }

  const monthSet = new Set();
  const planIds = new Set(
    qmiDocs
      .map(doc => (doc.floorPlan ? String(doc.floorPlan) : null))
      .filter(Boolean)
  );

  let planMap = {};
  if (planIds.size) {
    const plans = await FloorPlanComp.find({
      _id: { $in: [...planIds] },
      ...baseFilter(req)
    }).select('name sqft').lean();

    planMap = Object.fromEntries(
      plans.map(p => [String(p._id), {
        _id: p._id,
        name: p.name || '',
        planNumber: '',
        sqft: toNumeric(p.sqft)
      }])
    );
  }

  const toRowPlan = (id) => {
    if (!id) return null;
    const plan = planMap[id];
    return plan ? mapPlanForResponse(plan) : null;
  };

  const qmiRows = [];
  const soldRows = [];

  for (const doc of qmiDocs) {
    const month = isYYYYMM(doc.month) ? doc.month : toYM(doc.listDate);
    if (month) monthSet.add(month);

    const planId = doc.floorPlan ? String(doc.floorPlan) : null;
    const plan = toRowPlan(planId);
    const sqft =
      toNumeric(doc.sqft) ??
      (plan ? plan.sqft : null);
    const listPrice = toPriceNumber(doc.listPrice);
    const soldPrice = toPriceNumber(doc.soldPrice);
    const soldDate = doc.soldDate || null;
    const listDate = doc.listDate || null;

    const base = {
      recordId: doc._id ? String(doc._id) : null,
      address: doc.address || '',
      plan,
      month: month || null,
      sqft,
      listPrice,
      soldPrice,
      status: doc.status || '',
      listDate,
      soldDate,
    };

    const isSold = String(doc.status || '').toLowerCase() === 'sold' ||
      Number.isFinite(soldPrice) ||
      Boolean(soldDate);

    if (isSold) {
      soldRows.push({
        ...base,
        x: sqft,
        y: soldPrice ?? listPrice ?? null
      });
    } else {
      qmiRows.push({
        ...base,
        x: sqft,
        y: listPrice ?? soldPrice ?? null
      });
    }
  }

  const { monthsAsc, allowedSet } = buildMonthWindow(monthSet, allowedMonthsSet);
  const filteredQmi = filterRowsByMonths(qmiRows, allowedSet, Boolean(allowedMonthsSet));
  const filteredSold = filterRowsByMonths(soldRows, allowedSet, Boolean(allowedMonthsSet));

  return {
    id: String(competitionId),
    type: 'competition',
    name: buildLabel(competition.builderName, competition.communityName),
    months: monthsAsc,
    qmi: filteredQmi,
    sold: filteredSold
  };
}

async function buildCommunityBasePricePoints(req, community, profile, month) {
  if (!Array.isArray(profile?.monthlyPrices) || !profile.monthlyPrices.length) {
    return [];
  }

  const entry = profile.monthlyPrices.find(mp => toYM(mp?.month) === month);
  if (!entry) return [];

  const prices = entry.prices instanceof Map
    ? entry.prices
    : new Map(Object.entries(entry.prices || {}));

  const planIds = [];
  for (const key of prices.keys()) {
    const id = key == null ? '' : String(key).trim();
    if (isObjectId(id)) planIds.push(id);
  }
  if (!planIds.length) return [];

  const plans = await FloorPlan.find({
    _id: { $in: planIds.map(id => new mongoose.Types.ObjectId(id)) },
    ...baseFilter(req)
  })
    .select('name planNumber specs.squareFeet')
    .lean();
  const planMeta = Object.fromEntries(plans.map(p => [String(p._id), p]));

  const points = [];
  for (const [planIdRaw, priceRaw] of prices.entries()) {
    const planId = planIdRaw == null ? '' : String(planIdRaw).trim();
    const meta = planMeta[planId];
    if (!meta) continue;

    const price = toPriceNumber(priceRaw);
    if (!Number.isFinite(price)) continue;

    const sqft = toNumeric(meta?.specs?.squareFeet);
    if (!Number.isFinite(sqft)) continue;

    points.push({
      planId,
      planName: meta.name || '',
      planNumber: meta.planNumber || '',
      sqft,
      price,
      x: sqft,
      y: price
    });
  }

  points.sort((a, b) => (a.sqft || 0) - (b.sqft || 0));
  return points;
}

async function buildCompetitionBasePricePoints(req, linkedIds, month) {
  if (!linkedIds.length) return [];

  const priceRecords = await PriceRecord.find({
    ...baseFilter(req),
    competition: { $in: linkedIds }
  })
    .select('competition price floorPlan month')
    .populate('floorPlan', 'name planNumber sqft')
    .lean();

  if (!priceRecords.length) return [];

  const targetMonth = toYM(month);

  const byCompetition = new Map();
  for (const rec of priceRecords) {
    const compId = rec?.competition ? String(rec.competition) : null;
    if (!compId) continue;
    if (targetMonth && toYM(rec?.month) !== targetMonth) continue;

    const price = toPriceNumber(rec?.price);
    if (!Number.isFinite(price)) continue;

    const planObj = rec?.floorPlan && typeof rec.floorPlan === 'object' ? rec.floorPlan : null;
    if (!planObj) continue;

    const sqft = toNumeric(planObj?.sqft);
    if (!Number.isFinite(sqft)) continue;

    const planName = planObj?.name || '';
    const planNumber = planObj?.planNumber || '';

    if (!byCompetition.has(compId)) byCompetition.set(compId, []);
    byCompetition.get(compId).push({
      planId: planObj?._id ? String(planObj._id) : null,
      planName,
      planNumber,
      sqft,
      price,
      x: sqft,
      y: price
    });
  }

  const compIds = [...byCompetition.keys()];
  if (!compIds.length) return [];

  const competitions = await Competition.find({
    _id: { $in: compIds },
    ...baseFilter(req)
  }).select('builderName communityName').lean();
  const compMeta = Object.fromEntries(competitions.map(c => [String(c._id), c]));

  const datasets = [];
  for (const [compId, points] of byCompetition.entries()) {
    if (!points.length) continue;
    const info = compMeta[compId] || {};
    points.sort((a, b) => (a.sqft || 0) - (b.sqft || 0));

    datasets.push({
      id: compId,
      type: 'competition',
      label: (() => {
        const label = buildLabel(info.builderName, info.communityName);
        return label === 'Unnamed' ? `Competition ${compId.slice(-4)}` : label;
      })(),
      points
    });
  }
  return datasets;
}

const WINDOW_KEYS = new Set(['20d', '30d', '60d', '90d', '3m', '6m', '12m', '1y', 'ytd']);

const normalizeWindowKey = (raw) => {
  const key = String(raw || '').trim().toLowerCase();
  return WINDOW_KEYS.has(key) ? key : '90d';
};

function resolveWindowRange(rawKey) {
  const key = normalizeWindowKey(rawKey);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);

  const shiftDays = (days) => {
    start.setDate(start.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);
  };

  const shiftMonths = (monthsBackInclusive) => {
    const monthsToSubtract = Math.max(0, monthsBackInclusive - 1);
    start.setMonth(start.getMonth() - monthsToSubtract);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  };

  switch (key) {
    case '20d': shiftDays(20); break;
    case '30d': shiftDays(30); break;
    case '60d': shiftDays(60); break;
    case '90d': shiftDays(90); break;
    case '3m':  shiftMonths(3); break;
    case '6m':  shiftMonths(6); break;
    case '12m': shiftMonths(12); break;
    case '1y':  shiftMonths(12); break;
    case 'ytd':
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      break;
    default:
      shiftDays(90);
      break;
  }
  return { key, start, end };
}

const enumerateMonthsBetween = (start, end) => {
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const stop = new Date(end.getFullYear(), end.getMonth(), 1);
  const months = [];
  while (cursor <= stop) {
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
};

const toDateLike = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const str = String(value).trim();
  if (!str) return null;
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(str)) {
    const d = new Date(`${str}-01T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
};

const withinRange = (date, start, end) =>
  date instanceof Date && !Number.isNaN(date.getTime()) && date >= start && date <= end;

const lotSoldDate = (lot) => {
  if (!lot || typeof lot !== 'object') return null;
  const candidates = [
    lot.salesDate,
    lot.closeDateTime,
    lot.closeDate,
    lot.closingDate,
    lot.closedDate,
    lot.contractDate
  ];
  if (typeof lot.closeMonth === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(lot.closeMonth.trim())) {
    candidates.unshift(`${lot.closeMonth.trim()}-01`);
  }
  for (const val of candidates) {
    const parsed = toDateLike(val);
    if (parsed) return parsed;
  }
  return null;
};

async function computeCommunitySalesTotals(req, communityId, monthsSet, startDate, endDate) {
  const community = await assertCommunityInTenant(
    req,
    communityId,
    'name communityName builder builderName lots'
  );

  const profile = await CommunityCompetitionProfile.findOne({ community: communityId, ...baseFilter(req) })
    .select('monthlySalesSummary')
    .lean();

  const totals = { sales: 0, cancels: 0, closings: 0 };

  for (const entry of profile?.monthlySalesSummary || []) {
    const month = typeof entry?.month === 'string' ? entry.month.trim() : '';
    if (!month || !monthsSet.has(month)) continue;
    totals.sales += Number(entry.sales ?? 0) || 0;
    totals.cancels += Number(entry.cancels ?? 0) || 0;
    totals.closings += Number(entry.closings ?? 0) || 0;
  }

  if (totals.sales + totals.cancels + totals.closings === 0) {
    const lots = Array.isArray(community?.lots) ? community.lots : [];
    for (const lot of lots) {
      if (!lot) continue;
      const soldAt = lotSoldDate(lot);
      if (!withinRange(soldAt, startDate, endDate)) continue;
      totals.sales += 1;
      totals.closings += 1;
    }
  }

  return {
    label: buildLabel(community.builder, community.name || community.communityName),
    totals
  };
}

async function computeCompetitionSalesTotals(req, competitionId, monthsSet) {
  const competition = await assertCompetitionInTenant(
    req,
    competitionId,
    'builderName communityName'
  );

  const records = await SalesRecord.find({
    ...baseFilter(req),
    competition: competitionId,
    month: { $in: [...monthsSet] }
  }).select('sales cancels closings').lean();

  const totals = records.reduce((acc, rec) => {
    acc.sales += Number(rec.sales ?? 0) || 0;
    acc.cancels += Number(rec.cancels ?? 0) || 0;
    acc.closings += Number(rec.closings ?? 0) || 0;
    return acc;
  }, { sales: 0, cancels: 0, closings: 0 });

  return {
    label: buildLabel(competition.builderName, competition.communityName),
    totals
  };
}

// all routes require auth
router.use(ensureAuth);

/**
 * GET /api/community-competition-profiles/:communityId
 * Read profile (or default shape) — READONLY+
 */
router.get('/community-competition-profiles/:communityId',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });

      await assertCommunityInTenant(req, communityId);

      let profile = await CommunityCompetitionProfile.findOne({ community: communityId, ...baseFilter(req) })
        .populate([
          { path: 'topPlans.plan1', select: 'name planNumber specs.squareFeet' },
          { path: 'topPlans.plan2', select: 'name planNumber specs.squareFeet' },
          { path: 'topPlans.plan3', select: 'name planNumber specs.squareFeet' },
          { path: 'linkedCompetitions', select: 'communityName builderName city state market communityRef isInternal' }
        ])
        .lean();

      if (!profile) {
        profile = {
          company: req.user.company, // helpful for the client
          community: communityId,
          promotion: '',
          prosCons: { pros: [], cons: [] },
          topPlans: { plan1: null, plan2: null, plan3: null }
        };
      }
      res.json(profile);
    } catch (err) {
      console.error('[community-competition:sales-summary:put]', err);
      const code = err.status || 500;
      res.status(code).json({ error: err.message || 'Server error' });
    }
  }
);

/**
 * GET /api/competitions/minimal
 * List competitors for link/unlink — READONLY+
 */
router.get('/competitions/minimal',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const comps = await Competition.find({ ...baseFilter(req) })
        .select('communityName builderName city state market communityRef isInternal')
        .sort({ builderName: 1, communityName: 1 })
        .lean();
      res.json(comps);
    } catch (err) {
      console.error('[community-competition:sales-summary:get]', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/**
 * POST link one competitor
 */
router.post('/community-competition-profiles/:communityId/linked-competitions/:competitionId',
  requireRole('USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { communityId, competitionId } = req.params;
      if (!isObjectId(communityId) || !isObjectId(competitionId)) {
        return res.status(400).json({ error: 'Invalid id(s)' });
      }
      const community = await assertCommunityInTenant(req, communityId);
      await assertCompetitionInTenant(req, competitionId);

      const updated = await CommunityCompetitionProfile.findOneAndUpdate(
        { community: community._id, ...baseFilter(req) },
        { $addToSet: { linkedCompetitions: competitionId }, $setOnInsert: { company: community.company, community: community._id } },
        { new: true, upsert: true }
      ).populate('linkedCompetitions', 'communityName builderName city state market communityRef isInternal');
      res.json({ linkedCompetitions: updated.linkedCompetitions });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'Server error' });
    }
  }
);

/**
 * DELETE unlink one competitor
 */
router.delete('/community-competition-profiles/:communityId/linked-competitions/:competitionId',
  requireRole('USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { communityId, competitionId } = req.params;
      if (!isObjectId(communityId) || !isObjectId(competitionId)) {
        return res.status(400).json({ error: 'Invalid id(s)' });
      }
      await assertCommunityInTenant(req, communityId);
      await assertCompetitionInTenant(req, competitionId);

      const updated = await CommunityCompetitionProfile.findOneAndUpdate(
        { community: communityId, ...baseFilter(req) },
        { $pull: { linkedCompetitions: competitionId }, $setOnInsert: { company: req.user.company, community: communityId } },
        { new: true, upsert: true }
      ).populate('linkedCompetitions', 'communityName builderName city state market communityRef isInternal');
      res.json({ linkedCompetitions: updated.linkedCompetitions });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'Server error' });
    }
  }
);

/**
 * PUT bulk set linked competitors
 * Body: { competitionIds: ObjectId[] }
 */
router.put('/community-competition-profiles/:communityId/linked-competitions',
  requireRole('USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });
      const ids = (req.body?.competitionIds || []).filter(isObjectId).map(id => new mongoose.Types.ObjectId(id));

      await assertCommunityInTenant(req, communityId);
      // verify all competitions are tenant-scoped
      if (ids.length) await assertPlansInTenant(req, []); // no-op here; left as pattern
      const compsCount = await Competition.countDocuments({ _id: { $in: ids }, ...baseFilter(req) });
      if (compsCount !== ids.length) return res.status(400).json({ error: 'One or more competitions are not in your company' });

      const profile = await CommunityCompetitionProfile.findOneAndUpdate(
        { community: communityId, ...baseFilter(req) },
        { $set: { linkedCompetitions: ids }, $setOnInsert: { company: req.user.company, community: communityId } },
        { new: true, upsert: true }
      ).populate('linkedCompetitions', 'communityName builderName city state market communityRef isInternal');

      res.json({ linkedCompetitions: profile.linkedCompetitions });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message || 'Server error' });
    }
  }
);

/**
 * GET /api/community-competition-profiles/:communityId/prices?month=YYYY-MM
 */
router.get('/community-competition-profiles/:communityId/prices',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      const { month } = req.query;
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });
      if (!isYYYYMM(month)) return res.status(400).json({ error: 'month=YYYY-MM is required' });

      await assertCommunityInTenant(req, communityId);
      const profile = await CommunityCompetitionProfile.findOne({ community: communityId, ...baseFilter(req) }).lean();

      if (!profile || !Array.isArray(profile.monthlyPrices)) return res.json({ month, prices: {} });

      const entry = profile.monthlyPrices.find(mp => mp.month === month);
      const out = entry?.prices
        ? (entry.prices instanceof Map ? Object.fromEntries(entry.prices) : entry.prices)
        : {};
      res.json({ month, prices: out });
    } catch (err) {
      console.error('[community-competition:sales-summary:get]', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/**
 * PUT /api/community-competition-profiles/:communityId/prices
 * Body: { month, plan, price } OR { month, prices: { [planId]: price } }
 */
router.put('/community-competition-profiles/:communityId/prices',
  requireRole('USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      const { month, plan, price, prices } = req.body || {};
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });
      if (!isYYYYMM(month)) return res.status(400).json({ error: 'month=YYYY-MM is required' });

      const community = await assertCommunityInTenant(req, communityId);

      // planId tenant guard (single or bulk)
      const planIds = plan ? [plan] : Object.keys(prices || {});
      if (planIds.length) await assertPlansInTenant(req, planIds);

      const doc = await CommunityCompetitionProfile.findOneAndUpdate(
        { community: community._id, ...baseFilter(req) },
        { $setOnInsert: { company: community.company, community: community._id } },
        { new: true, upsert: true }
      );

      if (!Array.isArray(doc.monthlyPrices)) doc.monthlyPrices = [];
      let entry = doc.monthlyPrices.find(mp => mp.month === month);
      if (!entry) {
        entry = { month, prices: new Map() };
        doc.monthlyPrices.push(entry);
      }
      if (!(entry.prices instanceof Map)) {
        entry.prices = new Map(Object.entries(entry.prices || {}));
      }

      const put = (pid, val) => {
        if (val == null || val === '') entry.prices.delete(String(pid));
        else {
          const n = Number(val);
          entry.prices.set(String(pid), Number.isFinite(n) ? n : 0);
        }
      };

      if (plan) put(plan, price);
      else if (prices && typeof prices === 'object') {
        for (const [pid, val] of Object.entries(prices)) put(pid, val);
      } else {
        return res.status(400).json({ error: 'Provide {plan, price} or {prices}' });
      }

      await doc.save();
      res.json({ month, prices: Object.fromEntries(entry.prices) });
    } catch (err) {
      console.error('[community-competition:sales-summary:put]', err);
      const code = err.status || 500;
      res.status(code).json({ error: err.message || 'Server error' });
    }
  }
);

/**
 * GET /api/community-profiles/:communityId/base-price-scatter?month=YYYY-MM
 * Provide plan-level base price vs sqft snapshot for a specific month.
 */
router.get('/community-profiles/:communityId/base-price-scatter',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      const requestedMonth = typeof req.query.month === 'string' ? req.query.month.trim() : '';
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });

      const community = await assertCommunityInTenant(
        req,
        communityId,
        'company name communityName builder builderName'
      );

      const profile = await CommunityCompetitionProfile.findOne({ community: community._id, ...baseFilter(req) })
        .select('monthlyPrices linkedCompetitions')
        .lean();

      const monthSet = new Set();
      for (const entry of profile?.monthlyPrices || []) {
        const monthKey = toYM(entry?.month);
        if (monthKey) monthSet.add(monthKey);
      }

      const linkedIds = Array.isArray(profile?.linkedCompetitions)
        ? profile.linkedCompetitions
            .map(c => (c?._id ? c._id : c))
            .map(id => String(id))
            .filter(id => isObjectId(id))
        : [];

      if (linkedIds.length) {
        const priceMonths = await PriceRecord.distinct('month', {
          ...baseFilter(req),
          competition: { $in: linkedIds }
        });
        for (const m of priceMonths) {
          let monthKey = toYM(m);
          if (!monthKey) {
            for (const variant of monthVariants(m)) {
              monthKey = toYM(variant);
              if (monthKey) break;
            }
          }
          if (monthKey) monthSet.add(monthKey);
        }
      }

      const requestedKey = toYM(requestedMonth);
      if (requestedKey) monthSet.add(requestedKey);

      if (!monthSet.size) {
        return res.json({
          months: [],
          selectedMonth: null,
          datasets: []
        });
      }

      const sortedMonthsDesc = [...monthSet].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
      const monthOptions = sortedMonthsDesc.map(value => ({
        value,
        label: friendlyMonth(value)
      }));

      const selectedMonth = sortedMonthsDesc.includes(requestedMonth)
        ? requestedMonth
        : sortedMonthsDesc[0];

      const datasets = [];

      const communityPoints = await buildCommunityBasePricePoints(req, community, profile, selectedMonth);
      if (communityPoints.length) {
        const rawLabel = buildLabel(community.builder || community.builderName, community.name || community.communityName);
        const communityLabel = rawLabel === 'Unnamed' ? 'Our Community' : rawLabel;
        datasets.push({
          id: String(communityId),
          type: 'community',
          label: communityLabel,
          points: communityPoints
        });
      }

      const competitionDatasets = await buildCompetitionBasePricePoints(req, linkedIds, selectedMonth);
      datasets.push(...competitionDatasets);

      return res.json({
        months: monthOptions,
        selectedMonth,
        datasets
      });
    } catch (err) {
      console.error('[community-competition:base-price-scatter]', err);
      const code = err.status || 500;
      res.status(code).json({ error: err.message || 'Server error' });
    }
  }
);

/**
 * GET /api/community-profiles/:communityId/base-prices?months=12
 * Return average base price series for the community and linked competitions.
 */
router.get('/community-profiles/:communityId/base-prices',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      const monthsParam = parseInt(req.query.months ?? '12', 10);
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });
      const months = Number.isFinite(monthsParam) ? Math.min(Math.max(monthsParam, 1), 36) : 12;

      const community = await assertCommunityInTenant(
        req,
        communityId,
        'company name communityName builder builderName'
      );

      const profile = await CommunityCompetitionProfile.findOne({ community: community._id, ...baseFilter(req) })
        .select('monthlyPrices linkedCompetitions')
        .lean();

      const now = new Date();
      const baseYear = now.getFullYear();
      const baseMonth = now.getMonth();
      const labels = [];
      const ymKeys = [];
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(baseYear, baseMonth - i, 1);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const friendly = d.toLocaleString(undefined, { month: 'short', year: 'numeric' });
        labels.push(friendly);
        ymKeys.push(ym);
      }
      const ymSet = new Set(ymKeys);

      const clean = (val) => (typeof val === 'string' ? val.trim() : '');
      const datasets = [];

      const communityPlanPrices = new Map(); // planId -> Map(month -> price)
      if (profile?.monthlyPrices) {
        for (const entry of profile.monthlyPrices) {
          const monthKey = typeof entry?.month === 'string' ? entry.month.trim() : '';
          if (!ymSet.has(monthKey)) continue;
          const prices = entry?.prices instanceof Map
            ? entry.prices
            : new Map(Object.entries(entry?.prices || {}));
          for (const [planIdRaw, rawPrice] of prices.entries()) {
            const planId = planIdRaw == null ? '' : String(planIdRaw).trim();
            if (!planId) continue;
            const price = toPriceNumber(rawPrice);
            if (!Number.isFinite(price)) continue;
            if (!communityPlanPrices.has(planId)) communityPlanPrices.set(planId, new Map());
            communityPlanPrices.get(planId).set(monthKey, Math.round(price));
          }
        }
      }

      let planMeta = {};
      const planIds = [...communityPlanPrices.keys()].filter(isObjectId);
      if (planIds.length) {
        const planObjectIds = planIds.map(id => new mongoose.Types.ObjectId(id));
        const plans = await FloorPlan.find({ _id: { $in: planObjectIds }, ...baseFilter(req) })
          .select('name planNumber specs.squareFeet')
          .lean();
        planMeta = Object.fromEntries(plans.map(p => [String(p._id), p]));
      }

      const communityLabelParts = [
        clean(community?.builderName || community?.builder),
        clean(community?.name || community?.communityName)
      ].filter(Boolean);
      const communityPrefix = communityLabelParts.length
        ? communityLabelParts.join(' - ')
        : 'Our Community';

      for (const [planId, monthMap] of communityPlanPrices.entries()) {
        const meta = planMeta[planId] || {};
        const planLabel = clean(meta.name) || clean(meta.planNumber) || `Plan ${planId.slice(-4)}`;
        const series = ymKeys.map(key => {
          const val = monthMap.get(key);
          return Number.isFinite(val) ? val : null;
        });
        if (!series.some(v => v != null)) continue;
        const label = `${communityPrefix}: ${planLabel}`;
        datasets.push({ label, data: series });
      }

      datasets.sort((a, b) => a.label.localeCompare(b.label));
      res.json({ labels, months: ymKeys, datasets });
    } catch (err) {
      console.error('[community-competition:base-prices-series]', err);
      const code = err.status || 500;
      res.status(code).json({ error: err.message || 'Server error' });
    }
  }
);

/**
 * GET /api/community-profiles/:communityId/qmi-solds?month=YYYY-MM
 * Combined quick-move-in vs sold data for charts/tables.
 */
router.get('/community-profiles/:communityId/qmi-solds',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      const rawMonth = req.query.month;
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });
      if (rawMonth && !isYYYYMM(rawMonth)) return res.status(400).json({ error: 'month must be YYYY-MM' });

      let allowedMonthsSet = null;
      if (req.query.window) {
        const info = resolveWindowRange(req.query.window);
        allowedMonthsSet = new Set(enumerateMonthsBetween(info.start, info.end));
      }

      const data = await computeCommunityScatterData(req, communityId, allowedMonthsSet);
      res.json({
        months: data.months,
        qmi: data.qmi,
        sold: data.sold
      });
    } catch (err) {
      console.error('[community-competition:qmi-solds]', err);
      const code = err.status || 500;
      res.status(code).json({ error: err.message || 'Server error' });
    }
  }
);

/**
 * GET /api/competitions/multi/sales-totals?ids=...&window=...
 * Aggregate net sales (sales - cancels, fallback to closings) for communities and competitions.
 */
router.get('/competitions/multi/sales-totals',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const rawIds = String(req.query.ids || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      if (!rawIds.length) {
        return res.json({ labels: [], data: [] });
      }

      const info = resolveWindowRange(req.query.window);
      const monthsInRange = enumerateMonthsBetween(info.start, info.end);
      const monthsSet = new Set(monthsInRange);

      const seen = new Set();
      const orderedIds = [];
      for (const id of rawIds) {
        if (!isObjectId(id)) continue;
        if (seen.has(id)) continue;
        seen.add(id);
        orderedIds.push(id);
      }

      const results = [];

      for (const id of orderedIds) {
        let handled = false;
        try {
          const communityTotals = await computeCommunitySalesTotals(
            req,
            id,
            monthsSet,
            info.start,
            info.end
          );
          if (communityTotals) {
            results.push({ id, type: 'community', ...communityTotals });
            handled = true;
          }
        } catch (err) {
          if (err.status !== 404) throw err;
        }
        if (handled) continue;

        try {
          const compTotals = await computeCompetitionSalesTotals(req, id, monthsSet);
          if (compTotals) {
            results.push({ id, type: 'competition', ...compTotals });
            handled = true;
          }
        } catch (err) {
          if (err.status !== 404) throw err;
        }
      }

      const labels = results.map(r => r.label);
      const data = results.map(r => {
        const net = Math.max(0, (r.totals.sales || 0) - (r.totals.cancels || 0));
        if (net > 0) return net;
        if (r.totals.closings) return Math.max(0, r.totals.closings);
        return 0;
      });

      res.json({
        labels,
        data,
        breakdown: results,
        window: {
          key: info.key,
          start: info.start.toISOString(),
          end: info.end.toISOString(),
          months: monthsInRange
        }
      });
    } catch (err) {
      console.error('[community-competition:multi-sales-totals]', err);
      const code = err.status || 500;
      res.status(code).json({ error: err.message || 'Server error' });
    }
  }
);

/**
 * GET /api/communities/multi/qmi-solds-scatter?ids=ID1,ID2
 * Aggregate QMI/SOLD scatter data for communities and linked competitions.
 */
router.get('/communities/multi/qmi-solds-scatter',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const rawIds = String(req.query.ids || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      if (!rawIds.length) return res.json([]);

      let windowMonthsSet = null;
      if (req.query.window) {
        const windowInfo = resolveWindowRange(req.query.window);
        windowMonthsSet = new Set(enumerateMonthsBetween(windowInfo.start, windowInfo.end));
      }

      const seen = new Set();
      const ordered = [];
      for (const id of rawIds) {
        if (!isObjectId(id)) continue;
        if (seen.has(id)) continue;
        seen.add(id);
        ordered.push(id);
      }

      const result = [];

      for (const id of ordered) {
        let handled = false;
        try {
          const communityData = await computeCommunityScatterData(req, id, windowMonthsSet);
          if (communityData) {
            result.push(communityData);
            handled = true;
          }
        } catch (err) {
          if (err.status !== 404) throw err;
        }

        if (handled) continue;

        try {
          const competitionData = await computeCompetitionScatterData(req, id, windowMonthsSet);
          if (competitionData) {
            result.push(competitionData);
            handled = true;
          }
        } catch (err) {
          if (err.status !== 404) throw err;
        }
      }

      res.json(result);
    } catch (err) {
      console.error('[community-competition:multi-qmi-solds]', err);
      const code = err.status || 500;
      res.status(code).json({ error: err.message || 'Server error' });
    }
  }
);

/**
 * GET /api/community-competition-profiles/:communityId/qmi?month=YYYY-MM
 * Compute Quick-Move-In list for the month, honoring exclusions.
 */
router.get('/community-competition-profiles/:communityId/qmi',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      const { month } = req.query;
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });
      if (!isYYYYMM(month)) return res.status(400).json({ error: 'month=YYYY-MM is required' });

      await assertCommunityInTenant(req, communityId);

      const community = await Community.findOne({ _id: communityId, ...baseFilter(req) })
        .select('lots createdAt')
        .lean();
      if (!community) return res.status(404).json({ error: 'Community not found' });

      const profile = await CommunityCompetitionProfile.findOne({ community: communityId, ...baseFilter(req) })
        .select('monthlyQMI')
        .lean();

      const excludedThisMonth = new Set(
        (profile?.monthlyQMI || []).find(m => m.month === month)?.excludedLots?.map(id => String(id)) || []
      );

      const selectedYM = ymStrToInt(month);
      const lots = Array.isArray(community.lots) ? community.lots : [];
      const candidates = [];
      const planIds = new Set();

      for (const l of lots) {
        if (!l || excludedThisMonth.has(String(l._id))) continue;

        const s = String(l.status || '').toLowerCase().trim();
        const ucOrFinished = (s.includes('under') && s.includes('construction')) || s.includes('finished');
        if (!ucOrFinished) continue;

        // not already sold/closed and no purchaser linked
        if (l.purchaser) continue;
        if (s === 'closed' || s === 'purchased' || s === 'sold') continue;

        // use releaseDate as the gate for month display
        const releaseYM = dateLikeToYMInt(l.releaseDate);
        if (releaseYM == null) continue;
        if (selectedYM != null && selectedYM < releaseYM) continue;

        candidates.push(l);
        if (l.floorPlan) planIds.add(String(l.floorPlan));
      }

      let planMap = {};
      if (planIds.size) {
        const plans = await FloorPlan.find({ _id: { $in: [...planIds] }, ...baseFilter(req) })
          .select('name planNumber specs.squareFeet')
          .lean();
        planMap = Object.fromEntries(
          plans.map(p => [String(p._id), {
            _id: p._id, name: p.name, planNumber: p.planNumber, sqft: p?.specs?.squareFeet ?? null
          }])
        );
      }

      const homes = candidates.map(l => ({
        lotId: l._id,
        address: l.address || l.streetAddress || '',
        listDate: l.listDate || l.releaseDate || null,
        floorPlan: l.floorPlan ? (planMap[String(l.floorPlan)] || null) : null,
        listPrice: l.listPrice ?? l.price ?? null,
        sqft: l.squareFeet ?? l.sqft ?? (planMap[String(l.floorPlan)]?.sqft ?? null),
        status: l.status || ''
      }));

      res.json({ month, homes });
    } catch (err) {
      console.error('[community-competition:sales-summary:put]', err);
      const code = err.status || 500;
      res.status(code).json({ error: err.message || 'Server error' });
    }
  }
);

/**
 * PUT /api/community-competition-profiles/:communityId/qmi
 * Body: { month, excludeLotId } OR { month, includeLotId }
 */
router.put('/community-competition-profiles/:communityId/qmi',
  requireRole('USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      const { month, excludeLotId, includeLotId } = req.body || {};
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });
      if (!isYYYYMM(month)) return res.status(400).json({ error: 'month=YYYY-MM is required' });
      if (!excludeLotId && !includeLotId) return res.status(400).json({ error: 'Provide excludeLotId or includeLotId' });

      const community = await assertCommunityInTenant(req, communityId);

      const doc = await CommunityCompetitionProfile.findOneAndUpdate(
        { community: community._id, ...baseFilter(req) },
        { $setOnInsert: { company: community.company, community: community._id } },
        { new: true, upsert: true }
      );

      if (!Array.isArray(doc.monthlyQMI)) doc.monthlyQMI = [];
      let entry = doc.monthlyQMI.find(m => m.month === month);
      if (!entry) {
        entry = { month, excludedLots: [] };
        doc.monthlyQMI.push(entry);
      }

      const toId = v => (isObjectId(v) ? new mongoose.Types.ObjectId(v) : null);

      if (excludeLotId) {
        const id = toId(excludeLotId);
        if (id && !entry.excludedLots.some(x => x.equals(id))) entry.excludedLots.push(id);
      }
      if (includeLotId) {
        const id = toId(includeLotId);
        if (id) entry.excludedLots = entry.excludedLots.filter(x => !x.equals(id));
      }

      await doc.save();
      res.json({ month, excludedLots: entry.excludedLots.map(x => x.toString()) });
    } catch (err) {
      console.error('[community-competition:sales-summary:put]', err);
      const code = err.status || 500;
      res.status(code).json({ error: err.message || 'Server error' });
    }
  }
);

/**
 * GET /api/community-competition-profiles/:communityId/sales?month=YYYY-MM
 * Return sold/closed lots within that month
 */
// GET /api/community-profiles/:communityId/sales?months=12
router.get('/community-profiles/:communityId/sales',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      const monthsParam = parseInt(req.query.months ?? '12', 10);
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });
      const months = Number.isFinite(monthsParam) ? Math.min(Math.max(monthsParam, 1), 36) : 12;

      const community = await assertCommunityInTenant(req, communityId, 'company');
      const profile = await CommunityCompetitionProfile.findOne({ community: community._id, ...baseFilter(req) })
        .select('monthlySalesSummary')
        .lean();

      const summaryMap = new Map();
      for (const entry of profile?.monthlySalesSummary || []) {
        if (!entry) continue;
        const month = entry.month || entry.Month || '';
        if (typeof month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month.trim())) {
          summaryMap.set(month.trim(), {
            sales: Number(entry.sales ?? 0) || 0,
            cancels: Number(entry.cancels ?? 0) || 0,
            closings: Number(entry.closings ?? 0) || 0
          });
        }
      }

      const labels = [];
      const salesSeries = [];
      const cancelsSeries = [];
      const closingsSeries = [];
      const netSeries = [];

      const now = new Date();
      const baseYear = now.getFullYear();
      const baseMonth = now.getMonth();

      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(baseYear, baseMonth - i, 1);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const friendly = d.toLocaleString(undefined, { month: 'short', year: 'numeric' });
        const stats = summaryMap.get(ym) || { sales: 0, cancels: 0, closings: 0 };
        labels.push(friendly);
        salesSeries.push(stats.sales);
        cancelsSeries.push(stats.cancels);
        closingsSeries.push(stats.closings);
        netSeries.push(Math.max(0, stats.sales - stats.cancels));
      }

      return res.json({
        labels,
        series: {
          sales: salesSeries,
          cancels: cancelsSeries,
          closings: closingsSeries,
          net: netSeries
        }
      });
    } catch (err) {
      console.error('[community-competition:sales-series]', err);
      const code = err.status || 500;
      res.status(code).json({ error: err.message || 'Server error' });
    }
  }
);

router.get('/community-competition-profiles/:communityId/sales',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      const { month } = req.query;
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });
      if (!isYYYYMM(month)) return res.status(400).json({ error: 'month=YYYY-MM is required' });

      await assertCommunityInTenant(req, communityId);

      const community = await Community.findOne({ _id: communityId, ...baseFilter(req) })
        .select('lots createdAt')
        .lean();
      if (!community) return res.status(404).json({ error: 'Community not found' });

      const selectedYM = ymStrToInt(month);
      const soldStatuses = new Set(['closed', 'purchased', 'sold']);
      const results = [];
      const planIds = new Set();

      for (const l of (community.lots || [])) {
        const s = String(l?.status || '').toLowerCase().trim();
        const isSold = Boolean(l?.purchaser) || soldStatuses.has(s);
        if (!isSold) continue;

        const soldYM = (typeof l.closeMonth === 'string' ? ymStrToInt(l.closeMonth) : null) ?? dateLikeToYMInt(l.closeDateTime);
        if (soldYM == null) continue;
        if (selectedYM != null && soldYM !== selectedYM) continue;

        results.push(l);
        if (l.floorPlan) planIds.add(String(l.floorPlan));
      }

      let planMap = {};
      if (planIds.size) {
        const plans = await FloorPlan.find({ _id: { $in: [...planIds] }, ...baseFilter(req) })
          .select('name planNumber specs.squareFeet')
          .lean();
        planMap = Object.fromEntries(
          plans.map(p => [String(p._id), {
            _id: p._id, name: p.name, planNumber: p.planNumber, sqft: p?.specs?.squareFeet ?? null
          }])
        );
      }

      const sales = results.map(l => ({
        lotId: l._id,
        address: l.address || l.streetAddress || '',
        listDate: l.releaseDate || null,
        floorPlan: l.floorPlan ? (planMap[String(l.floorPlan)] || null) : null,
        listPrice: l.listPrice ?? null,
        sqft: l.squareFeet ?? l.sqft ?? (planMap[String(l.floorPlan)]?.sqft ?? null),
        status: l.status || '',
        soldDate: l.closeDateTime || l.closeMonth || null,
        soldPrice: l.salesPrice ?? null
      })).sort((a, b) => String(a.soldDate || '').localeCompare(String(b.soldDate || '')));

      res.json({ month, sales });
    } catch (err) {
      console.error('[community-competition:sales-summary:put]', err);
      const code = err.status || 500;
      res.status(code).json({ error: err.message || 'Server error' });
    }
  }
);

/**
 * GET /api/communities/:communityId/floorplans
 * Plans available to a community (tenant-scoped)
 */
router.get('/communities/:communityId/floorplans',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });

      await assertCommunityInTenant(req, communityId);

      // Prefer explicit relation on FloorPlan
      let plans = await FloorPlan.find({ communities: communityId, ...baseFilter(req) })
        .select('_id name planNumber specs.squareFeet specs.beds specs.baths specs.garage')
        .sort({ name: 1 })
        .lean();

      if (!plans.length) {
        const community = await Community.findOne({ _id: communityId, ...baseFilter(req) })
          .populate('lots.floorPlan', 'name planNumber specs.squareFeet specs.beds specs.baths specs.garage company')
          .lean();

        const uniq = new Map();
        for (const lot of (community?.lots || [])) {
          const fp = lot.floorPlan;
          if (fp && fp._id && (!fp.company || isSuper(req) || String(fp.company) === String(req.user.company))) {
            uniq.set(String(fp._id), fp);
          }
        }
        plans = [...uniq.values()].sort((a,b) => (a.name || '').localeCompare(b.name || ''));
      }

      res.json(plans);
    } catch (err) {
      console.error('[community-competition:sales-summary:get]', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/**
 * GET lot counts / stats — READONLY+
 */
router.get('/communities/:communityId/lot-count',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });
      const comm = await Community.findOne({ _id: communityId, ...baseFilter(req) }).select('totalLots lots').lean();
      if (!comm) return res.status(404).json({ error: 'Community not found' });
      const totalLots = typeof comm.totalLots === 'number' ? comm.totalLots : (Array.isArray(comm.lots) ? comm.lots.length : 0);
      res.json({ totalLots });
    } catch (err) {
      console.error('[community-competition:sales-summary:get]', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.get('/communities/:communityId/lot-stats',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });
      const community = await Community.findOne({ _id: communityId, ...baseFilter(req) })
        .select('totalLots lots.purchaser lots')
        .lean();
      if (!community) return res.status(404).json({ error: 'Community not found' });

      const lots = Array.isArray(community.lots) ? community.lots : [];
      const total = typeof community.totalLots === 'number' ? community.totalLots : lots.length;
      const sold = lots.filter(l => !!l && !!l.purchaser).length;
      const remaining = Math.max(0, total - sold);

      res.json({ total, sold, remaining, quickMoveInLots: 0 });
    } catch (err) {
      console.error('[community-competition:sales-summary:get]', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/**
 * GET/PUT monthly sales summary — READONLY+/USER+
 */
router.get('/community-competition-profiles/:communityId/sales-summary',
  requireRole('READONLY','USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      const { month } = req.query;
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });
      if (!isYYYYMM(month)) return res.status(400).json({ error: 'month=YYYY-MM is required' });

      await assertCommunityInTenant(req, communityId);

      const profile = await CommunityCompetitionProfile.findOne({ community: communityId, ...baseFilter(req) })
        .select('monthlySalesSummary')
        .lean();

      const entry = (profile?.monthlySalesSummary || []).find(s => s.month === month);
      const out = entry ? { sales: entry.sales ?? 0, cancels: entry.cancels ?? 0, closings: entry.closings ?? 0 }
                        : { sales: 0, cancels: 0, closings: 0 };
      res.json({ month, ...out });
    } catch (err) {
      console.error('[community-competition:sales-summary:get]', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

router.put('/community-competition-profiles/:communityId/sales-summary',
  requireRole('USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      const { month, sales, cancels, closings } = req.body || {};
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });
      if (!isYYYYMM(month)) return res.status(400).json({ error: 'month=YYYY-MM is required' });

      const community = await assertCommunityInTenant(req, communityId);

      const doc = await CommunityCompetitionProfile.findOneAndUpdate(
        { community: community._id, ...baseFilter(req) },
        { $setOnInsert: { company: community.company, community: community._id } },
        { new: true, upsert: true }
      );

      if (!Array.isArray(doc.monthlySalesSummary)) doc.monthlySalesSummary = [];
      let entry = doc.monthlySalesSummary.find(s => s.month === month);
      if (!entry) {
        entry = { month, sales: 0, cancels: 0, closings: 0 };
        doc.monthlySalesSummary.push(entry);
      }

      const toInt = v => (v === '' || v == null ? null : Number(v));
      const S = toInt(sales), C = toInt(cancels), CL = toInt(closings);
      if (Number.isFinite(S)) entry.sales = S;
      if (Number.isFinite(C)) entry.cancels = C;
      if (Number.isFinite(CL)) entry.closings = CL;

      await doc.save();
      res.json({ month: entry.month, sales: entry.sales ?? 0, cancels: entry.cancels ?? 0, closings: entry.closings ?? 0 });
    } catch (err) {
      console.error('[community-competition:sales-summary:put]', err);
      const code = err.status || 500;
      res.status(code).json({ error: err.message || 'Server error' });
    }
  }
);

/**
 * PUT profile basics (promotion, pros/cons, topPlans)
 * Body: { promotion, prosCons: { pros, cons }, topPlans?: { plan1, plan2, plan3 } }
 */
router.put('/community-competition-profiles/:communityId',
  requireRole('USER','MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid communityId' });
      const community = await assertCommunityInTenant(req, communityId);

      const promotion = String(req.body?.promotion ?? '');
      const pros = toArray(req.body?.prosCons?.pros ?? []);
      const cons = toArray(req.body?.prosCons?.cons ?? []);
      const topPlansIn = req.body?.topPlans || {};

      // normalize top plan ids; ensure they belong to tenant
      const normalizeId = v => (v && typeof v === 'object' && v._id ? v._id : v);
      const planIds = ['plan1','plan2','plan3']
        .map(k => normalizeId(topPlansIn[k]))
        .filter(Boolean);

      await assertPlansInTenant(req, planIds);

      const update = {
        promotion,
        prosCons: { pros, cons },
        ...(req.body.topPlans ? {
          topPlans: {
            plan1: isObjectId(topPlansIn.plan1) ? topPlansIn.plan1 : null,
            plan2: isObjectId(topPlansIn.plan2) ? topPlansIn.plan2 : null,
            plan3: isObjectId(topPlansIn.plan3) ? topPlansIn.plan3 : null
          }
        } : {})
      };

      const profile = await CommunityCompetitionProfile.findOneAndUpdate(
        { community: community._id, ...baseFilter(req) },
        { $set: update, $setOnInsert: { company: community.company, community: community._id } },
        { new: true, upsert: true }
      )
      .populate([
        { path: 'topPlans.plan1', select: 'name planNumber specs.squareFeet' },
        { path: 'topPlans.plan2', select: 'name planNumber specs.squareFeet' },
        { path: 'topPlans.plan3', select: 'name planNumber specs.squareFeet' },
      ])
      .lean();

      res.json(profile);
    } catch (err) {
      console.error('[community-competition:sales-summary:put]', err);
      const code = err.status || 500;
      res.status(code).json({ error: err.message || 'Server error' });
    }
  }
);

module.exports = router;
