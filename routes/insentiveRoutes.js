const express = require('express');
const router = express.Router();
const insentiveController = require('../controllers/insentiveController');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });


router.post('/insentive', insentiveController.createRecord);
router.get('/getAllLabours', insentiveController.getAllLabours);
router.get('/searchLaboursFromVariablePay', insentiveController.searchLaboursFromVariablePay);
router.get('/searchLaboursFromAttendanceApproval', insentiveController.searchLaboursFromAttendanceApproval);
router.get('/searchLaboursFromWagesApproval', insentiveController.searchLaboursFromWagesApproval);
router.get('/searchFromSiteTransferApproval', insentiveController.searchFromSiteTransferApproval);
router.get('/searchFromViewMonthlyPayroll', insentiveController.searchFromViewMonthlyPayroll);
router.get('/getVariablePayAndLabourOnboardingJoin', insentiveController.getVariablePayAndLabourOnboardingJoincontroller);
router.post('/upsertVariablePay', insentiveController.upsertLabourVariablePay);
router.get('/checkExistingVariablePay', insentiveController.checkExistingVariablePayController);
router.post('/sendVariablePayForApproval', insentiveController.markVariablePayForApprovalController);
router.put('/admin/approveVariablePay', insentiveController.approveVariablePayAdmin);
router.put('/admin/rejectVariablePay', insentiveController.rejectVariablePayAdmin);
router.get('/admin/getVariablePayAdminApprovals', insentiveController.getVariablePayAdminApprovals);
router.get('/exportVariablePayexcelSheetWithBU', insentiveController.exportVariablePayexcelSheetWithBU);
router.get('/exportVariablePayExcel', insentiveController.exportVariablePayexcelSheet);

router.post('/importVariablePay', upload.single('file'), insentiveController.importVariablePay);

// --------------------------------------------------   routes for salary generation process -----------------------------------
router.post('/generateMonthlyPayroll', insentiveController.generateMonthlyPayroll);
router.post('/generateMonthlyPayroll/:labourId', insentiveController.generateMonthlyPayrollForSingleLabour);

/* 1)*/   router.get('/payroll/eligibleLaboursForSalaryGeneration', insentiveController.getEligibleLaboursAPI);
/* 2)*/   router.get('/payroll/:labourId/attendanceSummary', insentiveController.getAttendanceSummaryAPI);
/* 3)*/   router.get('/payroll/:labourId/wageInfo', insentiveController.getWageInfoAPI);
/* 4)*/   router.get('/payroll/:labourId/variablePay', insentiveController.getVariablePayAPI);
/* 5)*/   router.get('/payroll/:labourId/calculateSingleLabour', insentiveController.calculateSingleLabourAPI);
/* 7)*/   router.get('/payroll/monthlySalaries', insentiveController.getMonthlySalariesAPI);
/* 8)*/   router.get('/payroll/:labourId/getOvertimeMonthly', insentiveController.getOvertimeMonthlyAPI);
/* 6)*/   router.post('/payroll/generateMonthlySalaryGeneration', insentiveController.generateMonthlyPayrollAPI);
/* 9)*/   router.get('/payroll/salaryGenerationDataAllLabours', insentiveController.getSalaryGenerationDataAPIAllLabours);
/* 9)*/   router.get('/payroll/salaryGenerationData', insentiveController.getSalaryGenerationDataAPI);
router.post('/payroll/saveFinalPayrollData', insentiveController.saveFinalizePayrollData);
router.post('/payroll/deleteFinalPayrollData', insentiveController.deletePayrollController);
router.get('/payroll/finalizedSalaryDataByLabourID', insentiveController.getFinalizedSalaryDataByLabourID);
router.get('/payroll/finalizedSalaryData', insentiveController.getFinalizedSalaryData);
router.get('/exportMonthlyPayrollExcel', insentiveController.exportMonthlyPayrollExcel);

router.get('/exportMonthlyWagesExcel', insentiveController.exportMonthlyWagesExcel);
router.get('/exportFixedWagesExcel', insentiveController.exportFixedWagesExcel);
router.get('/exportWagesExcel', insentiveController.exportWagesexcelSheet);
/**
 * 1) GET /api/payroll/eligibleLaboursForSalaryGeneration?month=12&year=2024
 *    Returns a list of labour IDs who have at least 1 day attendance
 *    and have an approved wage record for the given month/year.

 * 2) GET /api/payroll/labour/:labourId/attendanceSummary?month=12&year=2024
 *    Returns attendance summary (presentDays, absentDays, etc.) for a single labour in the month/year.

 * 3) GET /api/payroll/labour/:labourId/wageInfo?month=12&year=2024
 *    Returns the wage info (daily or monthly, weeklyOff, etc.) for that labour in the month/year.

 * 4) GET /api/payroll/labour/:labourId/variablePay?month=12&year=2024
 *    Returns the variable pay amounts and remarks (advance, debit, incentive) for that labour in the month/year.

 * 5) GET /api/payroll/labour/:labourId/calculateSingleLabour  
 *    Calculates the final salary for a single labour (but does not insert).

 * 6) POST /api/payroll/generateMonthlySalaryGeneration
 *    { "month": 12, "year": 2024 }
 *    Generates monthly payroll for all eligible labours and inserts into [MonthlySalaryGeneration].
 *    Returns an array of final results.

 * 7) GET /api/payroll/monthlySalaries?month=12&year=2024
 *    Retrieves final salary records from [MonthlySalaryGeneration] for that month/year (if you want to show them).
 */


// router.get('/showAttendanceCalenderSingleLabour/:id', insentiveController.getAttendanceCalenderSingleLabour);
// router.post('/generateMonthlyPayroll', insentiveController.generateMonthlyPayroll);
// router.post('/generateMonthlyPayroll/:labourId', insentiveController.generateMonthlyPayrollForSingleLabour);


//  router.get('/validPunches', insentiveController.getMatchedLabourIdsWithValidPunch);
 router.get('/validPunches', async (req, res) => {
  try {
    const matchedIds = await insentiveController.getMatchedLabourIdsWithValidPunch();
    res.status(200).json({ matchedIds });
  } catch (error) {
    console.error("API Error:", error);
    res.status(500).json({ error: 'Failed to fetch matched labour IDs' });
  }
});


module.exports = router;