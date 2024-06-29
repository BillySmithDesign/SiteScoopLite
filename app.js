const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const logger = require('./logger');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'public'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(helmet());

// Rate limiting
const downloadLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 5, // limit each IP to 5 requests per windowMs
  handler: (req, res) => {
    res.render('limit');
  }
});

app.get('/', (req, res) => {
  res.render('index');
});

app.post('/download', downloadLimiter, (req, res) => {
  const { url } = req.body;
  res.redirect(`/.netlify/functions/download?url=${encodeURIComponent(url)}`);
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).send('Something went wrong!');
});

module.exports = app;
