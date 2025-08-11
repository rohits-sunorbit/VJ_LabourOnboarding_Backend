 const express = require('express');
 const router = express.Router();
 const attandanceController = require('../controllers/attandanceController');

 router.get('/validPunches', attandanceController.getMatchedLabourIdsWithValidPunch);

 module.exports =router;