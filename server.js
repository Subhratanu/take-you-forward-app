const app = require('./src/app');
const config = require('./src/config');

const PORT = config.port;
const NODE_ENV = config.nodeEnv;

const server = app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║  Backend Server Started Successfully ║
  ║  Port: ${PORT}                           
  ║  Environment: ${NODE_ENV}              
  ╚══════════════════════════════════════╝
  `);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  server.close(() => {
    process.exit(1);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});
