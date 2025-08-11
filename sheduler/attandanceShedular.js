const cron = require('node-cron');
const { compareAndUpdateLabourPunches } = require('../controllers/attandanceController');
const winston = require('winston');
const path = require('path');
const fs = require('fs');

// === Logger Setup ===
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

const date = new Date().toISOString().split('T')[0];
const logFile = path.join(logDir, `labour_cron_${date}.log`);

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    })
  ),
  transports: [
    new winston.transports.File({ filename: logFile }),
    new winston.transports.Console()
  ],
});

// === Job Runner ===
async function runScheduledJob(shiftLabel) {
  try {
    logger.info(`${shiftLabel} - Job Started`);
    const result = await compareAndUpdateLabourPunches();
    logger.info(`${shiftLabel} - Success: ${JSON.stringify(result)}`);
  } catch (error) {
    logger.error(`${shiftLabel} - Failed: ${error.message}`);
  }
}

// === Run Jobs Sequentially ===
async function runAllJobsSequentially() {
  await runScheduledJob('Shift 1 (08:00 AM)');
  await runScheduledJob('Shift 2 (11:00 AM)');
  await runScheduledJob('Shift 3 (02:00 PM)');
  logger.info('✅ All shift jobs completed sequentially.');
}

// === Schedule One Cron to Run All Sequentially ===
// Example: Runs at 12:30 PM daily
cron.schedule('8 13 * * *', () => {
  console.log('⏰Cron Running all to Fetch data...');
  logger.info('⏰ Running all shift jobs sequentially...');
  runAllJobsSequentially();
});

logger.info('⏰ Labour Sequential Cron Scheduled Successfully');