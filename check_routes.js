const { app } = require('./server');
const listEndpoints = require('express-list-endpoints');
console.log(JSON.stringify(listEndpoints(app), null, 2));
process.exit(0);
