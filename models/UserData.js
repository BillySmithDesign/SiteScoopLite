const mongoose = require('mongoose');

const userDataSchema = new mongoose.Schema({
  ip: String,
  geo: Object,
  userAgent: String,
  time: { type: Date, default: Date.now },
  url: String,
  downloadLink: String
});

module.exports = mongoose.model('UserData', userDataSchema);
