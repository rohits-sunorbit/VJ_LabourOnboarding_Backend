const { sql, poolPromise2 } = require('../config/dbConfig2');
const { poolPromise3 } = require('../config/dbConfig3');
const { poolPromise } = require('../config/dbConfig');
const path = require('path');
const fs = require('fs');
const axios = require('axios')
const multer = require('multer');
const { upload } = require('../server');
const xml2js = require('xml2js');
const labourModel = require('../models/insentiveModel');
const cron = require('node-cron');
const logger = require('../logger'); // Assuming logger is defined in logger.js   
const { createLogger, format, transports } = require('winston');
const { isHoliday } = require('../models/labourModel');
const xlsx = require('xlsx');




async function getAllLabours(req, res) {
    try {
        const filters = req.query;
        const labours = await labourModel.getAllLabours(filters);
        res.json(labours);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function createRecord(req, res) {
    try {
        const {
            labourOwnership, name, aadhaarNumber, dateOfBirth, contactNumber, gender, dateOfJoining,
            address, pincode, taluka, district, village, state, emergencyContact, bankName, branch,
            accountNumber, ifscCode, projectName, labourCategory, department, workingHours,
            contractorName, contractorNumber, designation, title, Marital_Status, companyName, Induction_Date, Inducted_By, OnboardName, expiryDate, departmentId, designationId, labourCategoryId } = req.body;

        const finalOnboardName = Array.isArray(OnboardName) ? OnboardName[0] : OnboardName;

        const { uploadAadhaarFront, uploadAadhaarBack, photoSrc, uploadIdProof, uploadInductionDoc } = req.files;
        //console.log('Received IDs:', { departmentId, designationId, labourCategoryId });
        // Validate file fields
        if (!photoSrc || !uploadIdProof) {
            return res.status(400).json({ msg: 'All file fields are required' });
        }

        // const frontImageFilename = path.basename(uploadAadhaarFront[0].path);
        const frontImageFilename = uploadAadhaarFront ? path.basename(uploadAadhaarFront[0].path) : null;
        // const backImageFilename = path.basename(uploadAadhaarBack[0].path);
        const backImageFilename = uploadAadhaarBack ? path.basename(uploadAadhaarBack[0].path) : null;
        const IdProofImageFilename = path.basename(uploadIdProof[0].path);
        const uploadInductionDocFilename = path.basename(uploadInductionDoc[0].path);
        const photoSrcFilename = path.basename(photoSrc[0].path);

        // const frontImageUrl = baseUrl + frontImageFilename;
        const frontImageUrl = frontImageFilename ? baseUrl + frontImageFilename : null;
        // const backImageUrl = baseUrl + backImageFilename;
        const backImageUrl = backImageFilename ? baseUrl + backImageFilename : null;
        const IdProofImageUrl = baseUrl + IdProofImageFilename;
        const uploadInductionDocImageUrl = baseUrl + uploadInductionDocFilename;
        const photoSrcUrl = baseUrl + photoSrcFilename;

        const dateOfJoiningDate = new Date(dateOfJoining);
        const fromDate = dateOfJoiningDate;
        const period = dateOfJoiningDate.toLocaleString('default', { month: 'long', year: 'numeric' }).replace(' ', '-');

        const validTillDate = new Date(dateOfJoiningDate);
        validTillDate.setFullYear(validTillDate.getFullYear() + 1);

        const retirementDate = new Date(dateOfBirth);
        retirementDate.setFullYear(retirementDate.getFullYear() + 60);

        // **********************************  NEW  ********************
        const pool = await poolPromise2;
        const projectRequest = pool.request();

        const isNumeric = !isNaN(projectName);
        projectRequest.input('projectName', isNumeric ? sql.Int : sql.VarChar, projectName);

        let query;
        if (isNumeric) {
            query = `
        SELECT a.id, a.Description 
        FROM Framework.BusinessUnit a
        LEFT JOIN Framework.BusinessUnitSegment b ON b.Id = a.SegmentId
        WHERE a.id = @projectName
        AND (a.IsDiscontinueBU = 0 OR a.IsDiscontinueBU IS NULL)
        AND (a.IsDeleted = 0 OR a.IsDeleted IS NULL)
        AND b.Id = 3
    `;
        } else {
            query = `
        SELECT a.id, a.Description 
        FROM Framework.BusinessUnit a
        LEFT JOIN Framework.BusinessUnitSegment b ON b.Id = a.SegmentId
        WHERE a.Description = @projectName
        AND (a.IsDiscontinueBU = 0 OR a.IsDiscontinueBU IS NULL)
        AND (a.IsDeleted = 0 OR a.IsDeleted IS NULL)
        AND b.Id = 3
    `;
        }

        //console.log(`Querying for projectName: ${projectName}`); // Debug log

        const projectResult = await projectRequest.query(query);

        if (projectResult.recordset.length === 0) {
            // //console.log('Invalid project name:', projectName); 
            return res.status(400).json({ msg: 'Invalid project name' });
        }

        const location = projectResult.recordset[0].Description; // Store the Business_Unit name in location
        const businessUnit = projectResult.recordset[0].Description;
        //console.log(`Found project Description: ${location}, BusinessUnit: ${businessUnit}`);

        // **********************************  NEW  ********************

        let salaryBu;
        const projectId = projectResult.recordset[0].id;
        const parentIdResult = await pool.request().query(`
    SELECT ParentId 
    FROM Framework.BusinessUnit 
    WHERE (IsDiscontinueBU = 0 OR IsDiscontinueBU IS NULL)
    AND (IsDeleted = 0 OR IsDeleted IS NULL) 
    AND Id = ${projectId}
`);

        if (parentIdResult.recordset.length === 0) {
            return res.status(404).send('ParentId not found for the selected project');
        }

        const parentId = parentIdResult.recordset[0].ParentId;

        const companyNameResult = await pool.request().query(`
    SELECT Id, Description AS Company_Name 
    FROM Framework.BusinessUnit 
    WHERE (IsDiscontinueBU = 0 OR IsDiscontinueBU IS NULL)
    AND (IsDeleted = 0 OR IsDeleted IS NULL) 
    AND Id = ${parentId}
`);

        const companyNameFromDb = companyNameResult.recordset[0].Company_Name;

        if (companyNameFromDb === 'SANKALP CONTRACTS PRIVATE LIMITED') {
            salaryBu = `${companyNameFromDb} - HO`;
        } else {
            salaryBu = location;
        }


        // Fetch department description
        const departmentRequest = pool.request();
        departmentRequest.input('departmentId', sql.Int, departmentId);
        const departmentQuery = `
     SELECT a.Description AS Department_Name
     FROM Payroll.Department a
     WHERE a.Id = @departmentId
 `;
        const departmentResult = await departmentRequest.query(departmentQuery);

        if (departmentResult.recordset.length === 0) {
            return res.status(404).send('Department not found');
        }

        const departmentName = departmentResult.recordset[0].Department_Name;

        const creationDate = new Date();
        //console.log('Received OnboardName:', finalOnboardName);
        const data = await labourModel.registerData({
            labourOwnership, uploadAadhaarFront: frontImageUrl, uploadAadhaarBack: backImageUrl, uploadIdProof: IdProofImageUrl, uploadInductionDoc: uploadInductionDocImageUrl, name, aadhaarNumber,
            dateOfBirth, contactNumber, gender, dateOfJoining, Group_Join_Date: dateOfJoining, ConfirmDate: dateOfJoining, From_Date: fromDate.toISOString().split('T')[0], Period: period, address, pincode, taluka,
            district, village, state, emergencyContact, photoSrc: photoSrcUrl, bankName, branch,
            accountNumber, ifscCode, projectName, labourCategory, department, workingHours, location, SalaryBu: salaryBu, businessUnit,
            contractorName, contractorNumber, designation, title, Marital_Status, companyName, Induction_Date, Inducted_By, OnboardName: finalOnboardName, expiryDate, ValidTill: validTillDate.toISOString().split('T')[0],
            retirementDate: retirementDate.toISOString().split('T')[0], WorkingBu: location, CreationDate: creationDate.toISOString(), departmentId, departmentName, designationId, labourCategoryId
        });
        //console.log('Inserted OnboardName:', finalOnboardName);
        return res.status(201).json({ msg: "User created successfully", data: data });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Internal server error' });
    }
}


async function searchLaboursFromVariablePay(req, res) {
    const { q } = req.query;

    try {
        const results = await labourModel.searchFromVariablePay(q);
        return res.json(results);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

async function searchLaboursFromAttendanceApproval(req, res) {
    const { q } = req.query;

    try {
        const results = await labourModel.searchFromAttendanceApproval(q);
        return res.json(results);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

async function searchLaboursFromWagesApproval(req, res) {
    const { q } = req.query;

    try {
        const results = await labourModel.searchFromWagesApproval(q);
        return res.json(results);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

async function searchFromSiteTransferApproval(req, res) {
    const { q } = req.query;

    try {
        const results = await labourModel.searchFromSiteTransferApproval(q);
        return res.json(results);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

async function searchFromViewMonthlyPayroll(req, res) {
    const { q } = req.query;

    try {
        const results = await labourModel.searchFromViewMonthlyPayrolls(q);
        return res.json(results);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

const getVariablePayAndLabourOnboardingJoincontroller = async (req, res) => {
    try {
        const filters = req.query;
        const joinWagesLabour = await labourModel.getVariablePayAndLabourOnboardingJoin(filters);
        res.status(200).json(joinWagesLabour);
    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).json({ message: 'Error fetching data', error });
    }
};


const upsertLabourVariablePay = async (req, res) => {
    try {
        const payload = req.body;
console.log("payload variable Pay", payload)
        if (!payload.LabourID || !payload.payStructure) {
            return res.status(400).json({ message: 'Labour ID and Pay Structure are required' });
        }

        const existingVariablePays = await labourModel.checkExistingVariablePay(payload.LabourID) || [];
        // Check if a pending entry already exists for this payStructure
        const isPending = existingVariablePays.find(
            pay => pay.PayStructure === payload.payStructure && pay.ApprovalStatusPay === 'AdminPending'
        );

        if (isPending) {
            return res.status(400).json({
                message: `Labour ${payload.LabourID} already has a pending '${payload.payStructure}' entry for admin approval.`
            });
        }

        if (payload.payStructure === 'Incentive') {
            const wagesRecord = await labourModel.getLabourMonthlyWages(payload.LabourID);

            if (!wagesRecord) {
                return res.status(400).json({ message: 'Labour wages are not added' });
            }

            const allowedMonthlyWage = wagesRecord.FixedMonthlyWages || wagesRecord.MonthlyWages;

            if (payload.Incentive && payload.Incentive > allowedMonthlyWage) {
                return res.status(400).json({ message: 'Incentive cannot be greater than monthly wages' });
            }
        }

        await labourModel.upsertLabourVariablePay(payload);

        return res.status(200).json({ message: 'VariablePay updated successfully.' });

    } catch (error) {
        console.error('Error updating VariablePay:', error);
        return res.status(500).json({ message: 'Error updating VariablePay', error });
    }
};


// const upsertLabourVariablePay = async (req, res) => {
//     try {
//         const payload = req.body;
//         console.log("payload--->",payload)
//         // Check that LabourID and Pay Structure are provided
//         if (!payload.LabourID || !payload.payStructure) {
//             return res.status(400).json({ message: 'Labour ID and Pay Structure are required' });
//         }

//         // First, check if labour wages record exists
//         const existingvariablePay = await labourModel.checkExistingVariablePay(payload.LabourID);

//         if (existingvariablePay && existingvariablePay !== undefined && existingvariablePay !== null) {
//             if (existingvariablePay.ApprovalStatusPay === "AdminPending") {
//                 return res.status(400).json({ message: `Labour ${existingvariablePay.LabourID} Variable Pay Already With Admin Pending` });
//             }

//             // If an incentive is provided, perform the incentive check
//             if (payload.payStructure === 'Incentive') {
//                 const wagesRecord = await labourModel.getLabourMonthlyWages(payload.LabourID);
//                 if (!wagesRecord) {
//                     // This ensures that if no wages record exists in the LabourMonthlyWages table, 
//                     // we throw an error as well.
//                     return res.status(400).json({ message: 'Labour wages are not added' });
//                 }

//                 const allowedMonthlyWage = wagesRecord.FixedMonthlyWages || wagesRecord.MonthlyWages;
//                 if (payload.payStructure.Incentive > allowedMonthlyWage) {
//                     return res.status(400).json({ message: 'Incentive cannot be greater than monthly wages' });
//                 }
//             }

//             await labourModel.upsertLabourVariablePay(payload);
//             return res.status(200).json({ message: 'VariablePay updated successfully.' });
//         } else {
//             // If an incentive is provided, perform the incentive check
//             if (payload.payStructure === 'Incentive') {
//                 const wagesRecord = await labourModel.getLabourMonthlyWages(payload.LabourID);
//                 if (!wagesRecord) {
//                     // This ensures that if no wages record exists in the LabourMonthlyWages table, 
//                     // we throw an error as well.
//                     return res.status(400).json({ message: 'Labour wages are not added' });
//                 }

//                 const allowedMonthlyWage = wagesRecord.FixedMonthlyWages || wagesRecord.MonthlyWages;
//                 if (payload.payStructure.Incentive > allowedMonthlyWage) {
//                     return res.status(400).json({ message: 'Incentive cannot be greater than monthly wages' });
//                 }
//             }

//             await labourModel.upsertLabourVariablePay(payload);
//             return res.status(200).json({ message: 'VariablePay updated successfully.' });
//         }


//     } catch (error) {
//         console.error('Error updating VariablePay:', error);
//         res.status(500).json({ message: 'Error updating VariablePay', error });
//     }
// };




const checkExistingVariablePayController = async (req, res) => {
    try {
        const { LabourID } = req.query;
        if (!LabourID) {
            return res.status(400).json({ message: 'Labour ID is required' });
        }

        const existingWages = await labourModel.checkExistingVariablePay(LabourID);

        if (existingWages) {
            res.status(200).json({
                exists: true,
                approved: existingWages.ApprovalStatusPay === 'Approved',
                data: existingWages,
            });
        } else {
            res.status(200).json({ exists: false });
        }
    } catch (error) {
        console.error('Error checking existing wages:', error);
        res.status(500).json({ message: 'Error checking existing wages', error });
    }
};


const markVariablePayForApprovalController = async (req, res) => {
    try {
        const payload = req.body;
        const { payId, LabourID, payAddedBy, variablePay, variablePayRemark, payStructure, effectiveDate, userId, name } = payload;
        //console.log('payload variablePay',payload)
        if (!LabourID || !payStructure) {
            return res.status(400).json({ message: 'Labour ID, and Pay Structure are required' });
        }

        const result = await labourModel.markVariablePayForApproval(
            payId,
            LabourID,
            payAddedBy,
            variablePay,
            variablePayRemark,
            payStructure,
            effectiveDate,
            userId,
            name
        );

        return res.status(200).json(result);
    } catch (error) {
        console.error('Error marking wages for approval:', error.message || error);
        return res.status(500).json({ message: 'Error marking wages for approval', error: error.message || error });
    }
};


async function approveVariablePayAdmin(req, res) {
    const { VariablePayId } = req.query;
    if (!VariablePayId) {
        return res.status(400).json({ message: 'VariablePayId is required.' });
    }
    try {
        const result = await labourModel.approvalAdminVariablePay(VariablePayId);
        res.status(200).json(result);
    } catch (error) {
        console.error('Error in approving VariablePay:', error);
        res.status(error.statusCode || 500).json({ message: error.message });
    }
};

async function rejectVariablePayAdmin(req, res) {
    const { VariablePayId, Remarks } = req.body;
    //console.log('VariablePayId, Remarks', req.body)
    if (!VariablePayId) {
        return res.status(400).json({ message: 'VariablePayId is required.' });
    }
    try {
        const result = await labourModel.rejectAdminVariablePay(VariablePayId, Remarks);
        res.status(200).json(result);
    } catch (error) {
        console.error('Error in rejecting VariablePay:', error);
        res.status(error.statusCode || 500).json({ message: error.message });
    }
};

const getVariablePayAdminApprovals = async (req, res) => {
    try {
        const approvals = await labourModel.getVariablePayAdminApproval();
        res.status(200).json(approvals);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching approvals', error });
    }
};


const exportVariablePayexcelSheetWithBU = async (req, res) => {
    try {
        const { projectName, startDate, approvalStatus } = req.query;
        if (!startDate) {
            return res.status(400).json({ message: 'Missing required parameter: startDate' });
        }

        // Parse the 'startDate' parameter
        const startDateObj = new Date(startDate);
        if (isNaN(startDateObj)) {
            return res.status(400).json({ message: 'Invalid startDate format.' });
        }

        // Calculate endDate as one month after startDate minus one day
        const endDateObj = new Date(startDateObj);
        endDateObj.setMonth(endDateObj.getMonth() + 1);
        endDateObj.setDate(endDateObj.getDate() - 1);
        const endDate = endDateObj.toISOString().split('T')[0];

        // Extract month and year for file naming
        const month = startDateObj.toLocaleString('default', { month: 'long', year: 'numeric' });

        // Fetch wages data from the model
        const wagesData = await labourModel.getVariablePayByDateRange(
            projectName,
            startDateObj.toISOString().split('T')[0],
            endDate,
            approvalStatus
        );

        // Handle the case where no data is found
        if (wagesData.length === 0) {
            return res.status(404).json({ message: 'No data found for the selected Business Unit' });
        }

        // Process data: Exclude 'projectName', add 'ExportDate'
        const processedData = wagesData.map(record => {
            const { projectName, ...rest } = record; // Exclude 'projectName'
            return {
                ...rest,
                ExportDate: startDate // Add 'ExportDate' column
            };
        });

        // Create Excel workbook and worksheet
        const workbook = xlsx.utils.book_new();
        const worksheet = xlsx.utils.json_to_sheet(processedData, { header: Object.keys(processedData[0]) });

        // Append the worksheet to the workbook
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Labour Wages');

        // Generate Excel file as buffer
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        // Define a generic file name
        const fileName = `VariablePay_${month}.xlsx`;

        // Set response headers to prompt file download
        res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
        res.setHeader('Content-Type', `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`);

        res.send(buffer);
    } catch (error) {
        console.error('Error exporting Variable Pay:', error);
        res.status(500).json({ message: 'Error exporting Variable Pay data.' });
    }
};


const exportVariablePayexcelSheet = async (req, res) => {
    try {
        // Define the headers for the Excel sheet
        const headers = [
            'LabourID',
            'PayStructure',
            'VariablePayAmount',
            'VariablePayRemark',
            'EffectiveDate',
            'ExportDate'
        ];

        // Get current date in YYYY-MM-DD format
        const currentDate = new Date().toISOString().split('T')[0];

        // Create Excel workbook and worksheet with only headers
        const workbook = xlsx.utils.book_new();
        const worksheetData = [headers];
        const worksheet = xlsx.utils.aoa_to_sheet(worksheetData);

        // Append the worksheet to the workbook
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Variable Pay');

        // Generate Excel file as buffer
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        // Define the file name with current date
        const fileName = `VariablePay_${currentDate}.xlsx`;

        // Set response headers to prompt file download
        res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        // Send the Excel file buffer as the response
        res.send(buffer);
    } catch (error) {
        console.error('Error exporting Variable Pay:', error);
        res.status(500).json({ message: 'Error exporting Variable Pay data.' });
    }
};



// Utility function to convert Excel serial date to JavaScript Date
const xlsxDateToJSDate = (serial) => {
    // Handle Excel serial date (assuming it's a number)
    if (typeof serial === 'number') {
        const utc_days = Math.floor(serial - 25569);
        const utc_value = utc_days * 86400;
        const date_info = new Date(utc_value * 1000);

        const fractional_day = serial - Math.floor(serial) + 0.0000001;

        let total_seconds = Math.floor(86400 * fractional_day);

        const seconds = total_seconds % 60;
        total_seconds = Math.floor(total_seconds / 60);

        const minutes = total_seconds % 60;
        const hours = Math.floor(total_seconds / 60);

        date_info.setUTCHours(hours);
        date_info.setUTCMinutes(minutes);
        date_info.setUTCSeconds(seconds);

        return date_info;
    } else if (typeof serial === 'string') {
        return new Date(serial);
    } else {
        return null;
    }
};

const importVariablePay = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const wagesEditedBy = req.body.wagesEditedBy || 'System';
        const filePath = req.file.path;

        // Read the Excel file
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });

        const errors = [];
        let successCount = 0; // To track successful insertions

        for (const [index, row] of rows.entries()) {
            try {
                // Trim and normalize string fields
                for (let key in row) {
                    if (typeof row[key] === 'string') {
                        row[key] = row[key].trim();
                    }
                }

                // Normalize PayStructure casing (e.g., capitalize first letter)
                if (row.PayStructure && typeof row.PayStructure === 'string') {
                    row.PayStructure = row.PayStructure.charAt(0).toUpperCase() + row.PayStructure.slice(1).toLowerCase();
                }

                // // Convert Excel date to JavaScript date if From_Date is defined
                // if (row.From_Date) {
                //     row.From_Date = xlsxDateToJSDate(row.From_Date);
                // }

                // Assign the editor
                row.WagesEditedBy = wagesEditedBy;

                // Log the PayStructure value after normalization
                //console.log(`Row ${index + 2}: PayStructure = "${row.PayStructure}"`);

                // Insert the row into the database
                await labourModel.insertVariablePayData(row);
                successCount++;
            } catch (error) {
                // Log error details
                console.error(`Error processing row ${index + 2}:`, error.message);
                errors.push({
                    LabourID: row.LabourID || '',
                    PayStructure: row.PayStructure || '',
                    VariablePayAmount: row.VariablePayAmount || '',
                    WagesEditedBy: row.payAddedBy || '',
                    Error: error.message,
                    RowNumber: index + 2 // Assuming header is at row 1
                });
            }
        }

        // Clean up uploaded file
        fs.unlinkSync(filePath);

        if (errors.length > 0) {
            // Generate error Excel file
            const errorWorkbook = xlsx.utils.book_new();
            const errorSheet = xlsx.utils.json_to_sheet(errors);
            xlsx.utils.book_append_sheet(errorWorkbook, errorSheet, 'Errors');
            const buffer = xlsx.write(errorWorkbook, { type: 'buffer', bookType: 'xlsx' });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename="Error_Rows.xlsx"');
            return res.status(200).send(buffer); // Return Excel file for errors
        }

        res.status(200).json({ message: 'Data imported successfully!', successCount });
    } catch (error) {
        console.error('Import error:', error);
        res.status(500).json({ message: 'Internal server error. Please try again.' });
    }
};


// ----------------------------------------------------------    SALARY GENERATION PROCESS START 27-01-25   -----------------------------------------------------
// ----------------------------------------------------------    SALARY GENERATION PROCESS START 27-01-25   -----------------------------------------------------


/**
 * Generate payroll for all eligible labours in a given month/year.
 */
async function generateMonthlyPayroll(req, res) {
    try {
        const { month, year } = req.body; // or req.query; adjust as needed

        if (!month || !year) {
            return res.status(400).json({
                message: "Month and Year are required to generate payroll."
            });
        }
        const salaries = await labourModel.generateMonthlyPayroll(month, year);
        return res.status(200).json({
            message: "Payroll generated successfully.",
            data: salaries
        });
    } catch (error) {
        console.error("Error generating monthly payroll:", error);
        return res.status(500).json({
            message: "Error generating monthly payroll.",
            error: error.message
        });
    }
};

/**
 * (Optional) Generate payroll for a single labour.
 */
async function generateMonthlyPayrollForSingleLabour(req, res) {
    try {
        const { labourId } = req.params;
        const { month, year } = req.body;

        if (!labourId || !month || !year) {
            return res.status(400).json({
                message: "LabourID, Month, and Year are required."
            });
        }

        const result = await labourModel.calculateSalaryForLabour(labourId, month, year);
        if (!result) {
            return res.status(404).json({
                message: "Could not generate salary. Labour might not have wages or valid attendance."
            });
        }

        return res.status(200).json({
            message: "Payroll generated successfully for single labour.",
            data: result
        });
    } catch (error) {
        console.error("Error generating payroll for single labour:", error);
        return res.status(500).json({
            message: "Error generating payroll for single labour.",
            error: error.message
        });
    }
};


// ----------------------------------------------------------     FOR FRONTEND API'S =--------------


/**
 * 1) Get all labour IDs eligible for payroll
 */
async function getEligibleLaboursAPI(req, res) {
    try {
        const { month, year } = req.query;
        if (!month || !year) {
            return res.status(400).json({ message: 'month and year are required.' });
        }

        const labourIds = await labourModel.getEligibleLabours(parseInt(month), parseInt(year));
        return res.status(200).json({ labourIds });
    } catch (error) {
        console.error('Error fetching eligible labours:', error);
        return res.status(500).json({ message: 'Error fetching eligible labours.', error: error.message });
    }
}

/**
 * 2) Get attendance summary for a single labour
 */
async function getAttendanceSummaryAPI(req, res) {
    try {
        const { labourId } = req.params;
        const { month, year } = req.query;
        if (!labourId || !month || !year) {
            return res.status(400).json({ message: 'labourId, month, and year are required.' });
        }

        const attendance = await labourModel.getAttendanceSummaryForLabour(labourId, parseInt(month), parseInt(year));
        return res.status(200).json(attendance);
    } catch (error) {
        console.error('Error fetching attendance summary:', error);
        return res.status(500).json({ message: 'Error fetching attendance summary.', error: error.message });
    }
}

/**
 * 3) Get wage info for a single labour
 */
async function getWageInfoAPI(req, res) {
    try {
        const { labourId } = req.params;
        const { month, year } = req.query;
        if (!labourId || !month || !year) {
            return res.status(400).json({ message: 'labourId, month, and year are required.' });
        }

        const wageInfo = await labourModel.getWageInfoForLabour(labourId, parseInt(month), parseInt(year));
        if (!wageInfo) {
            return res.status(404).json({ message: 'No approved wage record found for this labour and month/year.' });
        }

        return res.status(200).json(wageInfo);
    } catch (error) {
        console.error('Error fetching wage info:', error);
        return res.status(500).json({ message: 'Error fetching wage info.', error: error.message });
    }
}

/**
 * 4) Get variable pay for a single labour
 */
async function getVariablePayAPI(req, res) {
    try {
        const { labourId } = req.params;
        const { month, year } = req.query;
        if (!labourId || !month || !year) {
            return res.status(400).json({ message: 'labourId, month, and year are required.' });
        }

        const varPay = await labourModel.getVariablePayForLabour(labourId, parseInt(month), parseInt(year));
        return res.status(200).json(varPay);
    } catch (error) {
        console.error('Error fetching variable pay:', error);
        return res.status(500).json({ message: 'Error fetching variable pay.', error: error.message });
    }
}

/**
 * 5) Calculate salary for a single labour (but do not insert)
 */
async function calculateSingleLabourAPI(req, res) {
    try {
        const { labourId } = req.params;
        const { month, year } = req.query;
        if (!labourId || !month || !year) {
            return res.status(400).json({ message: 'labourId, month, and year are required.' });
        }

        const salaryDetail = await labourModel.calculateSalaryForLabour(labourId, parseInt(month), parseInt(year));
        if (!salaryDetail) {
            return res.status(404).json({ message: 'No salary data found (missing wage record or attendance?).' });
        }
        return res.status(200).json(salaryDetail);
    } catch (error) {
        console.error('Error calculating single labour salary:', error);
        return res.status(500).json({ message: 'Error calculating single labour salary.', error: error.message });
    }
}

/**
 * 6) Generate payroll for all eligible labours in a given month/year (INSERT records)
 */
async function generateMonthlyPayrollAPI(req, res) {
    try {
        const { month, year } = req.body;
        if (!month || !year) {
            return res.status(400).json({ message: 'month and year are required.' });
        }

        // This calls the logic that loops over all labour IDs, calculates salary, and inserts.
        const results = await labourModel.generateMonthlyPayroll(parseInt(month), parseInt(year));

        return res.status(200).json({
            message: 'Payroll generated successfully.',
            data: results
        });
    } catch (error) {
        console.error('Error generating monthly payroll:', error);
        return res.status(500).json({ message: 'Error generating monthly payroll.', error: error.message });
    }
}

/**
 * 7) (Optional) Fetch final salaries from [MonthlySalaryGeneration]
 */
async function getMonthlySalariesAPI(req, res) {
    try {
        const { month, year } = req.query;
        if (!month || !year) {
            return res.status(400).json({ message: 'month and year are required.' });
        }

        const pool = await poolPromise; // or use your model
        const result = await pool.request()
            .input('month', sql.Int, parseInt(month))
            .input('year', sql.Int, parseInt(year))
            .query(`
                SELECT *
                FROM [dbo].[MonthlySalaryGeneration]
                WHERE SalaryMonth = @month
                  AND SalaryYear = @year
            `);

        return res.status(200).json(result.recordset);
    } catch (error) {
        console.error('Error fetching monthly salaries:', error);
        return res.status(500).json({ message: 'Error fetching monthly salaries.', error: error.message });
    }
}


/**
 * 8) Get Overtime for a single labour
 */
async function getOvertimeMonthlyAPI(req, res) {
    try {
        const { labourId } = req.params;
        const { month, year } = req.query;

        // Validate required inputs
        if (!labourId || !month || !year) {
            return res.status(400).json({ message: 'labourId, month, and year are required.' });
        }

        const TotalOvertime = await labourModel.calculateTotalOvertime(
            labourId,
            parseInt(month),
            parseInt(year)
        );

        return res.status(200).json({ totalOvertime: TotalOvertime }); // Properly format response
    } catch (error) {
        console.error('Error fetching Overtime:', error);
        return res.status(500).json({ message: 'Error fetching Overtime.', error: error.message });
    }
};


/**
 * Fetch salary generation data for all eligible labours
 */


/**
 * Fetch salary generation data for all eligible labours
 */

const CONCURRENCY = 3;  // adjust to SQL capacity
const MAX_RETRIES = 3;

/* ─────────────────────────────────────────────────────────────── */
/*  GET /insentive/payroll/salaryGenerationDataAllLabours          */
/* ─────────────────────────────────────────────────────────────── */
async function getSalaryGenerationDataAPIAllLabours(req, res) {
  try {
    const pLimit = (await import('p-limit')).default;
    /* ---------- validation ---------- */
    const month = +req.query.month;
    const year  = +req.query.year;
    const projectIds = req.query.projectId
  ? req.query.projectId.split(',').map(id => parseInt(id.trim()))
  : undefined;

    if (!month || !year)
      return res.status(400).json({ message: 'Month and year are required.' });

    const idsArray = req.query.labourIds
      ? req.query.labourIds.split(',').map((id) => id.trim())
      : undefined;

    /* ---------- data to process ---------- */
    const eligible = await labourModel.getEligibleLabours(month, year, projectIds, idsArray);
    if (!eligible.length) return res.json([]); // nothing to do

    /* ---------- split into TWO roughly equal chunks ---------- */
    const mid  = Math.ceil(eligible.length / 3);
    const jobs = [eligible.slice(0, mid), eligible.slice(mid)];

    /* keep the HTTP socket alive for a long job */
    res.setTimeout(0);

    /* ---------- run both phases serially ---------- */
    const combinedRows = [];
    for (let phase = 0; phase < jobs.length; phase++) {
      const chunk   = jobs[phase];
      const limiter = pLimit(CONCURRENCY);

      /* process this chunk with controlled parallelism */
      const rows = await Promise.all(
        chunk.map((lab) =>
          limiter(() => _withRetry(lab, month, year)),
        ),
      );

      combinedRows.push(...rows.filter(Boolean)); // drop nulls
      console.log(`Phase ${phase + 1}/${jobs.length} done → ${combinedRows.length} rows`);
    }

    return res.json(combinedRows);
  } catch (err) {
    console.error('Error fetching salary generation data:', err);
    res.status(500).json({
      message: 'Error fetching salary generation data.',
      error  : err.message,
    });
  }
}

/* ───── helper: per-labour retry wrapper ───── */
async function _withRetry(labour, month, year) {
  const { labourId } = labour;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await labourModel.calculateSalaryForLabour(labourId, month, year);
      if (result && !result.message) {
        return { ...labour, month, year, ...result };
      }
      console.warn(`Attempt ${attempt}: no data for labour ${labourId}`);
    } catch (err) {
      console.error(`Attempt ${attempt} failed for ${labourId}:`, err.message);
    }
  }
  console.warn(`Giving up on labour ${labourId}`);
  return null;
}


/**
 * Fetch salary generation data for all eligible labours
 */
// const CONCURRENCY   = 5;  // tweak to match SQL-Server capacity
// const MAX_RETRIES   = 2;

// async function getSalaryGenerationDataAPIAllLabours(req, res) {
//  try {
//     const { month, year, labourIds } = req.query;
//           const pLimit = (await import('p-limit')).default;

//     // ────────────────────────── validation ──────────────────────────
//     if (!month || !year) {
//       return res.status(400).json({ message: 'Month and year are required.' });
//     }
//     const monthNum = Number(month);
//     const yearNum  = Number(year);
//     if (Number.isNaN(monthNum) || Number.isNaN(yearNum)) {
//       return res.status(400).json({ message: 'Month and year must be numbers.' });
//     }

//     // ────────────────────────── inputs ──────────────────────────────
//     const idsArray =
//       labourIds && labourIds.length
//         ? labourIds.split(',').map((id) => id.trim())
//         : undefined;

//     const eligibleLabours = await labourModel.getEligibleLabours(
//       monthNum,
//       yearNum,
//       idsArray
//     );

//     // ────────────────────────── controlled parallelism ──────────────
//     const limiter = pLimit(CONCURRENCY);

//     const rows = await Promise.all(
//       eligibleLabours.map((labour) =>
//         limiter(async () => {
//           const { labourId } = labour;

//           let salaryDetails = null;

//           for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
//             try {
//               const result = await labourModel.calculateSalaryForLabour(
//                 labourId,
//                 monthNum,
//                 yearNum
//               );

//               // handle “no data” sentinel (your model returns { message } on miss)
//               if (result && !result.message) {
//                 salaryDetails = result;
//                 break; // success!
//               }
//               console.warn(
//                 `Attempt ${attempt} → no data for labour ${labourId}.`
//               );
//             } catch (err) {
//               console.error(
//                 `Attempt ${attempt} errored for labour ${labourId}:`,
//                 err.message
//               );
//             }
//           }

//           if (!salaryDetails) {
//             console.warn(
//               `Giving up on labour ${labourId} after ${MAX_RETRIES} attempts.`
//             );
//             return null; // filtered out later
//           }

//           return {
//             ...labour,
//             month: monthNum,
//             year : yearNum,
//             ...salaryDetails,
//           };
//         })
//       )
//     );

//     const successfulRows = rows.filter(Boolean); // drop nulls
//     return res.status(200).json(successfulRows);
//   } catch (error) {
//     console.error('Error fetching salary generation data:', error);
//     return res
//       .status(500)
//       .json({ message: 'Error fetching salary generation data.', error: error.message });
//   }
// };




async function saveFinalizePayrollData(req, res) {
    try {
        const salaryData = req.body;  // Expecting an array of salary data objects
        if (!Array.isArray(salaryData) || salaryData.length === 0) {
            return res.status(400).json({ message: "Invalid salary data provided." });
        }
        const results = await labourModel.saveFinalizeSalaryData(salaryData);
        res.status(201).json({ message: "Salary data saved successfully!", results });
    } catch (error) {
        console.error('Error saving salary data:', error);
        res.status(500).json({ message: 'Failed to save salary data.', error: error.message });
    }
}



async function getSalaryGenerationDataAPI(req, res) {
    try {
        const { month, year } = req.query;

        if (!month || !year) {
            return res.status(400).json({ message: 'Month and year are required.' });
        }

        // Fetch eligible labours
        const eligibleLabours = await labourModel.getEligibleLabours(parseInt(month), parseInt(year));

        const salaryData = await Promise.all(
            eligibleLabours.map(async (labour) => {
                const labourId = labour.labourId;

                // Fetch attendance summary
                const attendance = await labourModel.getAttendanceSummaryForLabour(labourId, parseInt(month), parseInt(year));
                const wages = await labourModel.getWageInfoForLabour(labourId, parseInt(month), parseInt(year));
                const variablePay = await labourModel.getVariablePayForLabour(labourId, parseInt(month), parseInt(year));
                const totalOvertime = await labourModel.calculateTotalOvertime(labourId, parseInt(month), parseInt(year));

                return {
                    labourId,
                    name: labour.name,
                    project: labour.businessUnit,
                    department: labour.departmentName,
                    attendance: {
                        presentDays: attendance.presentDays,
                        halfDays: attendance.halfDays,
                        absentDays: attendance.absentDays,
                        missPunchDays: attendance.missPunchDays,
                    },
                    wages,
                    variablePay,
                    totalOvertime,
                };
            })
        );

        return res.status(200).json(salaryData);
    } catch (error) {
        console.error('Error fetching salary generation data:', error);
        return res.status(500).json({ message: 'Error fetching salary generation data.', error: error.message });
    }
};


async function deletePayrollController(req, res) {
    try {
        // 📝 You can decide how to pass parameters:
        // Option A: via query params: req.query.month, req.query.year, etc.
        // Option B: via body: req.body.month, req.body.year, etc.
        // Option C: via URL params: req.params.month, req.params.year, etc.

        // Example: We'll assume the user passes them in the request body
        const { month, year, labourIds } = req.body;

        // Simple validation
        if (!month || !year) {
            return res.status(400).json({
                success: false,
                message: 'month and year are required.'
            });
        }

        // labourIds is optional; default to []
        const ids = labourIds && Array.isArray(labourIds) ? labourIds : [];

        // Call model function
        const result = await labourModel.deleteMonthlyPayrollData(month, year, ids);

        return res.status(200).json({
            success: true,
            data: result,
            deletedRecords: result.rowsAffected,
        });
    } catch (error) {
        console.error('❌ Controller error - deletePayrollController:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error while deleting payroll data.',
            error: error.message
        });
    }
}


async function getFinalizedSalaryData(req, res) {
    try {
        const { month, year } = req.query;

        // Input validation
        if (!month || isNaN(parseInt(month))) {
            return res.status(400).json({ message: "Invalid or missing month provided." });
        }
        if (!year || isNaN(parseInt(year))) {
            return res.status(400).json({ message: "Invalid or missing year provided." });
        }

        const salaries = await labourModel.getFinalizedSalaryData(month, year);

        // Check if data is found
        if (salaries.length === 0) {
            return res.status(404).json({ message: "No salary records found for the given month and year.", data: [] });
        }

        return res.status(200).json({
            message: "Salary data fetched successfully.",
            count: salaries.length,
            data: salaries
        });

    } catch (error) {
        console.error("Error in getFinalizedSalaryData Controller:", error);
        return res.status(500).json({
            message: "Error fetching salary data.",
            error: error.message
        });
    }
}


async function getFinalizedSalaryDataByLabourID(req, res) {
    try {
        const { labourId, month, year } = req.query;

        // Input validation
        if (month && isNaN(parseInt(month))) {
            return res.status(400).json({ message: "Invalid month provided." });
        }
        if (year && isNaN(parseInt(year))) {
            return res.status(400).json({ message: "Invalid year provided." });
        }

        const salaries = await labourModel.getFinalizedSalaryDataByLabourID({ labourId, month, year });

        // Check if data is found
        if (salaries.length === 0) {
            return res.status(404).json({ message: "No salary records found.", data: [] });
        }

        return res.status(200).json({
            message: "Salary data fetched successfully.",
            count: salaries.length,
            data: salaries
        });

    } catch (error) {
        console.error("Error in getFinalizedSalaryData Controller:", error);
        return res.status(500).json({
            message: "Error fetching salary data.",
            error: error.message
        });
    }
}


async function exportMonthlyPayrollExcel(req, res) {
    try {
        const { month, year, projectName } = req.query;

        if (!month || !year) {
            return res.status(400).json({ message: "Month and Year are required for exporting data." });
        }

        // Fetch payroll data from model
        const payrollData = await labourModel.getMonthlyPayrollData(month, year, projectName);

        if (!payrollData || payrollData.length === 0) {
            return res.status(404).json({ message: "No payroll data found for the given month and year." });
        }

        // Define Excel headers
        const headers = [
            'LabourID', 'Name', 'Business Unit', 'Department Name',
            'Wage Type', 'Daily Wage Rate', 'Fixed Monthly Wage', 'Present Days', 'Absent Days', 'Half Days',
            'Basic Salary', 'Overtime Pay', 'Weekly Off Pay', 'Total Deductions', 'Gross Pay', 'Net Pay',
            'Advance', 'Advance Remarks', 'Debit', 'Debit Remarks', 'Incentive', 'Incentive Remarks', 'Month', 'Year'
        ];

        // Map Data for Excel
        const excelData = payrollData.map(item => [
            item.LabourID, item.name, item.businessUnit, item.departmentName,
            item.wageType, item.dailyWageRate, item.fixedMonthlyWage, item.presentDays, item.absentDays, item.halfDays,
            item.basicSalary, item.overtimePay, item.weeklyOffPay, item.totalDeductions, item.grossPay, item.netPay,
            item.advance, item.advanceRemarks, item.debit, item.debitRemarks, item.incentive, item.incentiveRemarks, item.month, item.year
        ]);

        // Create Excel Workbook
        const workbook = xlsx.utils.book_new();
        const worksheetData = [headers, ...excelData];
        const worksheet = xlsx.utils.aoa_to_sheet(worksheetData);
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Monthly Payroll');

        // Generate Excel file buffer
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        // Define file name
        const fileName = `MonthlyPayroll_${month}_${year}.xlsx`;

        // Send response with Excel file
        res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);

    } catch (error) {
        console.error("Error exporting Monthly Payroll:", error);
        res.status(500).json({ message: "Error exporting Monthly Payroll data." });
    }
};

const exportWagesexcelSheet = async (req, res) => {
    try {
        let { projectName, payStructure, approvalStatus } = req.query;

        // Use "all" if projectName is missing or empty.
        if (!projectName || projectName.trim() === "") {
            projectName = "all";
        }

        //   console.log(`Fetching wages for projectName: ${projectName}, payStructure: ${payStructure}, startDate: ${startDate}, endDate: ${endDate}`);

        // Fetch wages data (or approved onboarding rows if no matching wages).
        const wagesData = await labourModel.getWagesByDateRange(projectName, payStructure, approvalStatus );
        if (!wagesData || wagesData.length === 0) {
            return res.status(404).json({ message: 'No data found for the selected criteria.' });
        }
        // Create the Excel workbook.
        const workbook = xlsx.utils.book_new();
        const worksheet = xlsx.utils.json_to_sheet(wagesData);
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Labour Wages');

        // Set the file name.
        const fileName = projectName === "all"
            ? `Approved_Labours.xlsx`
            : `Wages.xlsx`;

        // Use res.attachment to set the header only once.
        res.attachment(fileName);
        res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
    } catch (error) {
        console.error('Error exporting Wages:', error);
        res.status(500).json({ message: 'Error exporting Wages data.' });
    }
};

// Optionally preset payStructure for dedicated endpoints.
const exportMonthlyWagesExcel = async (req, res) => {
    req.query.payStructure = 'Monthly Wages';
    exportWagesexcelSheet(req, res);
};

const exportFixedWagesExcel = async (req, res) => {
    req.query.payStructure = 'Fix Monthly Wages';
    exportWagesexcelSheet(req, res);
};


async function getAllLabours(req, res) {
    try {
        const filters = req.query;
        const labours = await labourModel.getAllLabours(filters);
        res.json(labours);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}


const getMatchedLabourIdsWithValidPunch = async () => {
  try {
    const pool1 = await poolPromise;
    const pool2 = await poolPromise3;

    // Step 1: Get LabourIds with NULL FirstPunch in last 10 days
    const result1 = await pool1.request().query(`
      SELECT DISTINCT LabourId
      FROM [LabourOnboardingForm].[dbo].[LabourAttendanceDetails]
      WHERE FirstPunch IS NULL
        AND [Date] BETWEEN DATEADD(DAY, -17, CAST(GETDATE() AS DATE)) 
                        AND DATEADD(DAY, -3, CAST(GETDATE() AS DATE))
    `);

    const nullFirstPunchIds = result1.recordset.map(row => row.LabourId);
    if (nullFirstPunchIds.length === 0) return [];

    // Step 2: Check which of these have logs in current month in LabourAttendanceLogs
    const matchedIdString = nullFirstPunchIds.map(id => `'${id}'`).join(',');
    const result2 = await pool1.request().query(`
      SELECT DISTINCT LabourId
      FROM [LabourOnboardingForm].[dbo].[LabourAttendanceLogs]
      WHERE LabourId IN (${matchedIdString})
        AND MONTH(CreatedAt) = MONTH(GETDATE())
        AND YEAR(CreatedAt) = YEAR(GETDATE())
    `);

    const labourIdsWithLogs = result2.recordset.map(row => row.LabourId);
    if (labourIdsWithLogs.length === 0) return [];

    // Step 3: Check which of these LabourIds have valid punch in Attendance table
    const labourIdsWithLogsString = labourIdsWithLogs.map(id => `'${id}'`).join(',');
    const result3 = await pool2.request().query(`
      SELECT DISTINCT user_id
      FROM [etimetracklite11.8].[dbo].[Attendance]
      WHERE punch_time IS NOT NULL
        AND punch_date BETWEEN DATEADD(DAY, -17, CAST(GETDATE() AS DATE)) 
                           AND DATEADD(DAY, -3, CAST(GETDATE() AS DATE))
        AND user_id IN (${labourIdsWithLogsString})
        AND (
          user_id LIKE 'JC%' 
          OR user_id LIKE 'JIH%'
        );
    `);

    const finalMatchedIds = result3.recordset.map(row => row.user_id);

    console.log("Final Matched IDs (FirstPunch NULL + Logs This Month + Valid Punch):", finalMatchedIds);
    return finalMatchedIds;

  } catch (err) {
    console.error("Error in getMatchedLabourIdsWithValidPunch:", err);
    throw err;
  }
};


// const getMatchedLabourIdsWithValidPunch = async () => {
//   try {
//     const pool1 = await poolPromise;
//     const pool2 = await poolPromise3;

//     // Step 1: Get LabourId + Date where FirstPunch IS NULL
//     const result1 = await pool1.request().query(`
//       SELECT LabourId, CONVERT(VARCHAR, [Date], 23) AS PunchDate
//       FROM [LabourOnboardingForm].[dbo].[LabourAttendanceDetails]
//       WHERE FirstPunch IS NULL
//         AND [Date] BETWEEN DATEADD(DAY, -30, CAST(GETDATE() AS DATE)) 
//                         AND DATEADD(DAY, -2, CAST(GETDATE() AS DATE))
//     `);

//     const nullFirstPunchRows = result1.recordset;
//     if (nullFirstPunchRows.length === 0) return [];

//     const nullFirstPunchIds = [...new Set(nullFirstPunchRows.map(row => row.LabourId))];

//     // Step 2: Filter LabourIds with logs in current month in LabourAttendanceLogs
//     const matchedIdString = nullFirstPunchIds.map(id => `'${id}'`).join(',');
//     const result2 = await pool1.request().query(`
//       SELECT DISTINCT LabourId
//       FROM [LabourOnboardingForm].[dbo].[LabourAttendanceLogs]
//       WHERE LabourId IN (${matchedIdString})
//         AND MONTH(CreatedAt) = MONTH(GETDATE())
//         AND YEAR(CreatedAt) = YEAR(GETDATE())
//     `);

//     const labourIdsWithLogs = result2.recordset.map(row => row.LabourId);
//     if (labourIdsWithLogs.length === 0) return [];

//     // Filter nullFirstPunchRows to include only those with logs this month
//     const filteredNullPunchRows = nullFirstPunchRows.filter(row =>
//       labourIdsWithLogs.includes(row.LabourId)
//     );
//     if (filteredNullPunchRows.length === 0) return [];

//     // Step 3: Get valid punches from Attendance
//     const result3 = await pool2.request().query(`
//       SELECT user_id, CONVERT(VARCHAR, punch_date, 23) AS PunchDate
//       FROM [etimetracklite11.8].[dbo].[Attendance]
//       WHERE punch_time IS NOT NULL
//         AND punch_date BETWEEN DATEADD(DAY, -30, CAST(GETDATE() AS DATE)) 
//                            AND DATEADD(DAY, -2, CAST(GETDATE() AS DATE))
//         AND (
//           user_id LIKE 'JC%' 
//           OR user_id LIKE 'JIH%'
//         );
//     `);

//     const validPunchRows = result3.recordset;

//     // Build set from Step 1 + 2 (only those LabourIds with logs)
//     const nullPunchSet = new Set(
//       filteredNullPunchRows.map(row => `${row.LabourId}::${row.PunchDate}`)
//     );

//     // Match all (user_id, PunchDate) from Attendance that appear in the set
//     const matchedResults = validPunchRows.filter(row =>
//       nullPunchSet.has(`${row.user_id}::${row.PunchDate}`)
//     );

//     // ✅ Keep full list of duplicates — same user_id across multiple dates
//     const finalMatchedIdsWithDates = matchedResults.map(row => ({
//       user_id: row.user_id,
//       date: row.PunchDate
//     }));

//     console.log("✅ Final Matches (Duplicates allowed):", finalMatchedIdsWithDates);
//     return finalMatchedIdsWithDates;

//   } catch (err) {
//     console.error("❌ Error in getMatchedLabourIdsWithValidPunch:", err);
//     throw err;
//   }
// };


module.exports = {
    getAllLabours,
    createRecord,
    searchLaboursFromVariablePay,
    searchLaboursFromWagesApproval,
    searchLaboursFromAttendanceApproval,
    searchFromSiteTransferApproval,
    searchFromViewMonthlyPayroll,
    upsertLabourVariablePay,
    getVariablePayAndLabourOnboardingJoincontroller,
    checkExistingVariablePayController,
    markVariablePayForApprovalController,
    approveVariablePayAdmin,
    rejectVariablePayAdmin,
    getVariablePayAdminApprovals,
    exportVariablePayexcelSheetWithBU,
    exportVariablePayexcelSheet,
    importVariablePay,
    // ------------------------------------------------------   salary generation process -----------------------------------
    generateMonthlyPayroll,
    generateMonthlyPayrollForSingleLabour,
    getEligibleLaboursAPI,
    getAttendanceSummaryAPI,
    getWageInfoAPI,
    getVariablePayAPI,
    calculateSingleLabourAPI,
    generateMonthlyPayrollAPI,
    getMonthlySalariesAPI,
    getOvertimeMonthlyAPI,
    getSalaryGenerationDataAPIAllLabours,
    getSalaryGenerationDataAPI,
    saveFinalizePayrollData,
    deletePayrollController,
    getFinalizedSalaryData,
    getFinalizedSalaryDataByLabourID,
    exportMonthlyPayrollExcel,
    exportWagesexcelSheet,
    exportMonthlyWagesExcel,
    exportFixedWagesExcel,
getMatchedLabourIdsWithValidPunch
}