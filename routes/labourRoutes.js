const express = require('express');
const router = express.Router();
const labourController = require('../controllers/labourController');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const JSZip = require('jszip');
const axios = require('axios');
const xml2js = require('xml2js');
const ExcelJS = require('exceljs');
const { poolPromise } = require('../config/dbConfig');

const app = express();

router.post('/check-aadhaar', labourController.handleCheckAadhaar);
router.get('/next-id', labourController.getNextUniqueID);
router.post('/', labourController.createRecord);
router.get('/', (req, res, next)=>{console.log('labourController.getAllRecords route'); next()}, labourController.getAllRecords);
router.get('/getAllRecordsLaboursOnboarding', labourController.getAllRecordsLaboursOnboarding);
router.get('/', labourController.getAllLabours);
router.get('/approved', labourController.getApprovedLabours);
router.get('/search', labourController.searchLabours);
// router.post('/:id/updateRecord', labourController.createRecordUpdate);
router.delete('/:id', labourController.deleteRecord);
// router.put('/updatelabour/:id', labourController.updateRecord);
router.put('/update/:id', labourController.updateRecordLabour);
router.put('/approve/:id', labourController.approveLabour);
router.put('/approveDisableLabour/:id', labourController.approveDisableLabour);
router.put('/reject/:id', labourController.rejectLabour);
router.put('/resubmit/:id', labourController.resubmitLabour);
router.put('/editLabour/:id', labourController.editbuttonLabour);
router.post('/essl/addEmployee', labourController.esslapi);
router.get('/commandstatus/:commandId', labourController.getCommandStatus);
// router.put('/updatelabourDisableStatus/:id', labourController.updateRecordWithDisable);

// router.get('/getEsslStatuses', labourController.getEsslStatuses);
// router.get('/getEmployeeMasterStatuses', labourController.getEmployeeMasterStatuses);
router.post('/getCombinedStatuses', labourController.getUserStatusController);
router.put('/updateHideResubmit/:id', labourController.updateHideResubmitLabour);
// router.get('/labour-status', labourController.getLabourStatus);

// --------------------------------   ALL ROUTES ARE LABOUR PHASE 2 -----------------------------------------------------------------

router.get('/attendance/:labourId', labourController.getAttendance);
router.get('/attendance', labourController.getAllLaboursAttendance);
router.get('/cachedattendance', labourController.getCachedAttendance);
router.post('/attendance/submit', labourController.submitAttendanceController);
router.post('/add', labourController.addWeeklyOff);
router.post('/save', labourController.saveWeeklyOffs);
router.get('/disabledmonth', labourController.getDisabledMonthsAndYears);
router.delete('/deleteAttendance', labourController.deleteAttendance);

// ----------------------------------  fetch attendance -----------------
router.get('/summary', labourController.getAttendanceSummary);
router.get('/details', labourController.getAttendanceDetails);
router.post('/saveattendancemonthly', labourController.saveAttendance);
router.get('/attendancelabours', labourController.getAttendanceDetails);
router.get('/attendancelaboursforsinglelabour/:id', labourController.getAttendanceDetailsForSingleLabour);
router.post('/upsertAttendance', labourController.upsertAttendance);
router.put('/attendance/approve', labourController.approveAttendanceController);
router.put('/attendance/reject', labourController.rejectAttendanceControllerAdmin);
router.get('/LabourAttendanceApproval', labourController.LabourAttendanceApproval);
router.put('/attendance/rejectFromAdmin', labourController.rejectAttendanceController);
router.get('/showAttendanceCalenderSingleLabour/:id', labourController.getAttendanceCalenderSingleLabour);
router.post('/updateOTHoursAttendance', labourController.updateOTHoursAttendance);

router.get('/export', labourController.exportAttendance);
router.get('/exportAttendanceExcel', labourController.generateAttendancePDF);
router.post('/import', upload.single('file'), labourController.importAttendance);


// ----------------------------------------------------------------  Labour Wages Routes ----------------------------
router.get('/wages', labourController.getLabourMonthlyWages);
router.post('/upsertLabourMonthlyWages', labourController.upsertLabourMonthlyWages);
router.get('/wages/adminApprovals', labourController.getWagesAdminApprovals);
router.post('/wages/approvals', labourController.addWageApproval);
router.post('/exportWagesExcel', labourController.exportWagesexcelSheet);
router.post('/importWagesExcel', upload.single('file'), labourController.importWages);
router.get('/getWagesAndLabourOnboardingJoin', labourController.getWagesAndLabourOnboardingJoincontroller);
router.get('/getAttendanceReportAndLabourOnboardingJoin', labourController.getAttendanceReportAndLabourOnboardingJoincontroller);
router.get('/searchLaboursFromWages', labourController.searchLaboursFromWages);
router.get('/searchLaboursFromVariableInput', labourController.searchLaboursFromVariableInput);
router.get('/searchAttendance', labourController.searchAttendance);
router.get('/searchLaboursFromSiteTransfer', labourController.searchLaboursFromSiteTransfer);
router.post('/admin/approveAttendanceController', labourController.approveAttendanceController);
router.post('/admin/rejectAttendanceControllerAdmin', labourController.rejectAttendanceControllerAdmin);
router.get('/checkExistingWages', labourController.checkExistingWagesController);
router.post('/sendWagesForApproval', labourController.markWagesForApprovalController);
router.put('/admin/approveWages', labourController.approveWagesControllerAdmin);
router.put('/admin/rejectWages', labourController.rejectWagesControllerAdmin);

