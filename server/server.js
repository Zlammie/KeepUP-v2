require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const numOrNull = v => (v === '' || v == null ? null : Number(v));
const toNum = v => (v == null || v === '' ? 0 : Number(v));

const realtorRoutes = require('./routes/realtorRoutes'); 
const contactRoutes = require('./routes/contactRoutes');
const communityRoutes = require('./routes/communityRoutes');
const lenderRoutes = require('./routes/lenderRoutes');
const commentRoutes = require('./routes/commentsRoutes');
const lotViewRoutes = require('./routes/lotViewRoutes');
const floorPlanRoutes  = require('./routes/floorPlanRoutes');
const competitionRoutes = require('./routes/competitionRoutes')
const myCommunityCompetitionRoutes = require('./routes/myCommunityCompetitionRoutes');
const communityCompetitionProfileRoutes = require('./routes/communityCompetitionProfileRoutes');


const Contact = require(path.join(__dirname, 'models', 'Contact'));
const Realtor = require(path.join(__dirname, 'models', 'Realtor'));
const Lender  = require(path.join(__dirname, 'models', 'lenderModel'));
const Community = require(path.join(__dirname, 'models', 'Community'));
const Competition = require(path.join(__dirname,'models', 'Competition'));
const FloorPlanComp = require(path.join(__dirname, 'models', 'floorPlanComp'));
const PriceRecord = require(path.join(__dirname, 'models', 'PriceRecord'));
const QuickMoveIn = require(path.join(__dirname, 'models', 'quickMoveIn'));
const SalesRecord = require(path.join(__dirname,'models', 'salesRecord'));
const CommunityCompetitionProfile = require(path.join(__dirname, 'models', 'communityCompetitionProfile'));

const app = express();

// ✅ Static file serving (NEW structure)
app.use('/assets', express.static(path.join(__dirname, '../client/assets'))); // CSS, JS, images, icons

// ✅ View engine setup
app.set('views', path.join(__dirname, '../client/views')); 
app.set('view engine', 'ejs');
 

