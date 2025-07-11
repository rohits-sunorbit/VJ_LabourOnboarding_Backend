
const express = require('express');
const { getProjectNames, getLabourCategories, getDepartments, getWorkingHours, getDesignations, getCompanyNamesByProjectId, getDevices, getAttendanceLogs, approveLabour, getProjectDeviceStatus, updateProjectDeviceStatus, deleteProjectDeviceStatus, getProjectDeviceStatusSS, fetchDynamicData, fetchOrgDynamicData, addFvEmpId, updateEmployeeMaster, saveApiResponsePayload, getLaboursWithOldAttendance, fetchCachedLabours, saveTransferData, getAllLaboursWithTransferDetails, employeeMasterPayloadUpdatepost, organizationMasterPayloadUpdatepost, siteTransferRequestforAdmin, approveSiteTransfer, rejectSiteTransfer, editSiteTransfer, getAdminSiteTransferApproval, getWagesforInsentiveAdd
    , getAdminCompanyTransferApproval, companyTransferRequestforAdmin, approveCompanyTransfer, rejectCompanyTransfer, editCompanyTransfer, getSuperAdminProjectNames, getLabourAttendanceCheck, addDevicesToProject, getDevicesByProject
} = require('../controllers/dataController');
const { addEmployee } = require("../controllers/sendLabourData")
const router = express.Router();

router.get('/project-names', getProjectNames);
router.get('/labour-categories', getLabourCategories);
router.get('/departments', getDepartments);
router.get('/working-hours', getWorkingHours);
router.get('/designations/:departmentId', getDesignations);
router.get('/company-names/:projectId', getCompanyNamesByProjectId);
router.get('/devices', getDevices);
router.get('/attendance-logs', getAttendanceLogs);
router.post('/AddEmployee', addEmployee);
router.post('/approveLabour', approveLabour);
router.get('/projectDeviceStatus/:projectName', getProjectDeviceStatus);
router.put('/projectDeviceStatus', updateProjectDeviceStatus);
router.delete('/projectDeviceStatus', deleteProjectDeviceStatus);
router.get('/projectDeviceStatus',(req, res, next)=>{console.log('/projectDeviceStatus'); next()}, getProjectDeviceStatusSS);
router.get('/fetchDynamicData', fetchDynamicData);
router.get('/fetchOrgDynamicData', fetchOrgDynamicData);
router.put('/addFvEmpId/:Id', addFvEmpId);
router.post('/updateEmployeeMaster', updateEmployeeMaster);
router.post('/saveApiResponsePayload', saveApiResponsePayload);
router.get('/laboursoldattendance', fetchCachedLabours);
router.post('/transfer', saveTransferData);
router.post('/allTransferSite', getAllLaboursWithTransferDetails);
// router.post('/resubmitattendancelabour', resubmitLabor);
router.get('/getAdminSiteTransferApproval', getAdminSiteTransferApproval);

router.post('/employeeMasterPayloadUpdatepost', employeeMasterPayloadUpdatepost);
router.post('/organizationMasterPayloadUpdatepost', organizationMasterPayloadUpdatepost);
router.post('/admin/sitetransfertoadmin', siteTransferRequestforAdmin);
router.put('/admin/approveSiteTransferadmin', approveSiteTransfer);
router.put('/admin/rejectSiteTransferadmin', rejectSiteTransfer);
router.put('/admin/editSiteTransferadmin', editSiteTransfer);
router.get('/getWagesforInsentiveAdd', getWagesforInsentiveAdd);

// ----------------------------------------------------- COMPANY TRANSFER API  -------------------

router.get('/getAdminCompanyTransferApproval', getAdminCompanyTransferApproval);
router.post('/admin/companytransfertoadmin', companyTransferRequestforAdmin);
router.put('/admin/approveCompanyTransferadmin', approveCompanyTransfer);
router.put('/admin/rejectCompanyTransferadmin', rejectCompanyTransfer);
router.put('/admin/editCompanyTransferadmin', editCompanyTransfer);


router.get('/admin/getSuperAdminProjectNames', getSuperAdminProjectNames);
router.get('/admin/attendance-check', getLabourAttendanceCheck);


router.post('/admin/attendance-checkToProject', addDevicesToProject);
router.get('/projectDeviceStatusgetDevicesByProject/:projectName', getDevicesByProject);


module.exports = router;