router.get('/searchForAttendance', labourController.searchLaboursForAttendance);

router.get('/exportMonthlyWagesExcel', labourController.exportMonthlyWagesExcel);
router.get('/exportFixedWagesExcel', labourController.exportFixedWagesExcel);
 
router.get('/download-excel', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query('SELECT * FROM [dbo].[labourOnboarding]');
        const data = result.recordset;

        // Create a new workbook and a sheet
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('SSMS Data');

        // Add headers to the sheet
        worksheet.columns = Object.keys(data[0]).map(key => ({ header: key, key }));

        // Add data to the sheet
        data.forEach(row => {
            worksheet.addRow(row);
        });

        // Adjust column widths
        worksheet.columns.forEach(column => {
            let maxLength = 0;
            column.eachCell({ includeEmpty: true }, cell => {
                const cellValueLength = cell.value ? cell.value.toString().length : 0;
                maxLength = Math.max(maxLength, cellValueLength);
            });
            column.width = maxLength < 10 ? 10 : maxLength + 2; // Minimum width of 10, or length of content + 2
        });

        // Set the response headers for download
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=ssms_data.xlsx');

        // Send the workbook to the client
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error generating Excel file:', error);
        res.status(500).send('Error generating Excel file');
    }
});

// ------------------------------------------------------- IMP ROUTE AND GET USING VIEW DETAILS FOR LABOUR --------------------------------------------------


router.post('/laboursCreateRecord', upload.fields([
    { name: 'uploadAadhaarFront' },
    { name: 'uploadAadhaarBack' },
    { name: 'uploadIdProof' },
    { name: 'uploadInductionDoc' },
    { name: 'photoSrc' }
]), labourController.createRecord);

router.post('/:id/updateRecord', upload.fields([
    { name: 'uploadAadhaarFront' },
    { name: 'uploadAadhaarBack' },
    { name: 'uploadIdProof' },
    { name: 'uploadInductionDoc' },
    { name: 'photoSrc' }
]), labourController.createRecordUpdate);

// Define the route to update a labour record
router.put('/updatelabour/:id', upload.fields([
    { name: 'uploadAadhaarFront' },
    { name: 'uploadAadhaarBack' },
    { name: 'uploadIdProof' },
    { name: 'uploadInductionDoc' },
    { name: 'photoSrc' }
]), labourController.updateRecord);


router.put('/updatelabourDisableStatus/:id', upload.fields([
    { name: 'uploadAadhaarFront' },
    { name: 'uploadAadhaarBack' },
    { name: 'uploadIdProof' },
    { name: 'uploadInductionDoc' },
    { name: 'photoSrc' }
]), labourController.updateRecordWithDisable);



router.get('/:id/download/aadhaar-card', async (req, res) => {
    const { id } = req.params;
    const frontFilePath = path.join(__dirname, 'uploads', `aadhaar_front_${id}.jpg`);
    const backFilePath = path.join(__dirname, 'uploads', `aadhaar_back_${id}.jpg`);
    const idProofFilePath = path.join(__dirname, 'uploads', `id_Proof_${id}.jpg`);
    const inductionFilePath = path.join(__dirname, 'uploads', `induction_${id}.jpg`);  // Corrected filename typo

    // Initialize a JSZip instance
    const zip = new JSZip();
    let filesAdded = false;

    // Check and add files to the zip if they exist
    if (fs.existsSync(frontFilePath)) {
        const frontFile = fs.readFileSync(frontFilePath);
        zip.file(`aadhaar_front_${id}.jpg`, frontFile);
        filesAdded = true;
    }

    if (fs.existsSync(backFilePath)) {
        const backFile = fs.readFileSync(backFilePath);
        zip.file(`aadhaar_back_${id}.jpg`, backFile);
        filesAdded = true;
    }

    if (fs.existsSync(idProofFilePath)) {
        const idFile = fs.readFileSync(idProofFilePath);
        zip.file(`id_Proof_${id}.jpg`, idFile);
        filesAdded = true;
    }

    if (fs.existsSync(inductionFilePath)) {
        const inductionFile = fs.readFileSync(inductionFilePath);
        zip.file(`induction_${id}.jpg`, inductionFile);
        filesAdded = true;
    }

    // If any files were added to the zip, generate and send the zip file
    if (filesAdded) {
        res.set('Content-Type', 'application/zip');
        res.set('Content-Disposition', `attachment; filename="documents_${id}.zip"`);

        zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true })
            .pipe(res)
            .on('finish', () => {
                console.log(`Document zip for Labour ID ${id} has been generated and sent.`);
            });
    } else {
        res.status(404).send('No documents found for download.');
    }
});

router.get('/:id', labourController.getRecordById);
router.get('/:id/download/full-form', (req, res) => {
    const { id } = req.params;
    const filePath = path.join(__dirname, 'uploads', `full_form_${id}.pdf`);
    if (fs.existsSync(filePath)) {
        res.download(filePath, `full_form_${id}.pdf`);
    } else {
        res.status(404).send('File not found.');
    }
});


module.exports = router;