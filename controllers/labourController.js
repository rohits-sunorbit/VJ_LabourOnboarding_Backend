const { sql, poolPromise2 } = require("../config/dbConfig2");
const { poolPromise3 } = require("../config/dbConfig3");
const { poolPromise } = require("../config/dbConfig");
const { poolPromise4 } = require("../config/dbConfigSCPL");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const { upload } = require("../server");
const xml2js = require("xml2js");
const labourModel = require("../models/labourModel");
const cron = require("node-cron");
const logger = require("../logger");
const { createLogger, format, transports } = require("winston");
const xlsx = require("xlsx");
const moment = require("moment");
const pdf = require("html-pdf");

// const { sql, poolPromise2 } = require('../config/dbConfig');

// const baseUrl = 'http://localhost:4000/uploads/';
// const baseUrl = 'https://laboursandbox.vjerp.com/uploads/';
const baseUrl = "https://vjlabour.vjerp.com/uploads/";

const LM_READ_TIMEOUT_MS = 90_000;
const LM_WRITE_TIMEOUT_MS = 45_000;
const LM_LOOKUP_TIMEOUT_MS = 30_000;
const LABOUR_CONCURRENCY = 12;
const RETRIES_READ = 1;
const RETRIES_WRITE = 1;
const RETRIES_LOOKUP = 1;

let cachedAttendance = null;

const logDir = path.join(__dirname, "../logs");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

const date = new Date().toISOString().split("T")[0];
const logFile = path.join(logDir, `labour_cron_${date}.log`);

const cronLogger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    })
  ),
  transports: [
    new winston.transports.File({ filename: logFile }),
    new winston.transports.Console(),
  ],
});

async function handleCheckAadhaar(req, res) {
  const { aadhaarNumber } = req.body;

  try {
    const labourRecords = await labourModel.checkAadhaarExists(aadhaarNumber);

    if (labourRecords && labourRecords.length > 0) {
      const resubmittedRecord = labourRecords.find(
        (record) =>
          (record.status === "Pending" && record.isApproved === 0) ||
          (record.status === "Approved" && record.isApproved === 1) ||
          (record.status === "Rejected" && record.isApproved === 2)
      );

      if (resubmittedRecord) {
        const labourIDs = labourRecords.map((record) => record.LabourID);

        return res.status(200).json({
          exists: true,
          LabourIDs: labourIDs,
        });
      } else {
        const labourIDs = labourRecords.map((record) => record.LabourID);
        return res
          .status(200)
          .json({ exists: false, skipCheck: true, LabourIDs: labourIDs });
      }
    } else {
      return res.status(200).json({ exists: false });
    }
  } catch (error) {
    console.error("Error in handleCheckAadhaar:", error);
    return res.status(500).json({ error: "Error checking Aadhaar number" });
  }
}

