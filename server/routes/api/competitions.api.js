const express = require('express');
const ensureAuth = require('../../middleware/ensureAuth');
const c = require('../../controllers/competition.controller');

const router = express.Router();
router.use(ensureAuth);

router.get('/minimal', c.listMinimal)

// competitions collection
router.get('/', c.list);
router.post('/', c.create);
router.delete('/:id', c.remove);

// floorplans
router.get('/:id/floorplans', c.getFloorPlans);
router.post('/:id/floorplans', c.addFloorPlan);
router.put('/:id/floorplans/:fpId', c.updateFloorPlan);

// price records
router.get('/:id/price-records', c.getPriceRecords);
router.post('/:id/price-records', c.createPriceRecord);
router.put('/:id/price-records/:recId', c.updatePriceRecord);

// quick move-ins
router.get('/:id/quick-moveins', c.listQMIs);
router.post('/:id/quick-moveins', c.createQMI);
router.put('/:id/quick-moveins/:recId', c.updateQMI);
router.delete('/:id/quick-moveins/:recId', c.deleteQMI);

// sales records
router.get('/:id/sales-records', c.listSales);
router.post('/:id/sales-records', c.createSales);
router.put('/:id/sales-records/:recId', c.updateSales);

module.exports = router;
