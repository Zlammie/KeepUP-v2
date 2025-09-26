// routes/lenderRoutes.js (secured & tenant-scoped)
const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const Lender = require("../models/lenderModel");
const ensureAuth  = require("../middleware/ensureAuth");
const requireRole = require("../middleware/requireRole");

// ───────── helpers ─────────
const isObjectId = v => mongoose.Types.ObjectId.isValid(String(v));
const isSuper = req => (req.user?.roles || []).includes("SUPER_ADMIN");
const companyFilter = req => (isSuper(req) ? {} : { company: req.user.company });

const toStr = v => (v ?? "").toString().trim();
const normalizePhone = v => {
  const s = toStr(v).replace(/[^\d]/g, "");
  return s.length >= 10 ? s.slice(-10) : s;
};
const normalizeEmail = v => toStr(v).toLowerCase();
const parseDateMaybe = v => {
  if (!v) return null;
  if (v instanceof Date) return v;
  const n = Number(v);
  if (!Number.isNaN(n) && n > 59_000) { // Excel-ish serial
    const base = new Date(Date.UTC(1899, 11, 30));
    return new Date(base.getTime() + n * 86400000);
  }
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};

// all routes require auth
router.use(ensureAuth);

/**
 * GET /api/lenders?q=smith
 * List lenders in tenant (READONLY+)
 */
router.get("/",
  requireRole("READONLY","USER","MANAGER","COMPANY_ADMIN","SUPER_ADMIN"),
  async (req, res) => {
    try {
      const q = toStr(req.query.q);
      const filter = {
        ...companyFilter(req),
        ...(q ? { $or: [
          { firstName: { $regex: q, $options: "i" } },
          { lastName:  { $regex: q, $options: "i" } },
          { lenderBrokerage: { $regex: q, $options: "i" } },
          { email:     { $regex: q, $options: "i" } },
          { phone:     { $regex: q, $options: "i" } },
        ] } : {})
      };
      const lenders = await Lender.find(filter).sort({ lastName: 1, firstName: 1 }).lean();
      res.json(lenders);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch lenders", details: err.message });
    }
  }
);

/**
 * GET /api/lenders/search?q=...
 * Quick search (READONLY+) — same as above but limited to 10
 */
router.get("/search",
  requireRole("READONLY","USER","MANAGER","COMPANY_ADMIN","SUPER_ADMIN"),
  async (req, res) => {
    const q = toStr(req.query.q);
    if (!q) return res.json([]);
    const filter = {
      ...companyFilter(req),
      $or: [
        { firstName: { $regex: q, $options: "i" } },
        { lastName:  { $regex: q, $options: "i" } },
        { email:     { $regex: q, $options: "i" } },
        { phone:     { $regex: q, $options: "i" } },
      ]
    };
    const lenders = await Lender.find(filter).limit(10).lean();
    res.json(lenders);
  }
);

/**
 * GET /api/lenders/:id
 * Read single (READONLY+)
 */
router.get("/:id",
  requireRole("READONLY","USER","MANAGER","COMPANY_ADMIN","SUPER_ADMIN"),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!isObjectId(id)) return res.status(400).json({ error: "Invalid id" });

      const lender = await Lender.findOne({ _id: id, ...companyFilter(req) }).lean();
      if (!lender) return res.status(404).json({ error: "Lender not found" });
      res.json(lender);
    } catch (err) {
      console.error("Error fetching lender:", err);
      res.status(500).json({ error: "Server error" });
    }
  }
);

/**
 * POST /api/lenders
 * Create (USER+). Stamps company server-side; normalizes email/phone/date.
 */
router.post("/",
  requireRole("USER","MANAGER","COMPANY_ADMIN","SUPER_ADMIN"),
  async (req, res) => {
    try {
      const body = { ...req.body };

      // tenant stamp (non-super cannot spoof)
      body.company = isSuper(req) ? (body.company || req.user.company) : req.user.company;

      // normalize
      if (body.email) body.email = normalizeEmail(body.email);
      if (body.phone) body.phone = normalizePhone(body.phone);
      if (body.visitDate) body.visitDate = parseDateMaybe(body.visitDate);

      const lender = await Lender.create(body);
      res.status(201).json(lender);
    } catch (err) {
      const code = err?.code === 11000 ? 409 : 400; // unique collisions on email/phone (per company)
      res.status(code).json({ error: err.message });
    }
  }
);

/**
 * PUT /api/lenders/:id
 * Update (USER+). Prevent cross-tenant moves; normalize fields.
 */
router.put("/:id",
  requireRole("USER","MANAGER","COMPANY_ADMIN","SUPER_ADMIN"),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!isObjectId(id)) return res.status(400).json({ error: "Invalid id" });

      const updates = { ...req.body };
      delete updates.company; // never allow tenant change

      if (updates.email) updates.email = normalizeEmail(updates.email);
      if (updates.phone) updates.phone = normalizePhone(updates.phone);
      if (updates.visitDate) updates.visitDate = parseDateMaybe(updates.visitDate);

      const updated = await Lender.findOneAndUpdate(
        { _id: id, ...companyFilter(req) },
        updates,
        { new: true, runValidators: true }
      ).lean();

      if (!updated) return res.status(404).json({ error: "Lender not found" });
      res.json(updated);
    } catch (err) {
      const code = err?.code === 11000 ? 409 : 400;
      res.status(code).json({ error: err.message || "Failed to update lender" });
    }
  }
);

/**
 * DELETE /api/lenders/:id
 * Delete (MANAGER+).
 */
router.delete("/:id",
  requireRole("MANAGER","COMPANY_ADMIN","SUPER_ADMIN"),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!isObjectId(id)) return res.status(400).json({ error: "Invalid id" });

      const lender = await Lender.findOneAndDelete({ _id: id, ...companyFilter(req) });
      if (!lender) return res.status(404).json({ error: "Lender not found" });

      res.json({ ok: true });
    } catch (err) {
      console.error("Error deleting lender:", err);
      res.status(500).json({ error: "Server error" });
    }
  }
);

module.exports = router;