async function getNextUniqueID(req, res) {
  try {
    const departmentId = parseInt(req.query.departmentId, 10);
    if (isNaN(departmentId)) {
      return res
        .status(400)
        .json({ message: "Invalid or missing departmentId" });
    }

    const nextID = await labourModel.getNextUniqueID(departmentId);
    res.json({ nextID });
  } catch (error) {
    console.error("Error in getNextUniqueID:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

async function getCommandStatus(req, res) {
  const commandId = req.params.commandId;

  try {
    const pool = await poolPromise3;
    const result = await pool
      .request()
      .input("CommandId", sql.Int, commandId)
      .query(
        "SELECT status FROM DeviceCommands WHERE DeviceCommandId = @CommandId"
      );

    if (result.recordset.length > 0) {
      const status = result.recordset[0].status;
      return res.json({ status });
    } else {
      return res.status(404).json({ message: "Command ID not found." });
    }
  } catch (error) {
    console.error("Error fetching command status:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

async function createRecord(req, res) {
  try {
    const {
      labourOwnership,
      name,
      aadhaarNumber,
      dateOfBirth,
      contactNumber,
      gender,
      dateOfJoining,
      address,
      pincode,
      taluka,
      district,
      village,
      state,
      emergencyContact,
      bankName,
      branch,
      accountNumber,
      ifscCode,
      projectName,
      labourCategory,
      department,
      workingHours,
      contractorName,
      contractorNumber,
      designation,
      title,
      Marital_Status,
      Induction_Date,
      Inducted_By,
      OnboardName,
      expiryDate,
      departmentId,
      designationId,
      labourCategoryId,
    } = req.body;

    const finalOnboardName = Array.isArray(OnboardName)
      ? OnboardName[0]
      : OnboardName;

    const {
      uploadAadhaarFront,
      uploadAadhaarBack,
      photoSrc,
      uploadIdProof,
      uploadInductionDoc,
    } = req.files;
    // console.log('Received IDs:', { projectName, departmentId, designationId, labourCategoryId });
    // Validate file fields
    if (!photoSrc || !uploadIdProof) {
      return res.status(400).json({ msg: "All file fields are required" });
    }

    // const frontImageFilename = path.basename(uploadAadhaarFront[0].path);
    const frontImageFilename = uploadAadhaarFront
      ? path.basename(uploadAadhaarFront[0].path)
      : null;
    // const backImageFilename = path.basename(uploadAadhaarBack[0].path);
    const backImageFilename = uploadAadhaarBack
      ? path.basename(uploadAadhaarBack[0].path)
      : null;
    const IdProofImageFilename = path.basename(uploadIdProof[0].path);
    const uploadInductionDocFilename = path.basename(
      uploadInductionDoc[0].path
    );
    const photoSrcFilename = path.basename(photoSrc[0].path);

    // const frontImageUrl = baseUrl + frontImageFilename;
    const frontImageUrl = frontImageFilename
      ? baseUrl + frontImageFilename
      : null;
    // const backImageUrl = baseUrl + backImageFilename;
    const backImageUrl = backImageFilename ? baseUrl + backImageFilename : null;
    const IdProofImageUrl = baseUrl + IdProofImageFilename;
    const uploadInductionDocImageUrl = baseUrl + uploadInductionDocFilename;
    const photoSrcUrl = baseUrl + photoSrcFilename;

    const dateOfJoiningDate = new Date(dateOfJoining);
    const fromDate = dateOfJoiningDate;
    const period = dateOfJoiningDate
      .toLocaleString("default", { month: "long", year: "numeric" })
      .replace(" ", "-");

    const validTillDate = new Date(dateOfJoiningDate);
    validTillDate.setFullYear(validTillDate.getFullYear() + 1);

    const retirementDate = new Date(dateOfBirth);
    retirementDate.setFullYear(retirementDate.getFullYear() + 60);

    // **********************************  NEW  ********************
    // Primary check on Framework.BusinessUnit (Server 1)
    const pool = await poolPromise4;
    const isNumeric = !isNaN(projectName);
    const projectRequest = pool.request();
    projectRequest.input(
      "projectName",
      isNumeric ? sql.Int : sql.VarChar,
      projectName
    );

    let projectResult;
    let location = "";
    let businessUnit = "";
    let projectId;
    let parentId;

    // 1. Try primary query from Framework.BusinessUnit
    const primaryQuery = isNumeric
      ? `
                SELECT Id, Description, Type, Email1, ParentId 
                FROM Framework.BusinessUnit 
                WHERE Type = 'B' 
                AND (IsDiscontinueBU IS NULL OR IsDiscontinueBU = '' OR IsDiscontinueBU = 0) 
                AND (IsDeleted IS NULL OR IsDeleted = '' OR IsDeleted = 0)
                AND Id = @projectName
              `
      : `
                SELECT a.Id, a.Description, a.Type, a.Email1, a.ParentId
                FROM Framework.BusinessUnit a
                LEFT JOIN Framework.BusinessUnitSegment b ON b.Id = a.SegmentId
                WHERE a.Description = @projectName
                AND (a.IsDiscontinueBU IS NULL OR a.IsDiscontinueBU = 0)
                AND (a.IsDeleted IS NULL OR a.IsDeleted = 0)
                AND b.Id = 3
              `;

    const primaryResult = await projectRequest.query(primaryQuery);

    if (primaryResult.recordset.length > 0) {
      const record = primaryResult.recordset[0];
      projectResult = record;
      location = record.Description;
      businessUnit = record.Description;
      projectId = record.Id;
      parentId = record.ParentId;
    } else {
      console.log(
        `Primary lookup failed for projectName: ${projectName}, trying CompanyNameByBuId...`
      );

      const pool2 = await poolPromise;
      const fallbackQuery = `
                SELECT Id, ProjectName AS Description, Type, ParentId
                FROM CompanyNameByBuId
            `;
      const fallbackResult = await pool2.request().query(fallbackQuery);

      const match = fallbackResult.recordset.find((comp) =>
        isNumeric
          ? comp.Id === parseInt(projectName)
          : comp.Description.trim().toLowerCase() ===
            projectName.trim().toLowerCase()
      );

      if (!match) {
        return res.status(400).json({ msg: "Invalid project name" });
      }

      projectResult = match;
      location = match.Description;
      businessUnit = match.Description;
      projectId = match.Id;
      parentId = match.ParentId;
    }

    // 2. Determine Company Name using ParentId from resolved record
    const pool5 = await poolPromise;
    const companyNameResult = await pool5.request().query(`
            SELECT Description AS Company_Name 
            FROM CompanyNameByBuId 
            WHERE ParentId = ${parentId}
        `);

    let salaryBu = location;
    if (companyNameResult.recordset.length > 0) {
      const companyNameFromDb = companyNameResult.recordset[0].Company_Name;
      if (companyNameFromDb === "SANKALP CONTRACTS PRIVATE LIMITED") {
        salaryBu = `${companyNameFromDb} - HO`;
      }
    }

    let companyName = companyNameResult.recordset[0].Company_Name;
    // 3. Department Info
    const departmentRequest = pool5.request();
    departmentRequest.input("departmentId", sql.Int, departmentId);
    const departmentQuery = `
            SELECT [id], [farvision_code] AS Code, [farvision_id] AS Id, [farvision_description] AS Description 
            FROM [Departments] 
            WHERE [farvision_id] = @departmentId
        `;
    const departmentResult = await departmentRequest.query(departmentQuery);
    if (departmentResult.recordset.length === 0) {
      return res.status(404).send("Department not found");
    }
    const departmentName = departmentResult.recordset[0].Description;
    // console.log('departmentResult++',departmentName)

    const creationDate = new Date();
    //console.log('Received OnboardName:', finalOnboardName);
    const data = await labourModel.registerData({
      labourOwnership,
      uploadAadhaarFront: frontImageUrl,
      uploadAadhaarBack: backImageUrl,
      uploadIdProof: IdProofImageUrl,
      uploadInductionDoc: uploadInductionDocImageUrl,
      name,
      aadhaarNumber,
      dateOfBirth,
      contactNumber,
      gender,
      dateOfJoining,
      Group_Join_Date: dateOfJoining,
      ConfirmDate: dateOfJoining,
      From_Date: fromDate.toISOString().split("T")[0],
      Period: period,
      address,
      pincode,
      taluka,
      district,
      village,
      state,
      emergencyContact,
      photoSrc: photoSrcUrl,
      bankName,
      branch,
      accountNumber,
      ifscCode,
      projectName,
      labourCategory,
      department,
      workingHours,
      location,
      SalaryBu: salaryBu,
      businessUnit,
      contractorName,
      contractorNumber,
      designation,
      title,
      Marital_Status,
      companyName: companyName,
      Induction_Date,
      Inducted_By,
      OnboardName: finalOnboardName,
      expiryDate,
      ValidTill: validTillDate.toISOString().split("T")[0],
      retirementDate: retirementDate.toISOString().split("T")[0],
      WorkingBu: location,
      CreationDate: creationDate.toISOString(),
      departmentId,
      departmentName,
      designationId,
      labourCategoryId,
    });
    //console.log('Inserted OnboardName:', finalOnboardName);
    return res
      .status(201)
      .json({ msg: "User created successfully", data: data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: "Internal server error" });
  }
}

async function getAllRecords(req, res) {
  try {
    console.log("getAllRecords");
    const records = await labourModel.getAll();
    return res.status(200).json(records);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function getAllRecordsLaboursOnboarding(req, res) {
  try {
    const records = await labourModel.getAllLaboursOnboarding();
    return res.status(200).json(records);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function getRecordById(req, res) {
  //console.log("getRecordById")
  try {
    const { id } = req.params;
    const record = await labourModel.getById(id);
    if (!record) {
      return res.status(404).json({ error: "Record not found" });
    }
    return res.json(record);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function createRecordUpdate(req, res) {
  try {
    //console.log('Request Body: check----------', req.body);
    //console.log('Request Files:', req.files);

    const {
      labourOwnership,
      name,
      aadhaarNumber,
      dateOfBirth,
      contactNumber,
      gender,
      dateOfJoining,
      address,
      pincode,
      taluka,
      district,
      village,
      state,
      emergencyContact,
      bankName,
      branch,
      accountNumber,
      ifscCode,
      projectName,
      labourCategory,
      department,
      workingHours,
      contractorName,
      contractorNumber,
      designation,
      title,
      Marital_Status,
      companyName,
      Induction_Date,
      Inducted_By,
      OnboardName,
      expiryDate,
      departmentId,
      designationId,
    } = req.body;

    let finalOnboardName = Array.isArray(OnboardName)
      ? OnboardName.filter((name) => name && name.trim() !== "").pop()
      : OnboardName;

    if (!finalOnboardName || finalOnboardName.trim() === "") {
      console.error("OnboardName is missing or empty.");
      return res.status(400).json({ msg: "OnboardName is required." });
    }
    finalOnboardName = finalOnboardName.toUpperCase();

    if (!finalOnboardName || finalOnboardName.trim() === "") {
      console.error("OnboardName is missing or empty.");
      return res.status(400).json({ msg: "OnboardName is required." });
    }

    //console.log('Cleaned OnboardName Resubmitted button:', finalOnboardName);

    const labourCategoryMap = {
      SKILLED: 1,
      "UN-SKILLED": 2,
      "SEMI-SKILLED": 3,
    };

    const safeLabourCategoryId =
      String(labourCategoryMap[labourCategory]) || null;

    if (safeLabourCategoryId === null) {
      //console.log('Invalid labourCategory:', labourCategory);
      return res.status(400).json({ msg: "Invalid labourCategory provided" });
    }

    const safeConvertToInt = (value) => {
      if (value === "null" || value === "" || value === undefined) return null;
      const parsedValue = parseInt(value, 10);
      return isNaN(parsedValue) ? null : parsedValue;
    };

    const safeDepartmentId = String(departmentId);
    const safeDesignationId = String(designationId);
    const safeProjectName = isNaN(projectName)
      ? projectName
      : String(projectName);

    //console.log('Converted Values:', {
    //     safeProjectName,
    //     safeDepartmentId,
    //     safeDesignationId,
    //     safeLabourCategoryId
    // });

    if (
      safeProjectName === null ||
      safeDepartmentId === null ||
      safeDesignationId === null
    ) {
      return res.status(400).json({
        msg: "Missing required fields: projectName, departmentId, or designationId",
      });
    }

    const {
      uploadAadhaarFront = null,
      uploadAadhaarBack = null,
      photoSrc = null,
      uploadIdProof = null,
      uploadInductionDoc = null,
    } = req.files || {}; // Use {} as fallback if req.files is undefined

    const processFileField = (bodyField, fileField) => {
      if (fileField) {
        // Binary data uploaded, get URL path
        return baseUrl + path.basename(fileField[0].path);
      } else if (
        typeof bodyField === "string" &&
        bodyField.startsWith("http")
      ) {
        // If no new file, use the existing URL
        return bodyField;
      }
      return null; // No data available
    };

    const frontImageUrl = processFileField(
      req.body.uploadAadhaarFront,
      uploadAadhaarFront
    );
    const backImageUrl = processFileField(
      req.body.uploadAadhaarBack,
      uploadAadhaarBack
    );
    const photoSrcUrl = processFileField(req.body.photoSrc, photoSrc);
    const IdProofImageUrl = processFileField(
      req.body.uploadIdProof,
      uploadIdProof
    );
    const uploadInductionDocImageUrl = processFileField(
      req.body.uploadInductionDoc,
      uploadInductionDoc
    );

    const dateOfJoiningDate = new Date(dateOfJoining);
    const fromDate = dateOfJoiningDate;
    const period = dateOfJoiningDate
      .toLocaleString("default", { month: "long", year: "numeric" })
      .replace(" ", "-");
    const validTillDate = new Date(dateOfJoiningDate);
    validTillDate.setFullYear(validTillDate.getFullYear() + 1);
    const retirementDate = new Date(dateOfBirth);
    retirementDate.setFullYear(retirementDate.getFullYear() + 60);

    const pool = await poolPromise4;
    const isNumeric = !isNaN(projectName);
    const projectRequest = pool.request();
    projectRequest.input(
      "projectName",
      isNumeric ? sql.Int : sql.VarChar,
      projectName
    );

    let projectResult;
    let location = "";
    let businessUnit = "";
    let projectId;
    let parentId;

    // 1. Try primary query from Framework.BusinessUnit
    const primaryQuery = isNumeric
      ? `
                SELECT Id, Description, Type, Email1, ParentId 
                FROM Framework.BusinessUnit 
                WHERE Type = 'B' 
                AND (IsDiscontinueBU IS NULL OR IsDiscontinueBU = '' OR IsDiscontinueBU = 0) 
                AND (IsDeleted IS NULL OR IsDeleted = '' OR IsDeleted = 0)
                AND Id = @projectName
              `
      : `
                SELECT a.Id, a.Description, a.Type, a.Email1, a.ParentId
                FROM Framework.BusinessUnit a
                LEFT JOIN Framework.BusinessUnitSegment b ON b.Id = a.SegmentId
                WHERE a.Description = @projectName
                AND (a.IsDiscontinueBU IS NULL OR a.IsDiscontinueBU = 0)
                AND (a.IsDeleted IS NULL OR a.IsDeleted = 0)
                AND b.Id = 3
              `;

    const primaryResult = await projectRequest.query(primaryQuery);

    if (primaryResult.recordset.length > 0) {
      const record = primaryResult.recordset[0];
      projectResult = record;
      location = record.Description;
      businessUnit = record.Description;
      projectId = record.Id;
      parentId = record.ParentId;
    } else {
      console.log(
        `Primary lookup failed for projectName: ${projectName}, trying CompanyNameByBuId...`
      );

      const pool2 = await poolPromise;
      const fallbackQuery = `
                SELECT Id, ProjectName AS Description, Type, ParentId
                FROM CompanyNameByBuId
            `;
      const fallbackResult = await pool2.request().query(fallbackQuery);

      const match = fallbackResult.recordset.find((comp) =>
        isNumeric
          ? comp.Id === parseInt(projectName)
          : comp.Description.trim().toLowerCase() ===
            projectName.trim().toLowerCase()
      );

      if (!match) {
        return res.status(400).json({ msg: "Invalid project name" });
      }

      projectResult = match;
      location = match.Description;
      businessUnit = match.Description;
      projectId = match.Id;
      parentId = match.ParentId;
    }

    // const parentId = parentIdResult.recordset[0].ParentId;
    const pool5 = await poolPromise;
    const companyNameResult = await pool5.request().query(`
              SELECT Description AS Company_Name 
        FROM CompanyNameByBuId 
        WHERE ParentId = ${parentId}
        `);

    const companyNameFromDb = companyNameResult.recordset[0].Company_Name;

    if (companyNameFromDb === "SANKALP CONTRACTS PRIVATE LIMITED") {
      salaryBu = `${companyNameFromDb} - HO`;
    } else {
      salaryBu = location;
    }

    // Fetch department description
    const departmentRequest = pool.request();

    // Validate and log departmentId before setting SQL input
    //console.log('Setting SQL input for departmentId:', safeDepartmentId);
    if (safeDepartmentId !== null) {
      departmentRequest.input("departmentId", safeDepartmentId);
      //console.log("departmentId", departmentId)
    } else {
      //console.log('Invalid departmentId provided:', departmentId);
      return res.status(400).send("Invalid departmentId");
    }

    const departmentQuery = `
             SELECT [id], [farvision_code] AS Code, [farvision_id] AS Id, [farvision_description] AS Description 
      FROM [Departments] WHERE [farvision_id] = @departmentId
        `;
    const departmentResult = await departmentRequest.query(departmentQuery);

    if (departmentResult.recordset.length === 0) {
      //console.log('Department not found for departmentId:', safeDepartmentId);
      return res.status(404).send("Department not found");
    }

    const departmentName = departmentResult.recordset[0].Description;

    const creationDate = new Date();

    //console.log('Received OnboardName Resubmmit button functionlity:', finalOnboardName);

    const data = await labourModel.registerDataUpdate({
      labourOwnership,
      uploadAadhaarFront: frontImageUrl,
      uploadAadhaarBack: backImageUrl,
      uploadIdProof: IdProofImageUrl,
      uploadInductionDoc: uploadInductionDocImageUrl,
      name,
      aadhaarNumber,
      dateOfBirth,
      contactNumber,
      gender,
      dateOfJoining,
      Group_Join_Date: dateOfJoining,
      ConfirmDate: dateOfJoining,
      From_Date: fromDate.toISOString().split("T")[0],
      Period: period,
      address,
      pincode,
      taluka,
      district,
      village,
      state,
      emergencyContact,
      photoSrc: photoSrcUrl,
      bankName,
      branch,
      accountNumber,
      ifscCode,
      projectName,
      labourCategory,
      department,
      workingHours,
      location,
      SalaryBu: salaryBu,
      businessUnit,
      contractorName,
      contractorNumber,
      designation,
      title,
      Marital_Status,
      companyName,
      Induction_Date,
      Inducted_By,
      OnboardName: finalOnboardName,
      expiryDate,
      ValidTill: validTillDate.toISOString().split("T")[0],
      retirementDate: retirementDate.toISOString().split("T")[0],
      WorkingBu: location,
      CreationDate: creationDate.toISOString(),
      departmentId: safeDepartmentId,
      departmentName,
      designationId: safeDesignationId,
      labourCategoryId: safeLabourCategoryId,
    });

    //console.log('dataupdate', data)

    return res
      .status(201)
      .json({ msg: "User created successfully", data: data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: "Internal server error" });
  }
}

async function updateRecord(req, res) {
  try {
    const {
      id,
      LabourID,
      labourOwnership,
      name,
      aadhaarNumber,
      dateOfBirth,
      contactNumber,
      gender,
      dateOfJoining,
      address,
      pincode,
      taluka,
      district,
      village,
      state,
      emergencyContact,
      bankName,
      branch,
      accountNumber,
      ifscCode,
      projectName,
      labourCategory,
      department,
      workingHours,
      contractorName,
      contractorNumber,
      designation,
      title,
      Marital_Status,
      companyName,
      Induction_Date,
      Inducted_By,
      OnboardName,
      expiryDate,
      departmentId,
      designationId,
    } = req.body;

    let finalOnboardName = Array.isArray(OnboardName)
      ? OnboardName.filter((name) => name && name.trim() !== "").pop()
      : OnboardName;

    if (!finalOnboardName || finalOnboardName.trim() === "") {
      console.error("OnboardName is missing or empty.");
      return res.status(400).json({ msg: "OnboardName is required." });
    }
    finalOnboardName = finalOnboardName.toUpperCase();

    if (!LabourID) {
      console.error("LabourID is missing from request body.");
      return res.status(400).json({ msg: "LabourID is required." });
    }

    const labourCategoryMap = {
      SKILLED: 1,
      "UN-SKILLED": 2,
      "SEMI-SKILLED": 3,
    };

    const safeLabourCategoryId =
      labourCategoryMap[labourCategory] !== undefined
        ? labourCategoryMap[labourCategory]
        : null;

    if (safeLabourCategoryId === null) {
      return res.status(400).json({ msg: "Invalid labourCategory provided" });
    }

    const safeDepartmentId = departmentId ? String(departmentId) : null;
    const safeDesignationId = designationId ? String(designationId) : null;
    const safeProjectName =
      projectName && !isNaN(projectName) ? String(projectName) : projectName;

    if (!safeProjectName || !safeDepartmentId || !safeDesignationId) {
      return res.status(400).json({
        msg: "Missing required fields: projectName, departmentId, or designationId",
      });
    }

    const {
      uploadAadhaarFront,
      uploadAadhaarBack,
      photoSrc,
      uploadIdProof,
      uploadInductionDoc,
    } = req.files || {};

    const processFileField = (bodyField, fileField) => {
      if (fileField) {
        return baseUrl + path.basename(fileField[0].path);
      } else if (
        typeof bodyField === "string" &&
        bodyField.startsWith("http")
      ) {
        return bodyField;
      }
      return null;
    };

    const frontImageUrl = processFileField(
      req.body.uploadAadhaarFront,
      uploadAadhaarFront
    );
    const backImageUrl = processFileField(
      req.body.uploadAadhaarBack,
      uploadAadhaarBack
    );
    const photoSrcUrl = processFileField(req.body.photoSrc, photoSrc);
    const IdProofImageUrl = processFileField(
      req.body.uploadIdProof,
      uploadIdProof
    );
    const uploadInductionDocImageUrl = processFileField(
      req.body.uploadInductionDoc,
      uploadInductionDoc
    );

    const dateOfJoiningDate = new Date(dateOfJoining);
    const fromDate = dateOfJoiningDate;
    const period = dateOfJoiningDate
      .toLocaleString("default", { month: "long", year: "numeric" })
      .replace(" ", "-");
    const validTillDate = new Date(dateOfJoiningDate);
    validTillDate.setFullYear(validTillDate.getFullYear() + 1);
    const retirementDate = new Date(dateOfBirth);
    retirementDate.setFullYear(retirementDate.getFullYear() + 60);

    const pool = await poolPromise4;
    const isNumeric = !isNaN(projectName);
    const projectRequest = pool.request();
    projectRequest.input(
      "projectName",
      isNumeric ? sql.Int : sql.VarChar,
      projectName
    );

    let projectResult;
    let location = "";
    let businessUnit = "";
    let projectId;
    let parentId;

    const primaryQuery = isNumeric
      ? `
                SELECT Id, Description, Type, Email1, ParentId 
                FROM Framework.BusinessUnit 
                WHERE Type = 'B' 
                AND (IsDiscontinueBU IS NULL OR IsDiscontinueBU = '' OR IsDiscontinueBU = 0) 
                AND (IsDeleted IS NULL OR IsDeleted = '' OR IsDeleted = 0)
                AND Id = @projectName
              `
      : `
                SELECT a.Id, a.Description, a.Type, a.Email1, a.ParentId
                FROM Framework.BusinessUnit a
                LEFT JOIN Framework.BusinessUnitSegment b ON b.Id = a.SegmentId
                WHERE a.Description = @projectName
                AND (a.IsDiscontinueBU IS NULL OR a.IsDiscontinueBU = 0)
                AND (a.IsDeleted IS NULL OR a.IsDeleted = 0)
                AND b.Id = 3
              `;

    const primaryResult = await projectRequest.query(primaryQuery);

    if (primaryResult.recordset.length > 0) {
      const record = primaryResult.recordset[0];
      projectResult = record;
      location = record.Description;
      businessUnit = record.Description;
      projectId = record.Id;
      parentId = record.ParentId;
    } else {
      console.log(
        `Primary lookup failed for projectName: ${projectName}, trying CompanyNameByBuId...`
      );

      const pool2 = await poolPromise;
      const fallbackQuery = `
                SELECT Id, ProjectName AS Description, Type, ParentId
                FROM CompanyNameByBuId
            `;
      const fallbackResult = await pool2.request().query(fallbackQuery);

      const match = fallbackResult.recordset.find((comp) =>
        isNumeric
          ? comp.Id === parseInt(projectName)
          : comp.Description.trim().toLowerCase() ===
            projectName.trim().toLowerCase()
      );

      if (!match) {
        return res.status(400).json({ msg: "Invalid project name" });
      }

      projectResult = match;
      location = match.Description;
      businessUnit = match.Description;
      projectId = match.Id;
      parentId = match.ParentId;
    }

    const pool5 = await poolPromise;
    const companyNameResult = await pool5.request().query(`
              SELECT Description AS Company_Name 
        FROM CompanyNameByBuId 
        WHERE ParentId = ${parentId}
        `);

    const companyNameFromDb = companyNameResult.recordset[0].Company_Name;

    if (companyNameFromDb === "SANKALP CONTRACTS PRIVATE LIMITED") {
      salaryBu = `${companyNameFromDb} - HO`;
    } else {
      salaryBu = location;
    }

    const departmentRequest = pool.request();

    if (safeDepartmentId !== null) {
      departmentRequest.input("departmentId", safeDepartmentId);
    } else {
      return res.status(400).send("Invalid departmentId");
    }

    const departmentQuery = `
             SELECT [id], [farvision_code] AS Code, [farvision_id] AS Id, [farvision_description] AS Description 
      FROM [Departments] WHERE [farvision_id] = @departmentId
        `;
    const departmentResult = await departmentRequest.query(departmentQuery);

    if (departmentResult.recordset.length === 0) {
      return res.status(404).send("Department not found");
    }

    const departmentName = departmentResult.recordset[0].Description;

    const creationDate = new Date();
    const data = await labourModel.updateData({
      id,
      LabourID,
      labourOwnership,
      uploadAadhaarFront: frontImageUrl,
      uploadAadhaarBack: backImageUrl,
      uploadIdProof: IdProofImageUrl,
      uploadInductionDoc: uploadInductionDocImageUrl,
      name,
      aadhaarNumber,
      dateOfBirth,
      contactNumber,
      gender,
      dateOfJoining,
      Group_Join_Date: dateOfJoining,
      ConfirmDate: dateOfJoining,
      From_Date: fromDate.toISOString().split("T")[0],
      Period: period,
      address,
      pincode,
      taluka,
      district,
      village,
      state,
      emergencyContact,
      photoSrc: photoSrcUrl,
      bankName,
      branch,
      accountNumber,
      ifscCode,
      projectName,
      labourCategory,
      department,
      workingHours,
      location,
      SalaryBu: salaryBu,
      businessUnit,
      contractorName,
      contractorNumber,
      designation,
      title,
      Marital_Status,
      companyName,
      Induction_Date,
      Inducted_By,
      OnboardName: finalOnboardName,
      expiryDate,
      ValidTill: validTillDate.toISOString().split("T")[0],
      retirementDate: retirementDate.toISOString().split("T")[0],
      WorkingBu: location,
      CreationDate: creationDate.toISOString(),
      departmentId: safeDepartmentId,
      departmentName,
      designationId: safeDesignationId,
      labourCategoryId: safeLabourCategoryId,
    });

    if (!data) {
      return res.status(404).json({ msg: "No data updated" });
    }
    return res
      .status(200)
      .json({ msg: "User updated successfully", data: data });
  } catch (err) {
    console.error("Error updating record:", err.message);
    return res.status(500).json({ msg: "Internal server error" });
  }
}

async function updateRecordWithDisable(req, res) {
  try {
    let {
      LabourID,
      labourOwnership,
      name,
      aadhaarNumber,
      dateOfBirth,
      contactNumber,
      gender,
      dateOfJoining,
      address,
      pincode,
      taluka,
      district,
      village,
      state,
      emergencyContact,
      bankName,
      branch,
      accountNumber,
      ifscCode,
      projectName,
      labourCategory,
      department,
      workingHours,
      contractorName,
      contractorNumber,
      designation,
      title,
      Marital_Status,
      companyName,
      Induction_Date,
      Inducted_By,
      OnboardName,
      expiryDate,
      departmentId,
      designationId,
      isResubmit,
      hideResubmit,
      isCompanyTransfer,
      isSiteTransfer,
      Reject_Reason,
    } = req.body;
    console.log("req.body-->", req.body);

    const parseBitField = (val) => {
      if (val === null || val === undefined || val === "" || val === "null")
        return null;
      if (typeof val === "boolean") return val;
      if (typeof val === "string") {
        const lowered = val.trim().toLowerCase();
        if (lowered === "true" || lowered === "1") return true;
        if (lowered === "false" || lowered === "0") return false;
      }
      return null;
    };

    const parsedIsResubmit = parseBitField(isResubmit);
    const parsedHideResubmit = parseBitField(hideResubmit);
    const parsedIsCompanyTransfer = parseBitField(isCompanyTransfer);
    const parsedIsSiteTransfer = parseBitField(isSiteTransfer);

    let finalOnboardName = Array.isArray(OnboardName)
      ? OnboardName.filter((n) => n && n.trim() !== "").pop()
      : OnboardName;

    if (!finalOnboardName || finalOnboardName.trim() === "") {
      return res.status(400).json({ msg: "OnboardName is required." });
    }
    finalOnboardName = finalOnboardName.toUpperCase();

    if (!LabourID) {
      return res.status(400).json({ msg: "LabourID is required." });
    }

    const labourCategoryMap = {
      SKILLED: 1,
      "UN-SKILLED": 2,
      "SEMI-SKILLED": 3,
    };
    const safeLabourCategoryId =
      String(labourCategoryMap[labourCategory]) || null;
    if (safeLabourCategoryId === null) {
      return res.status(400).json({ msg: "Invalid labourCategory provided" });
    }

    const safeDepartmentId = String(departmentId);
    const safeDesignationId = String(designationId);
    const safeProjectName = String(projectName);

    if (!safeProjectName || !safeDepartmentId || !safeDesignationId) {
      return res.status(400).json({
        msg: "Missing required fields: projectName, departmentId, or designationId",
      });
    }

    const {
      uploadAadhaarFront = null,
      uploadAadhaarBack = null,
      photoSrc = null,
      uploadIdProof = null,
      uploadInductionDoc = null,
    } = req.files || {};

    const processFileField = (bodyField, fileField) => {
      if (fileField) {
        return baseUrl + path.basename(fileField[0].path);
      } else if (
        typeof bodyField === "string" &&
        bodyField.startsWith("http")
      ) {
        return bodyField;
      }
      return null;
    };

    const frontImageUrl = processFileField(
      req.body.uploadAadhaarFront,
      uploadAadhaarFront
    );
    const backImageUrl = processFileField(
      req.body.uploadAadhaarBack,
      uploadAadhaarBack
    );
    const photoSrcUrl = processFileField(req.body.photoSrc, photoSrc);
    const IdProofImageUrl = processFileField(
      req.body.uploadIdProof,
      uploadIdProof
    );
    const uploadInductionDocImageUrl = processFileField(
      req.body.uploadInductionDoc,
      uploadInductionDoc
    );

    const dateOfJoiningDate = new Date(dateOfJoining);
    const fromDate = dateOfJoiningDate;
    const period = dateOfJoiningDate
      .toLocaleString("default", { month: "long", year: "numeric" })
      .replace(" ", "-");

    const validTillDate = new Date(dateOfJoiningDate);
    validTillDate.setFullYear(validTillDate.getFullYear() + 1);

    const retirementDate = new Date(dateOfBirth);
    retirementDate.setFullYear(retirementDate.getFullYear() + 60);

    const pool = await poolPromise4;
    const isNumeric = !isNaN(projectName);
    const projectRequest = pool.request();
    projectRequest.input(
      "projectName",
      isNumeric ? sql.Int : sql.VarChar,
      projectName
    );

    let projectResult;
    let location = "";
    let businessUnit = "";
    let projectId;
    let parentId;

    const primaryQuery = isNumeric
      ? `
                SELECT Id, Description, Type, Email1, ParentId 
                FROM Framework.BusinessUnit 
                WHERE Type = 'B' 
                AND (IsDiscontinueBU IS NULL OR IsDiscontinueBU = '' OR IsDiscontinueBU = 0) 
                AND (IsDeleted IS NULL OR IsDeleted = '' OR IsDeleted = 0)
                AND Id = @projectName
              `
      : `
                SELECT a.Id, a.Description, a.Type, a.Email1, a.ParentId
                FROM Framework.BusinessUnit a
                LEFT JOIN Framework.BusinessUnitSegment b ON b.Id = a.SegmentId
                WHERE a.Description = @projectName
                AND (a.IsDiscontinueBU IS NULL OR a.IsDiscontinueBU = 0)
                AND (a.IsDeleted IS NULL OR a.IsDeleted = 0)
                AND b.Id = 3
              `;

    const primaryResult = await projectRequest.query(primaryQuery);

    if (primaryResult.recordset.length > 0) {
      const record = primaryResult.recordset[0];
      projectResult = record;
      location = record.Description;
      businessUnit = record.Description;
      projectId = record.Id;
      parentId = record.ParentId;
    } else {
      console.log(
        `Primary lookup failed for projectName: ${projectName}, trying CompanyNameByBuId...`
      );

      const pool2 = await poolPromise;
      const fallbackQuery = `
                SELECT Id, ProjectName AS Description, Type, ParentId
                FROM CompanyNameByBuId
            `;
      const fallbackResult = await pool2.request().query(fallbackQuery);

      const match = fallbackResult.recordset.find((comp) =>
        isNumeric
          ? comp.Id === parseInt(projectName)
          : comp.Description.trim().toLowerCase() ===
            projectName.trim().toLowerCase()
      );

      if (!match) {
        return res.status(400).json({ msg: "Invalid project name" });
      }

      projectResult = match;
      location = match.Description;
      businessUnit = match.Description;
      projectId = match.Id;
      parentId = match.ParentId;
    }

    const pool5 = await poolPromise;
    const companyNameResult = await pool5.request().query(`
              SELECT Description AS Company_Name 
        FROM CompanyNameByBuId 
        WHERE ParentId = ${parentId}
        `);

    const companyNameFromDb = companyNameResult.recordset[0].Company_Name || "";

    if (companyNameFromDb === "SANKALP CONTRACTS PRIVATE LIMITED") {
      salaryBu = `${companyNameFromDb} - HO`;
    } else {
      salaryBu = location;
    }

    const departmentRequest = pool5.request();

    console.log("Setting SQL input for departmentId:", safeDepartmentId);
    if (safeDepartmentId !== null) {
      departmentRequest.input("departmentId", safeDepartmentId);
      console.log("departmentId", departmentId);
    } else {
      console.log("Invalid departmentId provided:", departmentId);
      return res.status(400).send("Invalid departmentId");
    }

    const departmentQuery = `
             SELECT [id], [farvision_code] AS Code, [farvision_id] AS Id, [farvision_description] AS Description 
      FROM [Departments] WHERE [farvision_id] = @departmentId
        `;
    const departmentResult = await departmentRequest.query(departmentQuery);

    if (departmentResult.recordset.length === 0) {
      return res.status(404).send("Department not found");
    }

    const departmentName = departmentResult.recordset[0].Description;
    const creationDate = new Date();

    const data = await labourModel.registerDataUpdateDisable({
      LabourID,
      labourOwnership,
      uploadAadhaarFront: frontImageUrl,
      uploadAadhaarBack: backImageUrl,
      uploadIdProof: IdProofImageUrl,
      uploadInductionDoc: uploadInductionDocImageUrl,
      name,
      aadhaarNumber,
      dateOfBirth,
      contactNumber,
      gender,
      dateOfJoining,
      Group_Join_Date: dateOfJoining,
      ConfirmDate: dateOfJoining,
      From_Date: fromDate.toISOString().split("T")[0],
      Period: period,
      address,
      pincode,
      taluka,
      district,
      village,
      state,
      emergencyContact,
      photoSrc: photoSrcUrl,
      bankName,
      branch,
      accountNumber,
      ifscCode,
      projectName,
      labourCategory,
      department,
      workingHours,
      location,
      SalaryBu: salaryBu,
      businessUnit,
      contractorName,
      contractorNumber,
      designation,
      title,
      Marital_Status,
      companyName,
      Induction_Date,
      Inducted_By,
      OnboardName: finalOnboardName,
      expiryDate,
      ValidTill: validTillDate.toISOString().split("T")[0],
      retirementDate: retirementDate.toISOString().split("T")[0],
      WorkingBu: location,
      CreationDate: creationDate.toISOString(),
      departmentId: safeDepartmentId,
      departmentName,
      designationId: safeDesignationId,
      labourCategoryId: safeLabourCategoryId,
      isResubmit: parsedIsResubmit,
      hideResubmit: parsedHideResubmit,
      isCompanyTransfer: parsedIsCompanyTransfer,
      isSiteTransfer: parsedIsSiteTransfer,
      Reject_Reason,
    });

    return res.status(201).json({ msg: "User created successfully", data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: "Internal server error" });
  }
}

async function updateRecordLabour(req, res) {
  try {
    const { id } = req.params;
    const updatedData = req.body;

    if (!id) {
      return res.status(400).json({ error: "ID is required" });
    }

    // if (!updatedData || typeof updatedData !== 'object' || Object.keys(updatedData).length === 0) {
    //     return res.status(400).json({ error: 'Updated data is required and should not be empty' });
    // }
    // //console.log('Updating record with ID:', id);
    // //console.log('Updated data:', updatedData);

    const updated = await labourModel.updateLabour(id, updatedData);
    if (updated === 0) {
      return res.status(404).json({ error: "Record not found" });
    }
    return res.json({ message: "Record updated successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function deleteRecord(req, res) {
  try {
    const { id } = req.params;
    const rowsAffected = await labourModel.deleteById(id);
    if (rowsAffected === 0) {
      return res.status(404).json({ error: "Record not found" });
    }
    return res.json({ message: "Record deleted successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function searchLabours(req, res) {
  const { q } = req.query;

  try {
    const results = await labourModel.search(q);
    return res.json(results);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function searchLaboursForAttendance(req, res) {
  const { q } = req.query;

  try {
    const results = await labourModel.searchForAttendance(q);
    return res.json(results);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function getAllLabours(req, res) {
  try {
    const labours = await labourModel.getAllLabours();
    res.json(labours);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function approveLabour(req, res) {
  const id = parseInt(req.params.id, 10);
  const { labourID } = req.body;

  if (isNaN(id)) {
    return res.status(400).json({ message: "Invalid labour ID" });
  }

  try {
    const success = await labourModel.approveLabour(id, labourID);
    if (success) {
      res.json({
        success: true,
        message: "Labour approved successfully.",
        data: success,
      });
    } else {
      res
        .status(404)
        .json({ message: "Labour not found or already approved." });
    }
  } catch (error) {
    console.error("Error in approveLabour:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

async function approveDisableLabour(req, res) {
  const id = parseInt(req.params.id, 10);
  const { labourID } = req.body;

  if (isNaN(id) || !labourID) {
    return res.status(400).json({ message: "Invalid input parameters" });
  }

  try {
    const result = await labourModel.approveDisableLabours(id, labourID);
    if (result) {
      res.json({
        success: true,
        message: "Labour approved successfully.",
        data: result,
      });
    } else {
      res
        .status(404)
        .json({ message: "Labour not found or already approved." });
    }
  } catch (error) {
    console.error("Error in approveDisableLabour:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

async function rejectLabour(req, res) {
  const id = parseInt(req.params.id, 10);
  const { Reject_Reason } = req.body;
  if (isNaN(id)) {
    return res.status(400).json({ message: "Invalid labour ID" });
  }
  try {
    const success = await labourModel.rejectLabour(id, Reject_Reason);
    if (success) {
      res.json({ success: true, message: "Labour rejected successfully." });
    } else {
      res
        .status(404)
        .json({ message: "Labour not found or already rejected." });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function getApprovedLabours(req, res) {
  try {
    const approvedLabours = await labourModel.getApprovedLabours();
    res.json(approvedLabours);
  } catch (error) {
    console.error("Error fetching approved labours:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

async function resubmitLabour(req, res) {
  try {
    const { id } = req.params;
    const updated = await labourModel.resubmit(id);
    if (updated === 0) {
      return res.status(404).json({ error: "Record not found" });
    }
    return res.json({
      success: true,
      message: "Labour resubmitted successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function editbuttonLabour(req, res) {
  try {
    const { id } = req.params;
    const updated = await labourModel.editLabour(id);
    if (updated === 0) {
      return res.status(404).json({ error: "Record not found" });
    }
    return res.json({
      success: true,
      message: "Labour resubmitted successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function esslapi(req, res) {
  try {
    const approvedLaboursXml = req.body;
    const parser = new xml2js.Parser({ explicitArray: false });
    const approvedLabours = await parser.parseStringPromise(approvedLaboursXml);
    const LabourID =
      approvedLabours["soap:Envelope"]["soap:Body"]["AddEmployee"][
        "EmployeeCode"
      ];
    const name =
      approvedLabours["soap:Envelope"]["soap:Body"]["AddEmployee"][
        "EmployeeName"
      ];
    const userId =
      approvedLabours["soap:Envelope"]["soap:Body"]["AddEmployee"][
        "CardNumber"
      ];

    const esslapiurl =
      "https://essl.vjerp.com:8530/iclock/webapiservice.asmx?op=AddEmployee";
    const response = await axios.post(esslapiurl, approvedLaboursXml, {
      headers: {
        "Content-Type": "text/xml",
      },
    });

    const esslResponseData = response.data;
    const parsedResponse = await parseEsslResponse(esslResponseData);
    const { Status: esslStatus = "false", CommandId: esslCommandId = null } =
      parsedResponse;
    await saveEsslResponse({
      userId,
      LabourID,
      name,
      esslStatus,
      esslCommandId,
      esslPayload: approvedLaboursXml,
      esslApiResponse: parsedResponse,
    });

    res.json(parsedResponse);
  } catch (error) {
    console.error("Error fetching approved labours:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
}

async function parseEsslResponse(xmlData) {
  try {
    const parser = new xml2js.Parser({ explicitArray: false });
    const parsedData = await parser.parseStringPromise(xmlData);
    const status =
      parsedData["soap:Envelope"]["soap:Body"]["AddEmployeeResponse"][
        "AddEmployeeResult"
      ];
    const commandId =
      parsedData["soap:Envelope"]["soap:Body"]["AddEmployeeResponse"][
        "CommandId"
      ];
    const result = {
      Status: status && status.toLowerCase() === "success" ? status : "false",
      CommandId: commandId || null,
    };
    return result;
  } catch (error) {
    console.error("Error parsing XML response:", error.message);
    return {
      Status: "false",
      CommandId: null,
    };
  }
}

async function saveEsslResponse(data) {
  try {
    const pool = await poolPromise;
    const query = `
            INSERT INTO API_EsslPayloads (
                userId, LabourID, name,
                esslStatus, esslCommandId, esslPayload, esslApiResponse, createdAt, updatedAt
            ) VALUES (
                @userId, @LabourID, @name,
                @esslStatus, @esslCommandId, @esslPayload, @esslApiResponse, GETDATE(), GETDATE()
            )
        `;

    const esslPayloadString = JSON.stringify(data.esslPayload);
    const esslApiResponseString = JSON.stringify(data.esslApiResponse);

    await pool
      .request()
      .input("userId", sql.Int, data.userId)
      .input("LabourID", sql.NVarChar(50), data.LabourID)
      .input("name", sql.NVarChar(255), data.name)
      .input("esslStatus", sql.VarChar(50), data.esslStatus)
      .input("esslCommandId", sql.Int, data.esslCommandId)
      .input("esslPayload", sql.VarChar(sql.MAX), esslPayloadString)
      .input("esslApiResponse", sql.NVarChar(sql.MAX), esslApiResponseString)
      .query(query);
  } catch (err) {
    console.error("Error saving response to database:", err.message);
    throw err;
  }
}

async function getUserStatusController(req, res) {
  try {
    const labourIds = req.body.labourIds;
    if (!labourIds || !Array.isArray(labourIds)) {
      return res.status(400).json({ error: "Invalid labourIds array" });
    }

    const combinedStatuses = await labourModel.getLabourStatuses(labourIds);
    res.status(200).json(combinedStatuses);
  } catch (error) {
    console.error("Error in controller:", error.message, error.stack);
    res.status(500).json({ error: "Failed to fetch combined statuses" });
  }
}

async function updateHideResubmitLabour(req, res) {
  try {
    const { id } = req.params;
    const { hideResubmit } = req.body;

    const updated = await labourModel.updateHideResubmit(id, hideResubmit);

    if (updated === 0) {
      return res.status(404).json({ error: "Record not found" });
    }
    return res.json({
      success: true,
      message: "hideResubmit updated successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

function roundOvertime(overtimeHours) {
  if (overtimeHours <= 0) return 0;

  const hours = Math.floor(overtimeHours);
  let minutes = Math.round((overtimeHours - hours) * 60);

  if (minutes < 15) {
    minutes = 0;
  } else if (minutes < 45) {
    minutes = 30;
  } else {
    minutes = 0;
    return hours + 1;
  }

  return hours + minutes / 60;
}

async function runDailyAttendanceCron() {
  const job = "runDailyAttendanceCron";
  const cronExecutionDate = new Date().toISOString().split("T")[0];

  const y = new Date();
  y.setDate(y.getDate() - 1);
  const attendanceDate = y.toISOString().split("T")[0];

  const runId = `${job}-${attendanceDate}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const t0 = process.hrtime.bigint();

  // START
  cronLogger.info({
    event: `${job}_start`,
    job,
    runId,
    cron_execution_date: cronExecutionDate,
    attendance_date: attendanceDate,
  });

  try {
    // do the work
    await getAllLaboursAttendanceDaily(attendanceDate);

    // END (success)
    const t1 = process.hrtime.bigint();
    const elapsedMs = Number(t1 - t0) / 1e6;

    cronLogger.info({
      event: `${job}_end_success`,
      job,
      runId,
      cron_execution_date: cronExecutionDate,
      attendance_date: attendanceDate,
      duration_ms: Math.round(elapsedMs),
      duration_hms: formatDuration(elapsedMs),
      message: `Cron job completed successfully for Date: ${attendanceDate}`,
    });
  } catch (error) {
    // END (error)
    const t1 = process.hrtime.bigint();
    const elapsedMs = Number(t1 - t0) / 1e6;

    cronLogger.error({
      event: `${job}_end_error`,
      job,
      runId,
      cron_execution_date: cronExecutionDate,
      attendance_date: attendanceDate,
      duration_ms: Math.round(elapsedMs),
      duration_hms: formatDuration(elapsedMs),
      error_message: error?.message,
      error_stack: error?.stack,
    });

    // rethrow to preserve behavior
    throw error;
  }
}

function parseYMD(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function withTimeout(promise, ms, label = "operation") {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms)
    ),
  ]);
}

function isTransient(err) {
  const code = err?.code || "";
  const num = err?.number;
  const msg = String(err?.message || "").toLowerCase();

  return (
    code === "ETIMEOUT" ||
    code === "ESOCKET" ||
    code === "ECONNRESET" ||
    code === "ECONNABORTED" ||
    msg.includes("timeout") ||
    msg.includes("temporarily unavailable") ||
    (msg.includes("connection") && msg.includes("closed")) ||
    msg.includes("deadlock") ||
    num === 1205 ||
    num === 40501 ||
    num === 40613
  );
}

async function withRetry(
  op,
  { retries = 1, baseMs = 400, maxMs = 2000, factor = 2, label = "op" } = {}
) {
  let attempt = 0;
  while (true) {
    try {
      return await op();
    } catch (err) {
      attempt++;
      const last = attempt > retries;
      if (last || !isTransient(err)) throw err;
      const backoff = Math.min(maxMs, baseMs * Math.pow(factor, attempt - 1));
      const jitter = Math.floor(Math.random() * 150);
      console.warn(
        `[retry] "${label}" failed (attempt ${attempt}/${retries + 1}): ${
          err.message
        }. Retrying in ${backoff + jitter}ms`
      );
      await new Promise((r) => setTimeout(r, backoff + jitter));
    }
  }
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let i = 0,
    active = 0;
  return new Promise((resolve) => {
    const launch = () => {
      if (i >= items.length && active === 0) return resolve(results);
      while (active < limit && i < items.length) {
        const idx = i++;
        active++;
        Promise.resolve()
          .then(() => worker(items[idx], idx))
          .then((r) => {
            results[idx] = r;
          })
          .catch((e) => {
            results[idx] = { error: e };
          })
          .finally(() => {
            active--;
            launch();
          });
      }
    };
    launch();
  });
}

function makeDeviceProjectResolver(labourModel) {
  const cache = new Map();
  return async function getProjectIdCached(deviceId) {
    if (deviceId == null) return null;
    if (cache.has(deviceId)) return cache.get(deviceId);
    const val = await withRetry(
      () =>
        withTimeout(
          labourModel.getProjectIdByDeviceId(deviceId),
          LM_LOOKUP_TIMEOUT_MS,
          `getProjectIdByDeviceId(${deviceId})`
        ),
      { retries: RETRIES_LOOKUP, label: `getProjectIdByDeviceId(${deviceId})` }
    ).catch((e) => {
      console.error(
        `[ATTENDANCE] Device lookup failed for ${deviceId}: ${e.message}`
      );
      return null;
    });
    cache.set(deviceId, val ?? null);
    return val ?? null;
  };
}

async function getAllLaboursAttendanceDaily(attendanceDate) {
  const job = "getAllLaboursAttendanceDaily";
  const runId = `${job}-${attendanceDate}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const t0 = process.hrtime.bigint();

  // START log
  cronLogger.info({
    event: `${job}_start`,
    job,
    runId,
    attendance_date: attendanceDate,
  });

  // helper to emit END log and return result
  const endAndReturn = (status, result, extra = {}) => {
    const t1 = process.hrtime.bigint();
    const elapsedMs = Number(t1 - t0) / 1e6;
    cronLogger.info({
      event: `${job}_end_${status}`, // success | early | error
      job,
      runId,
      attendance_date: attendanceDate,
      duration_ms: Math.round(elapsedMs),
      duration_hms: formatDuration(elapsedMs),
      ...extra,
      ...(result ?? {}),
    });
    return result;
  };

  let processed = 0,
    succeeded = 0,
    failed = 0;

  try {
    cronLogger.info({
      event: `${job}_info_begin`,
      job,
      runId,
      attendance_date: attendanceDate,
    });

    if (!attendanceDate) {
      const err = new Error("attendanceDate is required (YYYY-MM-DD).");
      cronLogger.error({
        event: `${job}_validation_error`,
        job,
        runId,
        attendance_date: attendanceDate,
        error_message: err.message,
      });
      throw err;
    }

    const dateKey = parseYMD(attendanceDate);
    if (!dateKey) {
      const err = new Error(
        `Invalid attendanceDate supplied → ${attendanceDate}`
      );
      cronLogger.error({
        event: `${job}_validation_error`,
        job,
        runId,
        attendance_date: attendanceDate,
        error_message: err.message,
      });
      throw err;
    }

    const target = new Date(attendanceDate);
    const parsedYear = target.getFullYear();
    const parsedMonth = target.getMonth() + 1;
    const processedDay = target.getDate();
    const daysInMonth = new Date(parsedYear, parsedMonth, 0).getDate();
    cronLogger.info({
      event: `${job}_month_info`,
      job,
      runId,
      attendance_date: attendanceDate,
      parsed_year: parsedYear,
      parsed_month: parsedMonth,
      processed_day: processedDay,
      days_in_month: daysInMonth,
    });

    const approvedLabours = await withRetry(
      () =>
        withTimeout(
          labourModel.getAllApprovedLabours(),
          LM_READ_TIMEOUT_MS,
          "getAllApprovedLabours"
        ),
      { retries: RETRIES_READ, label: "getAllApprovedLabours" }
    );

    const approvedCount = Array.isArray(approvedLabours)
      ? approvedLabours.length
      : 0;
    cronLogger.info({
      event: `${job}_approved_labours`,
      job,
      runId,
      attendance_date: attendanceDate,
      approved_labours: approvedCount,
    });

    if (!approvedCount) {
      return endAndReturn(
        "early",
        { processed: 0, succeeded: 0, failed: 0 },
        { note: "no_approved_labours" }
      );
    }

    const getProjectIdCached = makeDeviceProjectResolver(labourModel);

    const worker = async (labour) => {
      processed += 1;
      try {
        const { labourId, workingHours } = labour;
        const shiftHours = workingHours === "FLEXI SHIFT - 9 HRS" ? 9 : 8;
        const halfDayHours = shiftHours === 9 ? 4.5 : 4;

        const punches = await withRetry(
          () =>
            withTimeout(
              labourModel.getESSLAttendance(labourId, attendanceDate),
              LM_READ_TIMEOUT_MS,
              `getESSLAttendance(${labourId}, ${attendanceDate})`
            ),
          { retries: RETRIES_READ, label: `getESSLAttendance(${labourId})` }
        );

        const punchesForDay = (Array.isArray(punches) ? punches : []).filter(
          (p) => parseYMD(p?.punch_date) === dateKey
        );

        const { status, firstPunch, lastPunch, totalHours } = determineStatus(
          punchesForDay,
          shiftHours,
          halfDayHours,
          workingHours
        );

        const OT =
          status === "P" && totalHours > shiftHours
            ? totalHours - shiftHours
            : 0;
        const OTrounded = roundOvertime(OT);
        const OTmanual = Math.min(OTrounded, 4);
        const to2 = (n) => Math.round(Number(n || 0) * 100) / 100;

        const fDev = firstPunch?.Device_id ?? null;
        const lDev = lastPunch?.Device_id ?? null;

        const [projFP, projLP] = await Promise.all([
          getProjectIdCached(fDev),
          lDev ? getProjectIdCached(lDev) : Promise.resolve(null),
        ]);

        const detailRow = {
          labourId,
          projectName: Number.isFinite(Number(labour.projectName))
            ? Number(labour.projectName)
            : null,
          date: dateKey,
          firstPunch: firstPunch
            ? formatTimeToHoursMinutes(firstPunch.punch_time)
            : null,
          firstPunchAttendanceId: firstPunch?.attendance_id ?? null,
          firstPunchDeviceId: fDev,
          lastPunch: lastPunch
            ? formatTimeToHoursMinutes(lastPunch.punch_time)
            : null,
          lastPunchAttendanceId: lastPunch?.attendance_id ?? null,
          lastPunchDeviceId: lDev,
          totalHours: to2(totalHours),
          overtime: to2(OT),
          PayrollCalRoundOffOvertime: to2(OTrounded),
          OvertimeManually: to2(OTmanual),
          status,
          creationDate: new Date(),
          projectIdFromDevicefirstPunch: projFP ?? null,
          projectIdFromDeviceLastPunch: projLP ?? null,
        };

        await withRetry(
          () =>
            withTimeout(
              labourModel.insertIntoLabourAttendanceDetails(detailRow),
              LM_WRITE_TIMEOUT_MS,
              `insertIntoLabourAttendanceDetails(${labourId}, ${dateKey})`
            ),
          {
            retries: RETRIES_WRITE,
            label: `insertIntoLabourAttendanceDetails(${labourId})`,
          }
        );

        const summary = {
          labourId,
          projectName: detailRow.projectName,
          totalDays: processedDay,
          presentDays: status === "P" ? 1 : 0,
          halfDays: status === "HD" ? 1 : 0,
          missPunchDays: status === "MP" ? 1 : 0,
          absentDays:
            status !== "P" && status !== "HD" && status !== "MP" ? 1 : 0,
          totalOvertimeHours: detailRow.overtime,
          PayrollCalRoundoffTotalOvertime: detailRow.PayrollCalRoundOffOvertime,
          RoundOffTotalOvertime: detailRow.PayrollCalRoundOffOvertime,
          TotalOvertimeHoursManually: detailRow.OvertimeManually,
          shift: workingHours,
          creationDate: new Date(),
          selectedMonth: `${parsedYear}-${String(parsedMonth).padStart(
            2,
            "0"
          )}`,
        };

        await withRetry(
          () =>
            withTimeout(
              labourModel.insertIntoLabourAttendanceSummary(summary),
              LM_WRITE_TIMEOUT_MS,
              `insertIntoLabourAttendanceSummary(${labourId}, ${dateKey})`
            ),
          {
            retries: RETRIES_WRITE,
            label: `insertIntoLabourAttendanceSummary(${labourId})`,
          }
        );

        succeeded += 1;
        return { ok: true, labourId };
      } catch (err) {
        failed += 1;
        cronLogger.error({
          event: `${job}_worker_error`,
          job,
          runId,
          attendance_date: attendanceDate,
          labour_id: labour?.labourId ?? null,
          error_message: err?.message,
        });
        return { ok: false, labourId: labour?.labourId, error: err };
      }
    };

    await mapWithConcurrency(approvedLabours, LABOUR_CONCURRENCY, worker);

    // END success with totals
    return endAndReturn("success", {
      processed,
      succeeded,
      failed,
    });
  } catch (error) {
    // END error
    return endAndReturn("error", {
      processed,
      succeeded,
      failed,
      error_message: error?.message,
    });
  }
}

async function getAttendance(req, res) {
  try {
    const { labourId } = req.params;
    const { month, year } = req.query;

    if (!labourId || !month || !year) {
      return res
        .status(400)
        .json({ message: "LabourId, Month, and Year are required" });
    }

    const parsedMonth = parseInt(month, 10);
    const parsedYear = parseInt(year, 10);

    if (isNaN(parsedMonth) || isNaN(parsedYear)) {
      return res.status(400).json({ message: "Invalid month or year" });
    }

    const labour = await labourModel.getLabourDetailsById(labourId);

    if (!labour) {
      return res.status(404).json({ message: "Labour not found" });
    }

    const { workingHours } = labour;
    const shiftHours = workingHours === "FLEXI SHIFT - 9 HRS" ? 9 : 8;
    const halfDayHours = shiftHours === 9 ? 4.5 : 4;

    const daysInMonth = new Date(parsedYear, parsedMonth, 0).getDate();

    let presentDays = 0,
      halfDays = 0,
      missPunchDays = 0,
      absentDays = 0;
    let totalOvertimeHours = 0,
      roundOffTotalOvertime = 0,
      PayrollCalRoundoffTotalOvertime = 0;
    let totalManualOvertimeManually = 0;
    let monthlyAttendance = [];

    const labourAttendance = await labourModel.getAttendanceByLabourId(
      labourId,
      parsedMonth,
      parsedYear
    );

    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${parsedYear}-${String(parsedMonth).padStart(
        2,
        "0"
      )}-${String(day).padStart(2, "0")}`;
      const punchesForDay = labourAttendance.filter(
        (att) => new Date(att.punch_date).toISOString().split("T")[0] === date
      );

      let { status, firstPunch, lastPunch, totalHours } = determineStatus(
        punchesForDay,
        shiftHours,
        halfDayHours,
        workingHours
      );

      let overtime = 0,
        dailyRoundOffOvertime = 0;
      let firstPunchAttendanceId = null,
        firstPunchDeviceId = null;
      let lastPunchAttendanceId = null,
        lastPunchDeviceId = null;
      let projectIdFromDevicefirstPunch = null;
      let projectIdFromDeviceLastPunch = null;

      if (firstPunch) {
        firstPunchAttendanceId = firstPunch.attendance_id;
        firstPunchDeviceId = firstPunch.Device_id;
        if (firstPunchDeviceId) {
          projectIdFromDevicefirstPunch =
            await labourModel.getProjectIdByDeviceId(firstPunchDeviceId);
        }
      }

      if (lastPunch) {
        lastPunchAttendanceId = lastPunch.attendance_id;
        lastPunchDeviceId = lastPunch.Device_id;
        if (lastPunchDeviceId) {
          projectIdFromDeviceLastPunch =
            await labourModel.getProjectIdByDeviceId(lastPunchDeviceId);
        }
      }

      if (status === "P") {
        overtime = totalHours > shiftHours ? totalHours - shiftHours : 0;
      }

      dailyRoundOffOvertime = roundOvertime(overtime);

      let OvertimeManually =
        dailyRoundOffOvertime > 4 ? 4 : dailyRoundOffOvertime;

      switch (status) {
        case "P":
          presentDays++;
          break;
        case "HD":
          halfDays++;
          break;
        case "MP":
          missPunchDays++;
          break;
        case "A":
          absentDays++;
          break;
        default:
          absentDays++;
      }

      totalOvertimeHours += overtime;
      PayrollCalRoundoffTotalOvertime += roundOvertime(overtime);
      roundOffTotalOvertime += dailyRoundOffOvertime;
      totalManualOvertimeManually += OvertimeManually;

      const safeTotalHours =
        typeof totalHours === "number" && !isNaN(totalHours) ? totalHours : 0;

      monthlyAttendance.push({
        labourId,
        projectName: parseInt(labour.projectName, 10),
        date,
        firstPunch: firstPunch
          ? formatTimeToHoursMinutes(firstPunch.punch_time)
          : null,
        firstPunchAttendanceId,
        firstPunchDeviceId,
        lastPunch: lastPunch
          ? formatTimeToHoursMinutes(lastPunch.punch_time)
          : null,
        lastPunchAttendanceId,
        lastPunchDeviceId,
        totalHours: safeTotalHours.toFixed(2),
        overtime: overtime.toFixed(2),
        PayrollCalRoundOffOvertime: dailyRoundOffOvertime.toFixed(2),
        OvertimeManually: OvertimeManually.toFixed(2),
        status,
        creationDate: new Date(),
        projectIdFromDevicefirstPunch,
        projectIdFromDeviceLastPunch,
      });
    }

    const summary = {
      labourId,
      projectName: parseInt(labour.projectName, 10),
      totalDays: daysInMonth,
      presentDays,
      halfDays,
      missPunchDays,
      absentDays,
      totalOvertimeHours: parseFloat(totalOvertimeHours.toFixed(2)),
      PayrollCalRoundoffTotalOvertime: parseFloat(
        PayrollCalRoundoffTotalOvertime.toFixed(2)
      ),
      RoundOffTotalOvertime: parseFloat(roundOffTotalOvertime.toFixed(2)),
      TotalOvertimeHoursManually: parseFloat(
        totalManualOvertimeManually.toFixed(2)
      ),
      shift: workingHours,
      creationDate: new Date(),
      selectedMonth: `${parsedYear}-${String(parsedMonth).padStart(2, "0")}`,
    };

    res.status(200).json({
      message: "Attendance processed successfully",
      summary,
      monthlyAttendance,
    });
  } catch (err) {
    console.error("Error processing attendance:", err);
    res.status(500).json({ message: "Error processing attendance" });
  }
}

function formatTimeToHoursMinutes(timeString) {
  try {
    const date = new Date(timeString);
    if (isNaN(date.getTime())) return "-";
    const hours = date.getUTCHours().toString().padStart(2, "0");
    const minutes = date.getUTCMinutes().toString().padStart(2, "0");
    const seconds = date.getUTCSeconds().toString().padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
  } catch (error) {
    return "-";
  }
}

function calculateHoursWorked(punchDate, firstPunch, lastPunch) {
  try {
    const punchDateStr = punchDate.toISOString().split("T")[0];
    const punchInTime = new Date(
      `${punchDateStr}T${firstPunch.toISOString().split("T")[1]}`
    );
    const punchOutTime = new Date(
      `${punchDateStr}T${lastPunch.toISOString().split("T")[1]}`
    );

    const totalHours = (punchOutTime - punchInTime) / (1000 * 60 * 60);

    if (isNaN(totalHours) || totalHours < 0) {
      console.warn(
        `Invalid totalHours calculated. Setting to 0. Details: punchDate=${punchDate}, firstPunch=${firstPunch}, lastPunch=${lastPunch}`
      );
      return 0;
    }

    return parseFloat(totalHours.toFixed(2));
  } catch (error) {
    console.error(`Error in calculateHoursWorked: ${error.message}`);
    return 0;
  }
}

const calculateTimeDifferenceInMinutes = (firstPunchTime, lastPunchTime) => {
  const diffMs = lastPunchTime - firstPunchTime;
  return diffMs / (1000 * 60);
};

const determineStatus = (punches, workingHours) => {
  let status = "A";
  let misPunch = false;
  let consideredLastPunch = null;
  let totalHours = 0;

  if (!punches || punches.length === 0) {
    return { status, firstPunch: null, lastPunch: null, misPunch, totalHours };
  }

  punches.sort((a, b) => new Date(a.punch_time) - new Date(b.punch_time));

  const firstPunch = punches[0];
  const lastPunch = punches[punches.length - 1];

  const firstPunchTime = new Date(firstPunch.punch_time);
  const lastPunchTime = new Date(lastPunch.punch_time);

  const gapMinutes = calculateTimeDifferenceInMinutes(
    firstPunchTime,
    lastPunchTime
  );

  if (gapMinutes < 15) {
    misPunch = true;
  } else {
    consideredLastPunch = lastPunch;
  }

  if (misPunch) {
    status = "MP";
  } else {
    if (consideredLastPunch) {
      totalHours = calculateHoursWorked(
        new Date(firstPunch.punch_date),
        firstPunchTime,
        lastPunchTime
      );
    } else {
      totalHours = 0;
    }

    const pThreshold = workingHours === "FLEXI SHIFT - 9 HRS" ? 4.5 : 4;
    const hdThreshold = 2;
    const aThreshold = 0.25;

    if (totalHours > pThreshold) {
      status = "P";
    } else if (totalHours > hdThreshold && totalHours <= pThreshold) {
      status = "HD";
    } else if (totalHours > aThreshold && totalHours <= hdThreshold) {
      status = "A";
    } else {
      status = "MP";
    }
  }

  return {
    status,
    firstPunch,
    lastPunch: consideredLastPunch,
    misPunch,
    totalHours,
  };
};

async function getAllLaboursAttendance(req, res) {
  try {
    const { month, year } = req.query;

    if (!month || !year) {
      return res.status(400).json({ message: "Month and Year are required" });
    }

    const parsedMonth = parseInt(month, 10);
    const parsedYear = parseInt(year, 10);

    if (isNaN(parsedMonth) || isNaN(parsedYear)) {
      return res.status(400).json({ message: "Invalid month or year" });
    }

    const approvedLabours =
      await labourModel.getAllApprovedOrMonthlyDisabledLabours(
        parsedMonth,
        parsedYear
      );

    if (!approvedLabours || approvedLabours.length === 0) {
      return res.status(404).json({ message: "No approved labours found" });
    }

    const daysInMonth = new Date(parsedYear, parsedMonth, 0).getDate();

    for (let labour of approvedLabours) {
      const { labourId, workingHours } = labour;
      const shiftHours = workingHours === "FLEXI SHIFT - 9 HRS" ? 9 : 8;
      const halfDayHours = shiftHours === 9 ? 4.5 : 4;

      let presentDays = 0,
        halfDays = 0,
        missPunchDays = 0,
        absentDays = 0;
      let totalOvertimeHours = 0,
        roundOffTotalOvertime = 0,
        PayrollCalRoundoffTotalOvertime = 0;
      let totalManualOvertimeManually = 0;
      let monthlyAttendance = [];

      const labourAttendance = await labourModel.getAttendanceByLabourId(
        labourId,
        parsedMonth,
        parsedYear
      );

      for (let day = 1; day <= daysInMonth; day++) {
        const date = `${parsedYear}-${String(parsedMonth).padStart(
          2,
          "0"
        )}-${String(day).padStart(2, "0")}`;
        const punchesForDay = labourAttendance.filter(
          (att) => new Date(att.punch_date).toISOString().split("T")[0] === date
        );

        let { status, firstPunch, lastPunch, totalHours } = determineStatus(
          punchesForDay,
          shiftHours,
          halfDayHours,
          workingHours
        );

        let overtime = 0,
          dailyRoundOffOvertime = 0;
        let firstPunchAttendanceId = null,
          firstPunchDeviceId = null;
        let lastPunchAttendanceId = null,
          lastPunchDeviceId = null;
        let projectIdFromDevicefirstPunch = null;
        let projectIdFromDeviceLastPunch = null;

        if (firstPunch) {
          firstPunchAttendanceId = firstPunch.attendance_id;
          firstPunchDeviceId = firstPunch.Device_id;
          if (firstPunchDeviceId) {
            projectIdFromDevicefirstPunch =
              await labourModel.getProjectIdByDeviceId(firstPunchDeviceId);
          }
        }

        if (lastPunch) {
          lastPunchAttendanceId = lastPunch.attendance_id;
          lastPunchDeviceId = lastPunch.Device_id;
          if (lastPunchDeviceId) {
            projectIdFromDeviceLastPunch =
              await labourModel.getProjectIdByDeviceId(lastPunchDeviceId);
          }
        }

        // ✅ **Overtime Calculation**
        if (status === "P") {
          overtime = totalHours > shiftHours ? totalHours - shiftHours : 0;
        }

        // ✅ **Overtime Rounding**
        dailyRoundOffOvertime = roundOvertime(overtime);

        // ✅ **Limit OvertimeManually to 4 hours**
        let OvertimeManually =
          dailyRoundOffOvertime > 4 ? 4 : dailyRoundOffOvertime;

        // ✅ **Update Counters**
        switch (status) {
          case "P":
            presentDays++;
            break;
          case "HD":
            halfDays++;
            break;
          case "MP":
            missPunchDays++;
            break;
          case "A":
            absentDays++;
            break;
          default:
            absentDays++;
        }

        totalOvertimeHours += overtime;
        PayrollCalRoundoffTotalOvertime += roundOvertime(overtime);
        roundOffTotalOvertime += dailyRoundOffOvertime;
        totalManualOvertimeManually += OvertimeManually;

        const safeTotalHours =
          typeof totalHours === "number" && !isNaN(totalHours) ? totalHours : 0;

        // ✅ **Prepare Attendance Data**
        monthlyAttendance.push({
          labourId,
          projectName: parseInt(labour.projectName, 10),
          date,
          firstPunch: firstPunch
            ? formatTimeToHoursMinutes(firstPunch.punch_time)
            : null,
          firstPunchAttendanceId,
          firstPunchDeviceId,
          lastPunch: lastPunch
            ? formatTimeToHoursMinutes(lastPunch.punch_time)
            : null,
          lastPunchAttendanceId,
          lastPunchDeviceId,
          totalHours: safeTotalHours.toFixed(2),
          overtime: overtime.toFixed(2),
          PayrollCalRoundOffOvertime: dailyRoundOffOvertime.toFixed(2),
          OvertimeManually: OvertimeManually.toFixed(2),
          status,
          creationDate: new Date(),
          projectIdFromDevicefirstPunch,
          projectIdFromDeviceLastPunch,
        });
      }

      // ✅ **Prepare Summary**
      const summary = {
        labourId,
        projectName: parseInt(labour.projectName, 10),
        totalDays: daysInMonth,
        presentDays,
        halfDays,
        missPunchDays,
        absentDays,
        totalOvertimeHours: parseFloat(totalOvertimeHours.toFixed(2)),
        PayrollCalRoundoffTotalOvertime: parseFloat(
          PayrollCalRoundoffTotalOvertime.toFixed(2)
        ),
        RoundOffTotalOvertime: parseFloat(roundOffTotalOvertime.toFixed(2)),
        TotalOvertimeHoursManually: parseFloat(
          totalManualOvertimeManually.toFixed(2)
        ),
        shift: workingHours,
        creationDate: new Date(),
        selectedMonth: `${parsedYear}-${String(parsedMonth).padStart(2, "0")}`,
      };
      // ✅ **Insert Summary & Attendance**
      await labourModel.insertIntoLabourAttendanceSummary(summary);
      for (let dayAttendance of monthlyAttendance) {
        await labourModel.insertIntoLabourAttendanceDetails(dayAttendance);
      }
    }
    res.status(200).json({ message: "Attendance processed successfully" });
  } catch (err) {
    console.error("Error processing attendance:", err);
    res.status(500).json({ message: "Error processing attendance" });
  }
}

async function getCachedAttendance(req, res) {
  try {
    if (!cachedAttendance) {
      return res
        .status(404)
        .json({ message: "No cached attendance data available" });
    }
    logger.info("Returning cached attendance data to frontend");
    res.json(cachedAttendance);
  } catch (err) {
    logger.error("Error getting cached attendance data", err);
    res.status(500).json({ message: "Error getting cached attendance data" });
  }
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const msR = Math.floor(ms % 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return (
    String(h).padStart(2, "0") +
    ":" +
    String(m).padStart(2, "0") +
    ":" +
    String(sec).padStart(2, "0") +
    "." +
    String(msR).padStart(3, "0")
  );
}

async function runAttendanceCronEssl() {
  // derive dates
  const execDateIso = new Date().toISOString().split("T")[0];
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const formattedYesterday = yesterday.toISOString().split("T")[0];

  // timing
  const startHr = process.hrtime.bigint();
  // optional: a run id to correlate logs for this invocation
  const runId = `${execDateIso}-${Math.random().toString(36).slice(2, 8)}`;

  // START log
  cronLogger.info({
    msg: "runAttendanceCronEssl START",
    runId,
    job: "runAttendanceCronEssl",
    cronExecutionDate: execDateIso,
    attendanceDate: formattedYesterday,
  });

  try {
    // main work
    await labourModel.saveEsslAttendance(formattedYesterday, cronLogger);

    // END (success) log
    const endHr = process.hrtime.bigint();
    const elapsedMs = Number(endHr - startHr) / 1e6;
    cronLogger.info({
      msg: "runAttendanceCronEssl END (success)",
      runId,
      job: "runAttendanceCronEssl",
      cronExecutionDate: execDateIso,
      attendanceDate: formattedYesterday,
      duration_ms: Math.round(elapsedMs),
      duration_hms: formatDuration(elapsedMs),
    });
  } catch (err) {
    // END (error) log
    const endHr = process.hrtime.bigint();
    const elapsedMs = Number(endHr - startHr) / 1e6;
    cronLogger.error({
      msg: "runAttendanceCronEssl ERROR",
      runId,
      job: "runAttendanceCronEssl",
      cronExecutionDate: execDateIso,
      attendanceDate: formattedYesterday,
      duration_ms: Math.round(elapsedMs),
      duration_hms: formatDuration(elapsedMs),
      error: {
        message: err?.message,
        stack: err?.stack,
      },
    });
    throw err;
  }
}

async function submitAttendanceController(req, res) {
  try {
    const { labourId, punchType, punchDate, punchTime } = req.body;

    if (!labourId || !punchType || !punchDate || !punchTime) {
      return res.status(400).json({ message: "All fields are required." });
    }

    // Fetch existing miss punch count for the labour
    const labourPunchCount = await labourModel.getMissPunchCount(
      labourId,
      punchDate
    );

    if (!labourPunchCount) {
      return res.status(404).json({ message: "Labour data not found." });
    }

    // Check if miss punch entries exceed the limit of 3
    if (labourPunchCount.missPunchCount >= 3) {
      // Route to admin for approval
      const adminApproval = await labourModel.addApprovalRequest(
        labourId,
        punchType,
        punchDate,
        punchTime
      );
      if (adminApproval) {
        return res
          .status(200)
          .json({ message: "Punch entry sent for admin approval." });
      } else {
        return res
          .status(500)
          .json({ message: "Failed to send for admin approval." });
      }
    }

    // If within limit, add the punch directly
    const success = await labourModel.addMissPunch(
      labourId,
      punchType,
      punchDate,
      punchTime
    );
    if (success) {
      return res
        .status(200)
        .json({ message: "Punch entry added successfully." });
    } else {
      return res.status(500).json({ message: "Failed to add punch entry." });
    }
  } catch (error) {
    logger.error("Error handling punch entry:", error);
    res.status(500).json({ message: "Error handling punch entry." });
  }
}

async function addWeeklyOff(req, res) {
  try {
    const { LabourID, offDate, addedBy } = req.body;

    if (!LabourID || !offDate) {
      return res
        .status(400)
        .json({ message: "Labour ID and Off Date are required." });
    }

    // Check if the weekly off already exists
    const existingOff = await labourModel.getWeeklyOff(LabourID, offDate);
    if (existingOff) {
      return res
        .status(409)
        .json({ message: "Weekly off already exists for this date." });
    }

    // Add the weekly off to the database
    const success = await labourModel.addWeeklyOff(LabourID, offDate, addedBy);
    if (success) {
      return res
        .status(200)
        .json({ message: "Weekly off added successfully." });
    } else {
      return res.status(500).json({ message: "Failed to add weekly off." });
    }
  } catch (err) {
    console.error("Error adding weekly off:", err);
    res.status(500).json({ message: "Error adding weekly off." });
  }
}

async function isWeeklyOff(LabourID, date) {
  try {
    const result = await labourModel.getWeeklyOff(LabourID, date);
    return !!result;
  } catch (err) {
    console.error("Error checking if date is a weekly off", err);
    throw new Error("Error checking if date is a weekly off");
  }
}

async function saveWeeklyOffs(req, res) {
  try {
    const { LabourID, month, year, weeklyOffCount } = req.body;

    if (!LabourID || !month || !year || weeklyOffCount === undefined) {
      return res.status(400).json({
        message: "Labour ID, month, year, and weekly off count are required.",
      });
    }

    // Calculate Sundays for the month
    const sundays = [];
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day);
      if (date.getDay() === 0) {
        sundays.push(date.toISOString().split("T")[0]);
      }
    }

    // Adjust the Sundays based on the weeklyOffCount
    const weeklyOffDates = sundays.slice(0, weeklyOffCount);

    // Save the weekly offs to the database
    const success = await labourModel.saveWeeklyOffs(LabourID, weeklyOffDates);
    if (success) {
      return res
        .status(200)
        .json({ message: "Weekly offs saved successfully." });
    } else {
      return res.status(500).json({ message: "Failed to save weekly offs." });
    }
  } catch (err) {
    console.error("Error saving weekly offs:", err);
    res.status(500).json({ message: "Error saving weekly offs." });
  }
}

async function getDisabledMonthsAndYears(req, res) {
  try {
    const pool = await poolPromise;

    // SQL Query to extract distinct years and months from SelectedMonth
    const result = await pool.request().query(`
            SELECT DISTINCT 
                CAST(LEFT(SelectedMonth, 4) AS INT) AS Year, -- Extract year (first 4 characters)
                CAST(RIGHT(SelectedMonth, 2) AS INT) AS Month -- Extract month (last 2 characters)
            FROM [dbo].[LabourAttendanceSummary];
        `);

    // Map the results to return only month and year
    const disabledPeriods = result.recordset.map((record) => ({
      month: record.Month,
      year: record.Year,
    }));

    // Send the response
    res.status(200).json(disabledPeriods);
  } catch (err) {
    console.error("Error fetching disabled months and years:", err);

    // Send a proper error response
    res.status(500).json({
      message: "Error fetching disabled months and years",
      error: err.message,
    });
  }
}

async function deleteAttendance(req, res) {
  const { month, year } = req.body;

  if (!month || !year) {
    return res.status(400).json({ message: "Month and Year are required" });
  }

  try {
    // Delete records from LabourAttendanceDetails
    await labourModel.deleteAttendanceDetails(month, year);
    // Delete records from LabourAttendanceSummary
    await labourModel.deleteAttendanceSummary(month, year);

    res.status(200).json({ message: "Attendance deleted successfully" });
  } catch (error) {
    console.error("Error deleting attendance:", error);
    res.status(500).json({ message: "Error deleting attendance", error });
  }
}

async function getAttendanceSummary(req, res) {
  try {
    const summary = await labourModel.fetchAttendanceSummary();
    res.status(200).json(summary);
  } catch (error) {
    console.error("Error fetching attendance summary:", error);
    res.status(500).json({ message: "Error fetching attendance summary" });
  }
}

async function getAttendanceDetails(req, res) {
  const { month, year } = req.query;

  if (!month || !year) {
    return res.status(400).json({ message: "Month and Year are required" });
  }

  try {
    const details = await labourModel.fetchAttendanceDetailsByMonthYear(
      month,
      year
    );
    res.status(200).json(details);
  } catch (error) {
    console.error("Error fetching attendance details:", error);
    res.status(500).json({ message: "Error fetching attendance details" });
  }
}

async function getAttendanceDetailsForSingleLabour(req, res) {
  const { id: labourId } = req.params;
  const { month, year } = req.query;

  if (!labourId || !month || !year) {
    return res
      .status(400)
      .json({ message: "Labour ID, Month, and Year are required" });
  }

  try {
    const details =
      await labourModel.fetchAttendanceDetailsByMonthYearForSingleLabour(
        labourId,
        month,
        year
      );
    res.status(200).json(details);
  } catch (error) {
    console.error(
      "Error fetching attendance details for a single labour:",
      error
    );
    res.status(500).json({ message: "Error fetching attendance details" });
  }
}

async function getAttendanceCalenderSingleLabour(req, res) {
  const { id: labourId } = req.params;
  const { month, year } = req.query;

  if (!labourId || !month || !year) {
    return res
      .status(400)
      .json({ message: "Labour ID, Month, and Year are required" });
  }

  try {
    const details = await labourModel.showAttendanceCalenderSingleLabour(
      labourId,
      month,
      year
    );
    res.status(200).json(details);
  } catch (error) {
    console.error(
      "Error fetching attendance details for a single labour:",
      error
    );
    res.status(500).json({ message: "Error fetching attendance details" });
  }
}

async function saveAttendance(req, res) {
  const { labourId, month, year, attendance } = req.body;

  if (!labourId || !month || !year || !attendance) {
    return res.status(400).json({
      message:
        "Invalid input: Labour ID, Month, Year, and Attendance data are required",
    });
  }

  try {
    await labourModel.saveFullMonthAttendance(
      labourId,
      month,
      year,
      attendance
    );
    res.status(200).json({ message: "Attendance saved successfully" });
  } catch (error) {
    console.error("Error saving attendance:", error);
    res.status(500).json({ message: "Error saving attendance" });
  }
}

async function getAttendanceByMonthYear(req, res) {
  const { month, year } = req.query;

  if (!month || !year) {
    return res.status(400).json({ message: "Month and Year are required" });
  }

  try {
    const attendance = await labourModel.fetchAttendanceByMonthYear(
      month,
      year
    );
    res.status(200).json(attendance);
  } catch (error) {
    console.error("Error fetching attendance by month and year:", error);
    res.status(500).json({ message: "Error fetching attendance data" });
  }
}

async function upsertAttendance(req, res) {
  const {
    labourId,
    date,
    AttendanceId,
    firstPunchManually,
    lastPunchManually,
    overtimeManually,
    remarkManually,
    workingHours,
    onboardName,
    AttendanceStatus,
    markWeeklyOff,
    updatedFields,
    userType,
  } = req.body;

  console.log("req.body for attendance--->", req.body);

  if (!labourId || !date) {
    return res
      .status(400)
      .json({ message: "Labour ID and Date are required." });
  }

  const pool = await poolPromise;

  const checkAdminApproval = await pool
    .request()
    .input("labourId", sql.NVarChar, labourId)
    .input("AttendanceId", sql.Int, AttendanceId).query(`
            SELECT *
            FROM [LabourAttendanceApproval]
            WHERE LabourID = @labourId AND AttendanceId = @AttendanceId AND ApprovalStatus = 'Pending'
        `);

  if (checkAdminApproval.recordset.length > 0) {
    return res
      .status(400)
      .json({ message: "Attendance is Already Pending with Admin Approval." });
  }

  const checkUserApproval = await pool
    .request()
    .input("labourId", sql.NVarChar, labourId)
    .input("AttendanceId", sql.Int, AttendanceId)
    .input("userType", sql.NVarChar, userType).query(`
            SELECT *
            FROM [LabourAttendanceApproval]
            WHERE LabourID = @labourId AND AttendanceId = @AttendanceId AND ApprovalStatus = 'Pending' AND userType = @userType
        `);

  if (checkUserApproval.recordset.length > 0) {
    return res
      .status(400)
      .json({ message: "Attendance is Already Pending with User Approval." });
  }

  if (
    !firstPunchManually &&
    !lastPunchManually &&
    (!overtimeManually || String(overtimeManually).trim() === "")
  ) {
    return res.status(400).json({
      message:
        "At least one of Overtime, First Punch, or Last Punch must be provided.",
    });
  }

  if (
    AttendanceId === undefined ||
    AttendanceId === null ||
    isNaN(AttendanceId)
  ) {
    console.error("Invalid AttendanceId:", AttendanceId);
    return res.status(400).json({
      message: "AttendanceId must be a valid number and cannot be empty.",
    });
  }

  try {
    let finalOnboardName = Array.isArray(onboardName)
      ? onboardName.filter((name) => name !== "null" && name.trim() !== "")[0]
      : onboardName;

    const timesUpdated = await labourModel.getTimesUpdateForMonth(
      labourId,
      date
    );

    // ⛱️ Weekly Off logic (always directly upsert)
    if (markWeeklyOff === true) {
      await labourModel.upsertAttendance({
        labourId,
        date,
        firstPunchManually,
        lastPunchManually,
        overtimeManually,
        remarkManually,
        workingHours,
        onboardName: finalOnboardName,
        editUserName: finalOnboardName,
        markWeeklyOff,
        updatedFields,
      });

      return res
        .status(200)
        .json({ message: "Attendance updated successfully." });
    }

    // 👷‍♂️ USER APPROVAL Conditions for ENC user
    const isEncUser = userType === "ENC";
    const needsUserApproval =
      (isEncUser && AttendanceStatus !== "MP") ||
      (isEncUser && overtimeManually) ||
      (isEncUser && AttendanceStatus === "MP" && timesUpdated >= 3);

    if (needsUserApproval) {
      await labourModel.markAttendanceForApproval(
        AttendanceId,
        labourId,
        date,
        overtimeManually,
        firstPunchManually,
        lastPunchManually,
        remarkManually,
        finalOnboardName,
        markWeeklyOff,
        updatedFields,
        userType
      );

      return res
        .status(200)
        .json({ message: "Attendance sent To USER APPROVAL." });
    }

    // 👮‍♂️ ADMIN APPROVAL Conditions
    const needsAdminApproval =
      AttendanceStatus !== "MP" ||
      (AttendanceStatus === "MP" && timesUpdated >= 3);

    if (needsAdminApproval) {
      await labourModel.markAttendanceForApproval(
        AttendanceId,
        labourId,
        date,
        overtimeManually,
        firstPunchManually,
        lastPunchManually,
        remarkManually,
        finalOnboardName,
        markWeeklyOff,
        updatedFields,
        userType
      );

      return res
        .status(200)
        .json({ message: "Attendance sent To ADMIN APPROVAL." });
    }

    // ✅ Final: Direct Save if no approvals needed
    await labourModel.upsertAttendance({
      labourId,
      date,
      firstPunchManually,
      lastPunchManually,
      overtimeManually,
      remarkManually,
      workingHours,
      onboardName: finalOnboardName,
      editUserName: finalOnboardName,
      markWeeklyOff,
      AttendanceStatus,
    });

    return res
      .status(200)
      .json({ message: "Attendance updated successfully." });
  } catch (error) {
    console.error("Error updating attendance:", error);
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
}

async function approveAttendanceController(req, res) {
  const { AttendanceId } = req.query;
  if (!AttendanceId) {
    return res.status(400).json({ message: "id is required." });
  }

  try {
    const result = await labourModel.approveAttendance(AttendanceId);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in approving attendance:", error);
    res.status(error.statusCode || 500).json({ message: error.message });
  }
}

async function rejectAttendanceControllerAdmin(req, res) {
  const { AttendanceId, rejectReason } = req.query;
  if (!AttendanceId) {
    return res.status(400).json({ message: "id is required." });
  }

  try {
    const result = await labourModel.rejectAttendanceAdmin(
      AttendanceId,
      rejectReason
    );
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in approving attendance:", error);
    res.status(error.statusCode || 500).json({ message: error.message });
  }
}

async function rejectAttendanceController(req, res) {
  const { AttendanceId, rejectReason } = req.query;

  if (isNaN(AttendanceId)) {
    return res.status(400).json({ message: "Invalid attendance ID." });
  }

  if (!rejectReason || rejectReason.trim() === "") {
    return res.status(400).json({ message: "Reject reason is required." });
  }

  try {
    const success = await labourModel.rejectAttendance(
      AttendanceId,
      rejectReason
    ); // Call model function
    if (success) {
      res.json({ success: true, message: "Attendance rejected successfully." });
    } else {
      res
        .status(404)
        .json({ message: "Attendance not found or already rejected." });
    }
  } catch (error) {
    console.error("Error rejecting attendance:", error);
    res.status(500).json({ message: error.message });
  }
}

const exportAttendance = async (req, res) => {
  try {
    const { startDate, endDate, projectName, department } = req.query;

    if (!startDate || !endDate || !projectName) {
      return res.status(400).json({
        message:
          "Missing required parameters: startDate, endDate, or projectId.",
      });
    }

    // Fetch attendance data filtered by date range and projectId
    const attendanceData = await labourModel.getAttendanceByDateRange(
      projectName,
      startDate,
      endDate,
      department
    );

    if (attendanceData.length === 0) {
      return res.status(404).json({
        message: "No attendance data found for the selected criteria.",
      });
    }

    // Create Excel workbook and worksheet
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(attendanceData);
    xlsx.utils.book_append_sheet(workbook, worksheet, "Labour Attendance");

    // Generate Excel file as buffer
    const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });

    // Set headers and send response
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=attendance.xlsx"
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.send(buffer);
  } catch (error) {
    console.error("Error exporting attendance:", error);
    res.status(500).json({ message: "Error exporting attendance data." });
  }
};

const importAttendance = async (req, res) => {
  try {
    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet);

    const convertExcelDate = (serial) => {
      const utcDays = Math.floor(serial - 25569);
      const utcValue = utcDays * 86400;
      const dateInfo = new Date(utcValue * 1000);
      return dateInfo.toISOString().split("T")[0]; // Format YYYY-MM-DD
    };

    const validData = data.map((row) => ({
      ...row,
      Date:
        typeof row.Date === "number" ? convertExcelDate(row.Date) : row.Date,
    }));

    const { matchedRows, unmatchedRows } = await labourModel.getMatchedRows(
      validData
    );

    // Update matched rows in bulk
    if (matchedRows.length > 0) {
      await labourModel.updateMatchedRows(matchedRows);
    }

    // Insert unmatched rows in bulk
    if (unmatchedRows.length > 0) {
      await labourModel.insertUnmatchedRows(unmatchedRows);
    }

    const groups = {};
    validData.forEach((row) => {
      const labourId = row.LabourId;
      const selectedMonth = row.Date.substring(0, 7);
      const key = `${labourId}_${selectedMonth}`;
      groups[key] = { labourId, selectedMonth };
    });

    for (const key in groups) {
      await labourModel.updateTotalOvertimeHours(
        groups[key].labourId,
        groups[key].selectedMonth
      );
    }

    res.send({
      message: "Data imported successfully",
      matchedRows: matchedRows.length,
      unmatchedRows: unmatchedRows.length,
    });
  } catch (error) {
    console.error("Error importing data:", error);
    res.status(500).send({ message: error.message });
  }
};

async function LabourAttendanceApproval(req, res) {
  try {
    const summary = await labourModel.LabourAttendanceApprovalModel();
    res.status(200).json(summary);
  } catch (error) {
    console.error("Error fetching attendance Attendance Approval:", error);
    res.status(500).json({ message: "Error fetching Attendance Approval" });
  }
}

const getLabourMonthlyWages = async (req, res) => {
  try {
    const wages = await labourModel.getLabourMonthlyWages();
    res.status(200).json(wages);
  } catch (error) {
    res.status(500).json({ message: "Error fetching wages", error });
  }
};

const upsertLabourMonthlyWages = async (req, res) => {
  try {
    const payload = req.body;
    console.log("payload ===", payload);
    if (!payload.labourId || !payload.payStructure) {
      return res
        .status(400)
        .json({ message: "Labour ID and Pay Structure are required" });
    }

    // Call labourModel function to insert/update wages
    const result = await labourModel.upsertLabourMonthlyWages(payload);

    if (result && result.WageID) {
      return res.status(200).json({
        WageID: result.WageID,
        message: "Wages upserted successfully",
      });
    } else if (result && !result.success) {
      return res.status(200).json({ message: result.message });
    } else {
      return res.status(500).json({ message: "Failed to upsert wages" });
    }
  } catch (error) {
    console.error("Error in upsertLabourMonthlyWages:", error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

const checkExistingWagesController = async (req, res) => {
  try {
    const { labourId } = req.query;
    if (!labourId) {
      return res.status(400).json({ message: "Labour ID is required" });
    }

    const existingWages = await labourModel.checkExistingWages(labourId);

    if (existingWages) {
      res.status(200).json({
        exists: true,
        approved: existingWages.ApprovalStatus === "Approved",
        data: existingWages,
      });
    } else {
      res.status(200).json({ exists: false });
    }
  } catch (error) {
    console.error("Error checking existing wages:", error);
    res.status(500).json({ message: "Error checking existing wages", error });
  }
};

const markWagesForApprovalController = async (req, res) => {
  try {
    const payload = req.body;
    const {
      wageId,
      labourId,
      dailyWages,
      perHourWages,
      monthlyWages,
      yearlyWages,
      effectiveDate,
      fixedMonthlyWages,
      weeklyOff,
      payStructure,
      wagesEditedBy,
      remarks,
    } = payload;
    if (!wageId || !labourId || !payStructure) {
      return res.status(400).json({
        message: "Wage ID, Labour ID, and Pay Structure are required",
      });
    }

    const result = await labourModel.markWagesForApproval(
      wageId,
      labourId,
      dailyWages,
      perHourWages,
      monthlyWages,
      yearlyWages,
      effectiveDate,
      fixedMonthlyWages,
      weeklyOff,
      payStructure,
      wagesEditedBy,
      remarks
    );

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error marking wages for approval:", error.message || error);
    return res.status(500).json({
      message: "Error marking wages for approval",
      error: error.message || error,
    });
  }
};

const getWagesAdminApprovals = async (req, res) => {
  try {
    const approvals = await labourModel.getWagesAdminApprovals();
    res.status(200).json(approvals);
  } catch (error) {
    res.status(500).json({ message: "Error fetching approvals", error });
  }
};

const handleApproval = async (req, res) => {
  try {
    const { WageID, approvalStatus, remarks } = req.body;

    if (!WageID || !["Approved", "Rejected"].includes(approvalStatus)) {
      return res
        .status(400)
        .json({ message: "Invalid approval data provided." });
    }

    if (approvalStatus === "Approved") {
      await labourModel.approveWages(WageID);
    } else if (approvalStatus === "Rejected") {
      await labourModel.rejectWages(WageID, remarks);
    }

    res
      .status(200)
      .json({ message: `Wages ${approvalStatus.toLowerCase()} successfully.` });
  } catch (error) {
    console.error("Error handling approval:", error);
    res.status(500).json({ message: "Error handling approval.", error });
  }
};

async function approveWagesControllerAdmin(req, res) {
  const { ApprovalID } = req.query;
  if (!ApprovalID) {
    return res.status(400).json({ message: "WageID is required." });
  }

  try {
    const result = await labourModel.approveWages(ApprovalID);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in approving Wages:", error);
    res.status(error.statusCode || 500).json({ message: error.message });
  }
}

async function rejectWagesControllerAdmin(req, res) {
  const { ApprovalID, Remarks } = req.query;

  if (!ApprovalID) {
    return res.status(400).json({ message: "ApprovalID is required." });
  }

  try {
    const result = await labourModel.rejectWages(ApprovalID, Remarks);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in rejecting Wages:", error);
    res.status(error.statusCode || 500).json({ message: error.message });
  }
}

const addWageApproval = async (req, res) => {
  try {
    await labourModel.addWageApproval(req.body);
    res.status(201).json({ message: "Approval added successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error adding approval", error });
  }
};

const exportWagesexcelSheet = async (req, res) => {
  try {
    let { projectName, month, payStructure } = req.query;

    if (!month) {
      return res
        .status(400)
        .json({ message: "Missing required parameter: month" });
    }

    // Use "all" if projectName is missing or empty.
    if (!projectName || projectName.trim() === "") {
      projectName = "all";
    }

    // Calculate the date range for the given month.
    const startDate = `${month}-01`;
    const endDate = new Date(
      new Date(startDate).setMonth(new Date(startDate).getMonth() + 1) - 1
    )
      .toISOString()
      .split("T")[0];

    // Fetch wages data (or approved onboarding rows if no matching wages).
    const wagesData = await labourModel.getWagesByDateRange(
      projectName,
      payStructure,
      startDate,
      endDate
    );

    // Create the Excel workbook.
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(wagesData);
    xlsx.utils.book_append_sheet(workbook, worksheet, "Labour Wages");

    // Set the file name.
    const fileName =
      projectName === "all"
        ? `Approved_Labours_${month}.xlsx`
        : `Wages_${projectName}_${month}.xlsx`;

    res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.send(xlsx.write(workbook, { type: "buffer", bookType: "xlsx" }));
  } catch (error) {
    console.error("Error exporting Wages:", error);
    res.status(500).json({ message: "Error exporting Wages data." });
  }
};

// Optionally preset payStructure for dedicated endpoints.
const exportMonthlyWagesExcel = async (req, res) => {
  req.query.payStructure = "Monthly Wages";
  exportWagesexcelSheet(req, res);
};

const exportFixedWagesExcel = async (req, res) => {
  req.query.payStructure = "Fix Monthly Wages";
  exportWagesexcelSheet(req, res);
};

const xlsxDateToJSDate = (serial) => {
  if (isNaN(serial)) return null;
  const excelEpoch = new Date(Date.UTC(1900, 0, 1));
  const daysSinceEpoch = serial - 1;
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return new Date(excelEpoch.getTime() + daysSinceEpoch * millisecondsPerDay);
};

const importWages = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const wagesEditedBy = req.body.wagesEditedBy || "System";
    const filePath = req.file.path;
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    const errors = [];
    for (const [index, row] of rows.entries()) {
      try {
        // Convert Excel date to JavaScript date if From_Date is defined
        if (row.From_Date) {
          row.From_Date = xlsxDateToJSDate(row.From_Date);
        }

        // Insert row into the database
        row.WagesEditedBy = wagesEditedBy;
        await labourModel.insertWagesData(row);
      } catch (error) {
        // Log error details
        row.Error = error.message;
        row.RowNumber = index + 1;
        errors.push(row);
      }
    }

    fs.unlinkSync(filePath);
    if (errors.length > 0) {
      // Generate error Excel file
      const errorWorkbook = xlsx.utils.book_new();
      const errorSheet = xlsx.utils.json_to_sheet(errors);
      xlsx.utils.book_append_sheet(errorWorkbook, errorSheet, "Errors");
      const buffer = xlsx.write(errorWorkbook, {
        type: "buffer",
        bookType: "xlsx",
      });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="Error_Rows.xlsx"'
      );
      return res.status(200).send(buffer);
    }

    res.status(200).json({ message: "Data imported successfully!" });
  } catch (error) {
    console.error("Import error:", error);
    res
      .status(500)
      .json({ message: "Internal server error. Please try again." });
  }
};

const getWagesAndLabourOnboardingJoincontroller = async (req, res) => {
  try {
    // Get filters from query parameters (e.g., ?ProjectID=...&DepartmentID=...)
    const filters = req.query;
    const joinWagesLabour = await labourModel.getWagesAndLabourOnboardingJoin(
      filters
    );
    res.status(200).json(joinWagesLabour);
  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).json({ message: "Error fetching data", error });
  }
};

const getAttendanceReportAndLabourOnboardingJoincontroller = async (
  req,
  res
) => {
  try {
    const filters = {
      ProjectID: req.query.ProjectID || "",
      DepartmentID: req.query.DepartmentID || "",
    };
    console.log("filters", filters);
    const joinAttendanceLabour =
      await labourModel.getAttendanceReportAAndLabourOnboardingJoin(filters);
    res.status(200).json(joinAttendanceLabour);
  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).json({ message: "Error fetching data", error });
  }
};

async function searchLaboursFromWages(req, res) {
  const { q } = req.query;

  try {
    const results = await labourModel.searchFromWages(q);
    return res.json(results);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function searchLaboursFromVariableInput(req, res) {
  const { q } = req.query;

  try {
    const results = await labourModel.searchFromVariableInput(q);
    return res.json(results);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function searchLaboursFromSiteTransfer(req, res) {
  const { q } = req.query;

  try {
    const results = await labourModel.searchLaboursFromSiteTransfer(q);
    return res.json(results);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function searchAttendance(req, res) {
  const { q } = req.query;

  try {
    const results = await labourModel.searchAttendance(q);
    return res.json(results);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function updateOTHoursAttendance(req, res) {
  try {
    const {
      labourId,
      date,
      AttendanceId,
      firstPunchManually,
      lastPunchManually,
      overtimeManually,
      remarkManually,
      workingHours,
      onboardName,
      AttendanceStatus,
      markWeeklyOff,
      updatedFields,
      userType,
    } = req.body;

    // 🔒 Required field validations
    if (!labourId || !date || typeof overtimeManually === "undefined") {
      return res.status(400).json({
        message:
          "Missing required fields: labourId, date, or overtimeManually.",
      });
    }

    if (!Array.isArray(updatedFields) || updatedFields.length === 0) {
      return res
        .status(400)
        .json({ message: "updatedFields must be a non-empty array." });
    }

    const isOnlyOTUpdate =
      updatedFields.length === 1 && updatedFields[0] === "overtimemanually";
    if (!isOnlyOTUpdate) {
      return res.status(400).json({
        message:
          "Only overtimeManually update is allowed through this endpoint.",
      });
    }

    const finalOnboardName = onboardName || "System";
    const finalUserType = userType || "System";

    // ✅ Build only relevant fields based on updatedFields
    const updatePayload = {
      labourId,
      date,
      AttendanceId,
      onboardName: finalOnboardName,
      editUserName: finalOnboardName,
      userType: finalUserType,
    };

    if (
      updatedFields.includes("overtimemanually") &&
      overtimeManually !== undefined
    ) {
      updatePayload.overtimeManually = overtimeManually;
    }

    // ❌ If no actual fields to update, reject
    const keysToUpdate = Object.keys(updatePayload).filter(
      (k) =>
        ![
          "labourId",
          "date",
          "AttendanceId",
          "onboardName",
          "editUserName",
        ].includes(k)
    );
    if (keysToUpdate.length === 0) {
      return res.status(400).json({ message: "No valid fields to update." });
    }
    if (finalUserType === "ENC" && overtimeManually) {
      await labourModel.markAttendanceForApproval(
        AttendanceId,
        labourId,
        date,
        overtimeManually,
        firstPunchManually,
        lastPunchManually,
        remarkManually,
        finalOnboardName,
        markWeeklyOff,
        updatedFields,
        finalUserType
      );

      return res
        .status(200)
        .json({ message: "Attendance sent To USER APPROVAL." });
    }

    // 📥 Call model
    await labourModel.upsertAttendance(updatePayload);

    return res
      .status(200)
      .json({ message: "Overtime manually updated successfully." });
  } catch (error) {
    console.error("Error updating overtime manually:", error);
    return res
      .status(error.statusCode || 500)
      .json({ message: error.message || "Internal server error." });
  }
}

const generateAttendancePDF = async (req, res) => {
  try {
    const { startDate, endDate, projectName, department } = {
      ...req.body,
      ...req.query,
      ...req.params,
    };

    if (!startDate || !endDate || !projectName) {
      return res.status(400).json({
        message:
          "Missing required parameters: startDate, endDate, or projectName.",
      });
    }

    const projectNameStr = Array.isArray(projectName)
      ? projectName.join(",")
      : projectName;
    const departmentStr = department
      ? Array.isArray(department)
        ? department.join(",")
        : department
      : "";

    const attendanceData = await labourModel.getAttendanceByDateRange(
      projectNameStr,
      startDate,
      endDate,
      departmentStr
    );

    if (!attendanceData || attendanceData.length === 0) {
      return res.status(404).json({
        message: "No attendance data found for the selected criteria.",
      });
    }

    const labourGrouped = {};
    attendanceData.forEach((entry) => {
      const labourId = entry.LabourId;
      const date = new Date(entry.Date).toISOString().split("T")[0];

      if (!labourGrouped[labourId]) {
        labourGrouped[labourId] = {
          name: entry.name,
          department: entry.departmentName,
          project: entry.ProjectName,
          businessUnit: entry.BusinessUnit,
          dates: {},
        };
      }

      labourGrouped[labourId].dates[date] = {
        status: entry.Status || "-",
        inTime: entry.FirstPunchManually || "",
        outTime: entry.LastPunchManually || "",
        ot: entry.OvertimeManually || "",
        remark: entry.RemarkManually || "",
      };
    });

    const start = new Date(startDate);
    const end = new Date(endDate);
    const dateList = [];
    while (start <= end) {
      dateList.push(new Date(start).toISOString().split("T")[0]);
      start.setDate(start.getDate() + 1);
    }

    let labourSections = "";
    const labourEntries = Object.entries(labourGrouped);
    for (let i = 0; i < labourEntries.length; i++) {
      const [labourId, data] = labourEntries[i];

      const statusRow = dateList
        .map((date) => `<td>${data.dates[date]?.status || "-"}</td>`)
        .join("");
      const inTimeRow = dateList
        .map((date) => `<td>${data.dates[date]?.inTime || ""}</td>`)
        .join("");
      const outTimeRow = dateList
        .map((date) => `<td>${data.dates[date]?.outTime || ""}</td>`)
        .join("");
      const otRow = dateList
        .map((date) => `<td>${data.dates[date]?.ot || ""}</td>`)
        .join("");
      const remarkRow = dateList
        .map((date) => `<td>${data.dates[date]?.remark || ""}</td>`)
        .join("");

      const formattedDates = dateList.map((d) => {
        const [year, month, day] = d.split("-");
        return `${day}-${month}-${year}`;
      });

      labourSections += `
        <div class="labour-card ${i % 3 === 2 ? "page-break" : ""}">
          <h4>${labourId} - ${data.name}</h4>
          <p><strong>Dept:</strong> ${
            data.department
          }<br><strong>Proj:</strong> ${
        data.project
      }<br><strong>Unit:</strong> ${data.businessUnit}</p>
          <table>
            <thead>
              <tr>
                <th>Details</th>
                ${formattedDates.map((d) => `<th>${d}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              <tr><td>Status</td>${statusRow}</tr>
              <tr><td>In Time</td>${inTimeRow}</tr>
              <tr><td>Out Time</td>${outTimeRow}</tr>
              <tr><td>OT</td>${otRow}</tr>
              <tr><td>Remark</td>${remarkRow}</tr>
            </tbody>
          </table>
        </div>
      `;
    }

    const fullHtml = `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h2 { text-align: center; color: #d32f2f; }
            h4 { margin: 5px 0; color: #1976d2; }

            .labour-card {
              border: 1px solid #ccc;
              padding: 10px;
              margin-bottom: 20px;
              font-size: 10px;
              page-break-inside: avoid;
            }

            .page-break {
              page-break-after: always;
            }

            table {
              border-collapse: collapse;
              width: 100%;
              font-size: 9px;
              table-layout: fixed;
            }

            th, td {
              border: 1px solid #999;
              padding: 2px;
              text-align: center;
              word-wrap: break-word;
              vertical-align: top;
            }

            th {
              background-color: #f2f2f2;
            }

            tr:nth-child(even) td {
              background: #f9f9f9;
            }
          </style>
        </head>
        <body>
          <h2>Labour Attendance Report</h2>
          <p style="text-align:center;"><strong>From:</strong> ${startDate} <strong>To:</strong> ${endDate}</p>
          ${labourSections}
        </body>
      </html>
    `;

    const options = {
      format: "A4",
      orientation: "landscape",
      border: {
        top: "10mm",
        bottom: "10mm",
        left: "10mm",
        right: "10mm",
      },
    };

    pdf.create(fullHtml, options).toBuffer((err, buffer) => {
      if (err) {
        console.error("PDF generation error:", err);
        return res.status(500).json({ message: "Failed to generate PDF." });
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=attendance_report_${moment().format(
          "YYYYMMDD"
        )}.pdf`
      );
      res.end(buffer);
    });
  } catch (error) {
    console.error("Error generating attendance PDF:", error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Error generating attendance PDF." });
    }
  }
};

cron.schedule("10 05 * * *", async () => {
  cronLogger.info("Scheduled cron triggered...");
  await runAttendanceCronEssl();
  await runDailyAttendanceCron();
});

module.exports = {
  handleCheckAadhaar,
  getNextUniqueID,
  createRecord,
  getAllRecords,
  getRecordById,
  updateRecord,
  deleteRecord,
  getAllRecordsLaboursOnboarding,
  searchLabours,
  getAllLabours,
  approveLabour,
  rejectLabour,
  getApprovedLabours,
  resubmitLabour,
  esslapi,
  updateRecordLabour,
  createRecordUpdate,
  getCommandStatus,
  editbuttonLabour,
  updateRecordWithDisable,
  getUserStatusController,
  updateHideResubmitLabour,
  getAttendance,
  submitAttendanceController,
  getAllLaboursAttendance,
  getCachedAttendance,
  approveDisableLabour,
  addWeeklyOff,
  isWeeklyOff,
  saveWeeklyOffs,
  getDisabledMonthsAndYears,
  deleteAttendance,
  getAttendanceSummary,
  getAttendanceDetails,
  saveAttendance,
  getAttendanceByMonthYear,
  getAttendanceDetailsForSingleLabour,
  upsertAttendance,
  exportAttendance,
  importAttendance,
  approveAttendanceController,
  LabourAttendanceApproval,
  rejectAttendanceController,
  rejectAttendanceControllerAdmin,
  getAttendanceCalenderSingleLabour,
  getLabourMonthlyWages,
  upsertLabourMonthlyWages,
  getWagesAdminApprovals,
  addWageApproval,
  exportWagesexcelSheet,
  importWages,
  getWagesAndLabourOnboardingJoincontroller,
  searchLaboursFromWages,
  handleApproval,
  approveWagesControllerAdmin,
  rejectWagesControllerAdmin,
  checkExistingWagesController,
  markWagesForApprovalController,
  exportMonthlyWagesExcel,
  exportFixedWagesExcel,
  searchLaboursFromSiteTransfer,
  searchAttendance,
  searchLaboursFromVariableInput,
  getAttendanceReportAndLabourOnboardingJoincontroller,
  getAllLaboursAttendanceDaily,
  updateOTHoursAttendance,
  searchLaboursForAttendance,
  generateAttendancePDF,
};