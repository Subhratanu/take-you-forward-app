// Configuration file
const config = {
  development: {
    port: process.env.PORT || 5000,
    nodeEnv: 'development',
    dbUrl: process.env.DB_URL || 'mongodb://localhost:27017/take-you-forward'
  },
  production: {
    port: process.env.PORT || 8000,
    nodeEnv: 'production',
    dbUrl: process.env.DB_URL
  },
  testing: {
    port: 5001,
    nodeEnv: 'testing',
    dbUrl: 'mongodb://localhost:27017/take-you-forward-test'
  }
};

const environment = process.env.NODE_ENV || 'development';

module.exports = config[environment];
