require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');

const realtorRoutes = require('./routes/realtorRoutes'); 
const contactRoutes = require('./routes/contactRoutes');
const communityRoutes = require('./routes/communityRoutes');
const lenderRoutes = require('./routes/lenderRoutes');
const commentRoutes = require('./routes/commentsRoutes');
const lotViewRoutes = require('./routes/lotViewRoutes');
const floorPlanRoutes  = require('./routes/floorPlanRoutes');

const app = express();

// ✅ Static file serving (NEW structure)
app.use('/assets', express.static(path.join(__dirname, '../client/assets'))); // serve CSS, JS, icons, etc.
app.use(express.static(path.join(__dirname, '../client/views/pages'))); // serve HTML pages
app.use(express.static(path.join(__dirname, '../client/views/components'))); // serve nav, partials

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
app.use('/api', lotViewRoutes); // cleaner import

// ✅ Serve default frontend page at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/views/pages/contacts.html'));
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
