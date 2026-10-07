const mongoose = require('mongoose');

async function connectDatabase(uri) {
  await mongoose.connect(uri, { autoIndex: process.env.NODE_ENV !== 'production' });
  return mongoose.connection;
}

module.exports = { connectDatabase };
