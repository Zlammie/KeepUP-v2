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

const app = express();

// ✅ Static and body parsers (must come BEFORE any routes)
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// ✅ MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// ✅ API Routes (now in correct order)
app.use('/api/realtors', realtorRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/communities', communityRoutes);
app.use('/api/lenders', lenderRoutes);
app.use('/api/comments', commentRoutes); // ✅ moved after bodyParser
app.use('/api', require('./routes/lotViewRoutes'));

// Catch-all for undefined API routes
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(process.env.PORT, () => {
  console.log(`Server running on http://localhost:${process.env.PORT}`);
});
