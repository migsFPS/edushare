/**
 * Vercel Serverless Function Entrypoint
 * Forwards requests to the Express application
 */
const app = require('../server');

module.exports = app;
