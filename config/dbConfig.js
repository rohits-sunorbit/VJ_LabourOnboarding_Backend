
const sql = require('mssql');

const config = {
  user: 'sa',
  password: 'farvision@123',
  server: '157.20.51.205',
  database: 'LabourOnboardingForm',


  // user:process.env.DB_USER_1,
  // password:process.env.DB_PASSWORD_1,
  // server:process.env.DB_SERVER_1,
  // database:process.env.DB_NAME_1,
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableAirAbort: true,
    trustedConnection: true
  },
  requestTimeout: 300000, // 5 minutes (adjust as needed)
  connectionTimeout: 300000,
};

const poolPromise = new sql.ConnectionPool(config)
  .connect()
  .then(pool => {
    console.log('Connected to MSSQL ' + process.env.DB_SERVER_1);
    return pool;
  })
  .catch(err => {
    console.error('Database connection failed:', err);
  });

module.exports = {
  sql,
  poolPromise,
};