// ✅ Body parsing middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// ✅ MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// ✅ API Routes
app.use('/api/realtors', realtorRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/communities', communityRoutes);
app.use('/api/lenders', lenderRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/floorplans', floorPlanRoutes);
app.use('/api', lotViewRoutes);
app.use('/api/competitions', competitionRoutes);
app.use(myCommunityCompetitionRoutes);
app.use(communityCompetitionProfileRoutes);


// ✅ Render EJS pages
app.get('/', (req, res) => {
  res.render('pages/index', { active: 'home' });
});

app.get('/index', (req, res) => {
  res.render('pages/index', { active: 'home' });
});

// Add‐Lead page
app.get('/add-lead', (req, res) => {
  // any prep work here…
  res.render('pages/add-lead', { active: 'add-lead' });
});

// Contacts list
app.get('/contacts', async (req, res) => {
  try {
   const contacts = await Contact.find();
    res.render('pages/contacts', { contacts, active: 'contacts' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading contacts');
  }
});

// Realtors list
app.get('/realtors', async (req, res) => {
  try {
    const realtors = await Realtor.find();
    res.render('pages/realtors', { realtors, active: 'realtors' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading realtors');
  }
});

// Lenders list
app.get('/lenders', async (req, res) => {
  try {
    const lenders = await Lender.find();
    res.render('pages/lenders', { lenders, active: 'lenders' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading lenders');
  }
});

// Community management page
app.get('/community-management', (req, res) => {
  // load any data you need here…
  res.render('pages/community-management', { active: 'community' });
});

// View All Communities page
app.get('/view-communities', async (req, res) => {
  try {
    const communities = await Community.find();
    res.render('pages/view-communities', {
      communities,
      active: 'community'
    });
  } catch (err) {
    console.error('Error loading view-communities:', err);
    res.status(500).send('Error loading communities');
  }
});
 // Add‐Floorplan page
 app.get('/add-floorplan', (req, res) => {
   res.render('pages/add-floorplan', { active: 'floor-plans' });
 });
 app.get('/view-lots', (req, res) => {
  const communityId = req.query.communityId;
  // You could optionally validate the ID here
  res.render('pages/view-lots', {
    communityId,
    active: 'community'
  });
});
app.get('/address-details', (req, res) => {
  const { communityId, lotId } = req.query;
  res.render('pages/address-details', { communityId, lotId, active: 'community' });
});
app.get('/contact-details', async (req, res) => {
  try {
    const id = req.query.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).send('Invalid contact ID');
    }

    const contact = await Contact
      .findById(id)
      .populate('realtor')   // if you store a realtor ObjectId
      .populate('lenders');  // if you store lenders as ObjectId[]

    if (!contact) {
      return res.status(404).send('Contact not found');
    }

    res.render('pages/contact-details', {
      contact,
      active: 'contacts'
    });
  } catch (err) {
    console.error('Error loading contact-details:', err);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/realtor-details', async (req, res) => {
  try {
    const id = req.query.id;
    const realtor = await Realtor.findById(id);
    const contacts = await Contact.find({ realtor: id });
    res.render('pages/realtor-details', {
      realtor,
      contacts,
      active: 'realtors'
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading realtor details');
  }
});
app.get('/lender-view', async (req, res) => {
  try {
    const id = req.query.id;
    // 1) Validate ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).send('Invalid lender ID');
    }

    // 2) Load lender
    const lender = await Lender.findById(id);
    if (!lender) {
      return res.status(404).send('Lender not found');
    }

    // 3) Load contacts linked to this lender
    //    👇 adjust “linkedLender” to whatever your Contact schema uses
    const contacts = await Contact.find({ linkedLender: id });

    // 4) Render the view
    res.render('pages/lender-view', {
      lender,
      contacts,
      active: 'lenders'
    });
  } catch (err) {
    console.error('💥 Error in /lender-view:', err);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/competition-home', (req, res) => {
  // if you’ve placed competition-home.ejs under client/views/pages:
  res.render('pages/competition-home', {
    active: 'competition'   // adjust this key to highlight the correct nav item
  });
});
app.get('/add-competition', (req, res) => {
  // if you’ve placed competition-home.ejs under client/views/pages:
  res.render('pages/add-competition', {
    active: 'add-competition'   // adjust this key to highlight the correct nav item
  });
});

app.post('/add-competition', async (req, res) => {
  try {
    const competition = new Competition(req.body);
    await competition.save();
    res.json({ success: true, competition });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/manage-competition', (req, res) => {
  // if you’ve placed competition-home.ejs under client/views/pages:
  res.render('pages/manage-competition', {
    active: 'manage-competition'   // adjust this key to highlight the correct nav item
  });
});

app.get('/api/competitions', async (req, res, next) => {
  try {
    const comps = await Competition.find().lean();
    res.json(comps);
  } catch (err) {
    next(err);
  }
});
app.get('/competition-details/:id', async (req, res) => {
  try {
    const comp = await Competition.findById(req.params.id).lean();
    if (!comp) return res.status(404).send('Competition not found');

    const floorPlans = await FloorPlanComp.find({ competition: comp._id }).lean();

    res.render('pages/competition-details', {
      active: 'competition',
      competition: comp,
      floorPlans: floorPlans.map(fp => fp.name)  // pass just the plan names
    });
  } catch (err) {
    console.error('Error loading competition-details:', err);
    res.status(500).send('Internal Server Error');
  }
});
app.post('/add-competition', async (req, res, next) => {
  try {
    const {
      communityName,
      builderName,
      address,
      city,
      zip,
      lotSize,
      salesPerson,
      salesPersonPhone,
      salesPersonEmail,
      schoolISD,
      elementarySchool,
      middleSchool,
      HOA,
      tax,
      earnestAmount,
      realtorCommission
    } = req.body;

    // Extract and normalize feeTypes (can be 'None', 'MUD', 'PID', or any combination)
    let { feeTypes, mudFee, pidFee } = req.body;
    if (!feeTypes) {
      feeTypes = ['None'];
    } else if (!Array.isArray(feeTypes)) {
      feeTypes = [feeTypes];
    }
    // If "None" is selected, ignore any MUD/PID fees
    if (feeTypes.includes('None')) {
      feeTypes = ['None'];
      mudFee = undefined;
      pidFee = undefined;
    }

    await Competition.create({
      communityName,
      builderName,
      address,
      city,
      zip,
      lotSize,
      salesPerson,
      salesPersonPhone,
      salesPersonEmail,
      schoolISD,
      elementarySchool,
      middleSchool,
      HOA: parseFloat(HOA),
      tax: parseFloat(tax),
      feeTypes,                                  // array of selected fee types
      mudFee: feeTypes.includes('MUD') 
              ? parseFloat(mudFee) 
              : undefined,
      pidFee: feeTypes.includes('PID') 
              ? parseFloat(pidFee) 
              : undefined,
      earnestAmount: parseFloat(earnestAmount),
      realtorCommission: parseFloat(realtorCommission)
    });

    res.redirect('/manage-competition');
  } catch (err) {
    next(err);
  }
});

app.delete('/api/competitions/:id', async (req, res) => {
  try {
    const deleted = await Competition.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Competition not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/update-competition/:id', async (req, res, next) => {
  try {
    const comp = await Competition.findById(req.params.id).lean();
    if (!comp) return res.status(404).send('Competition not found');
    res.render('pages/update-competition', {
      active: 'competition',
      competition: comp
    });
  } catch (err) {
    next(err);
  }
});
app.get('/update-competition/:id', async (req, res, next) => {
  try {
    const competition = await Competition.findById(req.params.id).lean();
    if (!competition) return res.status(404).send('Not found');
    res.render('pages/update-competition', { competition });
  } catch (err) {
    next(err);
  }
});

app.get('/api/competitions/:id/floorplans', async (req, res, next) => {
  try {
   const fps = await FloorPlanComp.find({ competition: req.params.id }).lean();
    res.json(fps);
  } catch (err) {
    next(err);
  }
});

// POST new
app.post('/api/competitions/:id/floorplans', async (req, res, next) => {
  try {
   const fp = await FloorPlanComp.create({
      competition: req.params.id,
      ...req.body
    });
    res.status(201).json(fp);
  } catch (err) {
    next(err);
  }
});

// PUT update
app.put('/api/competitions/:id/floorplans/:fpId', async (req, res, next) => {
  try {
  const fp = await FloorPlanComp.findByIdAndUpdate(
      req.params.fpId,
      req.body,
      { new: true }
    ).lean();
    res.json(fp);
  } catch (err) {
    next(err);
  }
});

app.get('/api/competitions/:id/price-records', async (req, res, next) => {
  try {
    const { month } = req.query; // e.g. ?month=2025-07
    const recs = await PriceRecord
      .find({ competition: req.params.id, month })
      .lean();
    res.json(recs);
  } catch (err) {
    next(err);
  }
});

// create a new price record
app.post('/api/competitions/:id/price-records', async (req, res, next) => {
  try {
    const { floorPlanId, month, price } = req.body;
    const rec = await PriceRecord.create({
      competition: req.params.id,
      floorPlan: floorPlanId,
      month,
      price
    });
    res.status(201).json(rec);
  } catch (err) {
    next(err);
  }
});

// update an existing price record
app.put('/api/competitions/:id/price-records/:recId', async (req, res, next) => {
  try {
    const { price } = req.body;
    const rec = await PriceRecord
      .findByIdAndUpdate(req.params.recId, { price }, { new: true })
      .lean();
    res.json(rec);
  } catch (err) {
    next(err);
  }
});
app.get('/api/competitions/:id/quick-moveins', async (req, res, next) => {
  try {
    const { month } = req.query;
    const filter = { competition: req.params.id };
   if (month) filter.month = month;
   const recs = await QuickMoveIn.find(filter).lean();
    res.json(recs);
  } catch (err) {
    next(err);
  }
});


// POST new quick-move-in
app.post('/api/competitions/:id/quick-moveins', async (req, res, next) => {
  try {
    const {
      month,
      address,
      floorPlanId,   // front-end may send floorPlanId ...
      floorPlan,     // ...or floorPlan (use whichever is present)
      listPrice,
      sqft,
      status,
      listDate,
      soldDate,
      soldPrice      // <-- make sure this is included
    } = req.body;

    const rec = await QuickMoveIn.create({
      competition: req.params.id,
      month,
      address,
      floorPlan: floorPlanId || floorPlan, // normalize
      listPrice: numOrNull(listPrice),
      sqft:      numOrNull(sqft),
      status,
      listDate,
      soldDate:  soldDate || null,
      soldPrice: numOrNull(soldPrice)      // <-- persist it
    });

    res.status(201).json(rec);
  } catch (err) {
    next(err);
  }
});

// PUT update existing quick-move-in
app.put('/api/competitions/:id/quick-moveins/:recId', async (req, res, next) => {
  try {
    const {
      address,
      floorPlanId,
      floorPlan,
      listPrice,
      sqft,
      status,
      listDate,
      soldDate,
      soldPrice,   // <-- include it
      month
    } = req.body;

    const rec = await QuickMoveIn.findByIdAndUpdate(
      req.params.recId,
      {
        address,
        floorPlan: floorPlanId || floorPlan,
        listPrice: numOrNull(listPrice),
        sqft:      numOrNull(sqft),
        status,
        listDate,
        soldDate:  soldDate || null,
        soldPrice: numOrNull(soldPrice)   // <-- persist it
      },
      { new: true }
    ).lean();

    res.json(rec);
  } catch (err) {
    next(err);
  }
});

app.get('/api/competitions/:id/sales-records', async (req, res, next) => {
  try {
    const { month } = req.query;               // e.g. ?month=2025-06
    const filter = { competition: req.params.id };
    if (month) filter.month = month;
    const recs = await SalesRecord.find(filter).lean();
    res.json(recs);
  } catch (err) {
    next(err);
  }
});

// POST new sales record
app.post('/api/competitions/:id/sales-records', async (req, res, next) => {
  try {
    const { month, sales, cancels, closings } = req.body;
    const rec = await SalesRecord.create({
      competition: req.params.id,
      month,
      sales:   toNum(sales),
      cancels: toNum(cancels),
      closings: toNum(closings),
    });
    res.status(201).json(rec);
  } catch (err) {
    // Optional: send details to the client during dev
    res.status(400).json({ error: err.message });
  }
});

// PUT update existing sales record
app.put('/api/competitions/:id/sales-records/:recId', async (req, res, next) => {
  try {
    const { sales, cancels, closings } = req.body;
    const rec = await SalesRecord.findByIdAndUpdate(
      req.params.recId,
      { sales: toNum(sales), cancels: toNum(cancels), closings: toNum(closings) },
      { new: true, runValidators: true }
    ).lean();
    res.json(rec);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/competitions/:id/quick-moveins/:recId', async (req, res, next) => {
  try {
    await QuickMoveIn.deleteOne({ _id: req.params.recId, competition: req.params.id });
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
});

app.get('/manage-my-community-competition/:communityId', async (req, res) => {
  const { communityId } = req.params;

  try {
    const community = await Community.findById(communityId).lean();
    if (!community) return res.status(404).send('Community not found');

    // 👇 ensure profile exists so EJS never crashes
    res.render('pages/manage-my-community-competition', {
      communityId,
      community,
      profile: null
    });
  } catch (err) {
    console.error('Error loading manage-my-community-competition:', err);
    res.status(500).send('Server error');
  }
});

app.get('/my-community-competition', (req, res) => {
  res.render('pages/my-community-competition', { title: 'My Community — Competition' });
});


// Competition Dashboard page
app.get('/competition-dashboard', (req, res) => {
  const communityId = req.query.communityId || ''; // allow ?communityId=...
  res.render('pages/competition-dashboard', {
    active: 'competition',
    communityId
  });
});

//Help.ejs page
app.get('/toolbar/help', (req, res) => {
  res.render('pages/toolbar/help', {
   
  });
});




// ✅ Catch-all 404 (keep this LAST)
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ✅ Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});