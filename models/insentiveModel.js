const { poolPromise2 } = require("../config/dbConfig2");
const { sql, poolPromise } = require("../config/dbConfig");
const { poolPromise3 } = require("../config/dbConfig3");
const ExcelJS = require("exceljs");
const fs = require("fs");

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 15 minutes

async function getAllLabours(filters = {}) {
  const pool = await poolPromise;

  let query = `SELECT * FROM labourOnboarding WHERE status = 'Approved'`;
  const request = pool.request();

  // 🔍 Handle ProjectID filter (comma-separated)
  if (filters.ProjectID) {
    const projectIDs = filters.ProjectID.split(",")
      .map((id) => parseInt(id.trim()))
      .filter(Boolean);
    if (projectIDs.length > 0) {
      const projectParams = projectIDs.map((val, idx) => {
        const param = `projectID${idx}`;
        request.input(param, val);
        return `@${param}`;
      });
      query += ` AND projectName IN (${projectParams.join(", ")})`;
    }
  }

  // 🔍 Handle DepartmentID filter (comma-separated)
  if (filters.DepartmentID) {
    const departmentIDs = filters.DepartmentID.split(",")
      .map((id) => parseInt(id.trim()))
      .filter(Boolean);
    if (departmentIDs.length > 0) {
      const departmentParams = departmentIDs.map((val, idx) => {
        const param = `departmentID${idx}`;
        request.input(param, val);
        return `@${param}`;
      });
      query += ` AND department IN (${departmentParams.join(", ")})`;
    }
  }

  query += ` ORDER BY LabourID;`;

  const result = await request.query(query);
  return result.recordset;
}

async function registerData(labourData) {
  try {
    const pool = await poolPromise;
    const request = pool.request();

    const toUpperCaseFields = [
      "address",
      "name",
      "taluka",
      "district",
      "village",
      "state",
      "bankName",
      "branch",
      "ifscCode",
      "contractorName",
      "Inducted_By",
      "OnboardName",
      "title",
    ];

    const setInputWithUpperCase = (key, value) => {
      const valueAsString = value ? String(value) : "";
      request.input(
        key,
        sql.VarChar,
        valueAsString ? valueAsString.toUpperCase() : ""
      );
    };

    request.input("LabourID", sql.VarChar, labourData.LabourID);
    request.input("location", sql.VarChar, labourData.location);

    const finalOnboardName = labourData.OnboardName
      ? labourData.OnboardName
      : "";
    labourData.OnboardName = finalOnboardName;

    Object.keys(labourData).forEach((key) => {
      if (key !== "LabourID" && key !== "location") {
        if (toUpperCaseFields.includes(key)) {
          setInputWithUpperCase(key, labourData[key]);
        } else {
          request.input(key, sql.VarChar, labourData[key]);
        }
      }
    });

    const result = await request.query(`
        INSERT INTO labourOnboarding (
          LabourID, labourOwnership, uploadAadhaarFront, uploadAadhaarBack, uploadIdProof, name, aadhaarNumber,
          dateOfBirth, contactNumber, gender, dateOfJoining, Group_Join_Date, From_Date, Period, address, pincode, taluka, district, village,
          state, emergencyContact, photoSrc, bankName, branch, accountNumber, ifscCode, projectName, 
          labourCategory, department, workingHours, contractorName, contractorNumber, designation,
          status, isApproved, title, Marital_Status, companyName, Induction_Date, Inducted_By, uploadInductionDoc, OnboardName, ValidTill, location, ConfirmDate, retirementDate, SalaryBu, WorkingBu, CreationDate, businessUnit, departmentId, designationId, labourCategoryId, departmentName) 
          VALUES (
          @LabourID, @labourOwnership, @uploadAadhaarFront, @uploadAadhaarBack, @uploadIdProof, @name, @aadhaarNumber,
          @dateOfBirth, @contactNumber, @gender, @dateOfJoining, @Group_Join_Date, @From_Date, @Period, @address, @pincode, @taluka, @district, @village,
          @state, @emergencyContact, @photoSrc, @bankName, @branch, @accountNumber, @ifscCode, @projectName,
          @labourCategory, @department, @workingHours, @contractorName, @contractorNumber, @designation,
          'Pending', 0, @title, @Marital_Status, @companyName, @Induction_Date, @Inducted_By, @uploadInductionDoc, @OnboardName,  @ValidTill, @location, @ConfirmDate, @retirementDate, @SalaryBu, @WorkingBu, @CreationDate, @businessUnit, @departmentId, @designationId, @labourCategoryId, @departmentName)
        `);
    return result.recordset;
  } catch (error) {
    throw error;
  }
}

async function searchFromVariablePay(query) {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("query", sql.NVarChar, `%${query}%`).query(`SELECT 
    V.*,
    CASE 
        WHEN EXISTS (
            SELECT 1 
            FROM [FinalizedSalaryPay] F
            WHERE F.LabourID = V.LabourID
              AND F.month = MONTH(V.EffectiveDate)
              AND F.year = YEAR(V.EffectiveDate)
        )
        THEN 'true'
        ELSE 'false'
    END AS IsApproveDisable
FROM [VariablePay] V
WHERE name LIKE @query 
   OR companyName LIKE @query 
   OR LabourID LIKE @query 
   OR departmentName LIKE @query 
   OR payAddedBy LIKE @query 
   OR PayStructure LIKE @query 
   OR businessUnit LIKE @query 
   OR variablePayRemark LIKE @query 
   OR VariablepayAmount LIKE @query;
`);
    return result.recordset;
  } catch (error) {
    throw error;
  }
}

async function searchFromAttendanceApproval(query) {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("query", sql.NVarChar, `%${query}%`).query(`SELECT 
    L.*, 
    CASE 
        WHEN EXISTS (
            SELECT 1 
            FROM [FinalizedSalaryPay] F
            WHERE F.LabourID = L.LabourId
              AND MONTH(L.[Date]) = F.[month]
              AND YEAR(L.[Date]) = F.[year]
        )
        THEN 'true'
        ELSE 'false'
    END AS IsApproveDisable
FROM [LabourAttendanceApproval] L
WHERE LabourId LIKE @query 
   OR CONVERT(varchar(10), [Date], 120) LIKE @query 
   OR OnboardName LIKE @query;`);
    return result.recordset;
  } catch (error) {
    throw error;
  }
}

async function searchFromWagesApproval(query) {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("query", sql.NVarChar, `%${query}%`).query(`SELECT 
    W.*,
    CASE 
        WHEN EXISTS (
            SELECT 1 
            FROM [FinalizedSalaryPay] F
            WHERE F.LabourID = W.LabourID
              AND F.month = MONTH(W.EffectiveDate)
              AND F.year = YEAR(W.EffectiveDate)
        )
        THEN 'true'
        ELSE 'false'
    END AS IsApproveDisable
FROM [WagesAdminApprovals] W
WHERE LabourID LIKE @query 
   OR DailyWages LIKE @query 
   OR WagesEditedBy LIKE @query 
   OR MonthlyWages LIKE @query 
   OR FixedMonthlyWages LIKE @query 
   OR WeeklyOff LIKE @query 
   OR PayStructure LIKE @query 
   OR CONVERT(varchar(10), EffectiveDate, 120) LIKE @query;
`);
    return result.recordset;
  } catch (error) {
    throw error;
  }
}

async function searchFromSiteTransferApproval(query) {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("query", sql.NVarChar, `%${query}%`).query(`SELECT 
    A.*,
    CASE 
        WHEN EXISTS (
            SELECT 1 
            FROM [FinalizedSalaryPay] F
            WHERE F.LabourID = A.LabourID
              AND F.month = MONTH(A.transferDate)
              AND F.year = YEAR(A.transferDate)
        )
        THEN 'true'
        ELSE 'false'
    END AS IsApproveDisable
FROM [AdminSiteTransferApproval] A
WHERE LabourID LIKE @query 
    OR name LIKE @query 
    OR currentSiteName LIKE @query 
    OR transferSiteName LIKE @query 
    OR siteTransferBy LIKE @query 
    OR rejectionReason LIKE @query 
    OR CONVERT(varchar(10), transferDate, 120) LIKE @query;
`);
    return result.recordset;
  } catch (error) {
    throw error;
  }
}

async function searchFromViewMonthlyPayrolls(query) {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("query", sql.NVarChar, `%${query}%`)
      .query(
        "SELECT * FROM FinalizedSalaryPay WHERE LabourID LIKE @query OR name LIKE @query OR wageType LIKE @query "
      );
    return result.recordset;
  } catch (error) {
    throw error;
  }
}

const getVariablePayAndLabourOnboardingJoin = async (filters = {}) => {
  const pool = await poolPromise;
  const request = pool.request();

  let query = `
        SELECT 
            onboarding.id,
            onboarding.LabourID,
            onboarding.name,
            onboarding.businessUnit,
            onboarding.departmentName,
            onboarding.projectName AS ProjectID,
            onboarding.department AS DepartmentID,
            variablepay.payAddedBy,
            variablepay.PayStructure,
            variablepay.AdvancePay,
            variablepay.DebitPay,
            variablepay.IncentivePay,
            variablepay.VariablepayAmount,
            variablepay.ApprovalStatusPay,
            variablepay.CreatedAt,
            variablepay.variablePayRemark,
            variablepay.EffectiveDate,
            variablepay.userId
        FROM 
            [labourOnboarding] AS onboarding
        LEFT JOIN 
            [VariablePay] AS variablepay
        ON 
            onboarding.LabourID = variablepay.LabourID
        WHERE 
            onboarding.status IN ('Approved', 'Disable')
    `;

  // 🔍 Handle ProjectID filter (comma-separated)
  if (filters.ProjectID) {
    const projectIDs = filters.ProjectID.split(",")
      .map((id) => parseInt(id.trim()))
      .filter(Boolean);
    const projectParams = projectIDs.map((val, idx) => {
      const param = `projectID${idx}`;
      request.input(param, val);
      return `@${param}`;
    });
    query += ` AND onboarding.projectName IN (${projectParams.join(", ")})`;
  }

  // 🔍 Handle DepartmentID filter (comma-separated)
  if (filters.DepartmentID) {
    const departmentIDs = filters.DepartmentID.split(",")
      .map((id) => parseInt(id.trim()))
      .filter(Boolean);
    const departmentParams = departmentIDs.map((val, idx) => {
      const param = `departmentID${idx}`;
      request.input(param, val);
      return `@${param}`;
    });
    query += ` AND onboarding.department IN (${departmentParams.join(", ")})`;
  }

  const result = await request.query(query);
  return result.recordset;
};

const checkExistingVariablePay = async (LabourID) => {
  const pool = await poolPromise;

  const result = await pool.request().input("LabourID", sql.NVarChar, LabourID)
    .query(`
           SELECT *
            FROM (
                SELECT *,
                       ROW_NUMBER() OVER (PARTITION BY PayStructure ORDER BY EffectiveDate DESC) AS rn
                FROM VariablePay
                WHERE LabourID = @LabourID
            ) AS Ranked
            WHERE rn = 1;
        `);
  return result.recordset || null;
};

// In your labourModel file, update the function to retrieve the monthly wages record
const getLabourMonthlyWages = async (LabourID) => {
  const pool = await poolPromise;
  const result = await pool.request().input("LabourID", sql.NVarChar, LabourID)
    .query(`
            SELECT MonthlyWages, FixedMonthlyWages 
            FROM LabourMonthlyWages 
            WHERE LabourID = @LabourID
            ORDER BY LabourID ASC
        `);
  // Return the latest record (last element) if available, otherwise null.
  return result.recordset && result.recordset.length
    ? result.recordset[result.recordset.length - 1]
    : null;
};

// Add or update variablePay
const upsertLabourVariablePay = async (variablePay) => {
  const pool = await poolPromise;
  // Step 2: Perform the upsert operation
  const onboardingData = await pool
    .request()
    .input("LabourID", sql.NVarChar, variablePay.LabourID || "").query(`
        SELECT 
            LabourID,
            name,
            projectName,
            companyName,
            businessUnit,
            departmentName
        FROM [dbo].[labourOnboarding]
        WHERE LabourID = @LabourID
    `);

  if (onboardingData.recordset.length === 0) {
    throw new Error(
      `LabourID ${variablePay.LabourID} not found in labourOnboarding table`
    );
  }

  const labourDetails = onboardingData.recordset[0];

  const effectiveDate = new Date(variablePay.effectiveDate); // Append time part to avoid time zone issues
  if (isNaN(effectiveDate.getTime())) {
    console.error(
      "Invalid effective date provided:",
      variablePay.effectiveDate
    );
    throw new Error("Invalid effective date");
  }

  const advancePay = variablePay.payStructure === "Advance" ? 1 : 0;
  const debitPay = variablePay.payStructure === "Debit" ? 1 : 0;
  const incentivePay = variablePay.payStructure === "Incentive" ? 1 : 0;

  const ApprovalStatusPay = "AdminPending";
  // Define the SQL query for inserting the variable pay
  const query = `
        INSERT INTO VariablePay 
        (userId, LabourID, PayStructure, AdvancePay, DebitPay, IncentivePay, VariablepayAmount,
         payAddedBy, name, projectName, companyName, businessUnit, departmentName, variablePayRemark, EffectiveDate, CreatedAt, ApprovalStatusPay, isApprovalSendAdmin, incentiveRemark)
        VALUES 
        (@userId, @LabourID, @PayStructure, @AdvancePay, @DebitPay, @IncentivePay, @VariablepayAmount, 
         @payAddedBy, @name, @projectName, @companyName, @businessUnit, @departmentName, @variablePayRemark,
         @EffectiveDate, GETDATE(), @ApprovalStatusPay, @isApprovalSendAdmin, @incentiveRemark);
    `;

  // Execute the query with the proper parameters
  await pool
    .request()
    .input("userId", sql.Int, variablePay.userId)
    .input("LabourID", sql.NVarChar, variablePay.LabourID)
    .input("PayStructure", sql.NVarChar, variablePay.payStructure)
    .input("AdvancePay", sql.Bit, advancePay)
    .input("DebitPay", sql.Bit, debitPay)
    .input("IncentivePay", sql.Bit, incentivePay)
    .input("VariablepayAmount", variablePay.variablePay)
    .input("payAddedBy", sql.NVarChar, variablePay.payAddedBy)
    .input("name", sql.NVarChar, labourDetails.name)
    .input("projectName", sql.Int, labourDetails.projectName)
    .input("companyName", sql.NVarChar, labourDetails.companyName)
    .input("businessUnit", sql.NVarChar, labourDetails.businessUnit)
    .input("variablePayRemark", sql.NVarChar, variablePay.variablePayRemark)
    .input("departmentName", sql.NVarChar, labourDetails.departmentName)
    .input("EffectiveDate", sql.Date, effectiveDate)
    .input("ApprovalStatusPay", sql.NVarChar, ApprovalStatusPay)
    .input("isApprovalSendAdmin", sql.Bit, 1)
    .input("incentiveRemark", sql.NVarChar, variablePay.incentiveRemark)
    .query(query);
};

// Send VariablePay for admin approval
async function markVariablePayForApproval(
  payId,
  LabourID,
  payAddedBy,
  variablePay,
  variablePayRemark,
  payStructure,
  effectiveDate,
  userId,
  name
) {
  try {
    const pool = await poolPromise;
    const request = pool.request();

    const effectiveDateOnly = effectiveDate
      ? new Date(effectiveDate).toISOString().split("T")[0]
      : null;

    request.input("VariablePayId", sql.Int, payId);
    request.input("LabourID", sql.NVarChar, LabourID);
    request.input("payAddedBy", sql.NVarChar, payAddedBy || null);
    request.input("VariablepayAmount", variablePay || null);
    request.input("variablePayRemark", sql.NVarChar, variablePayRemark);
    request.input("EffectiveDate", sql.Date, effectiveDateOnly);
    request.input("PayStructure", sql.NVarChar, payStructure || null);
    request.input("userId", sql.Int, userId);
    request.input("name", sql.NVarChar, name);

    // Update the LabourMonthlyWages table
    const updateResult = await request.query(`
            UPDATE [VariablePay]
            SET ApprovalStatusPay = 'Pending',
                payAddedBy = @payAddedBy,
                EditDate = GETDATE()
            WHERE VariablePayId = @VariablePayId
        `);

    if (updateResult.rowsAffected[0] === 0) {
      throw new Error(
        "Failed to update VariablePay. VariablePayId may not exist."
      );
    }

    // Insert into the WagesAdminApprovals table
    await request.query(`
            INSERT INTO [VariablePayAdminApprovals] (
                VariablePayId, LabourID, payAddedBy, VariablepayAmount, variablePayRemark, EffectiveDate,
                 PayStructure, ApprovalStatusPay, CreatedAt, userId, name
            )
            VALUES (
                @VariablePayId, @LabourID, @payAddedBy, @VariablepayAmount, @variablePayRemark, @EffectiveDate,
                 @PayStructure, 'Pending', GETDATE(), @userId, @name
            )
        `);

    return {
      success: true,
      message: "Variable Pay marked for admin approval.",
    };
  } catch (error) {
    console.error(
      "Error marking Variable Pay for approval:",
      error.message || error
    );
    throw new Error(
      error.message || "Error marking Variable Pay for approval."
    );
  }
}

async function approvalAdminVariablePay(VariablePayId) {
  try {
    const pool = await poolPromise;
    const approvalResult = await pool
      .request()
      .input("VariablePayId", sql.Int, VariablePayId).query(`
                SELECT * FROM [VariablePay]
                WHERE VariablePayId = @VariablePayId
            `);

    if (approvalResult.recordset.length === 0) {
      throw new Error("Approval record not found.");
    }

    const approvalData = approvalResult.recordset[0];
    // Approve in VariablePay
    await pool
      .request()
      .input("VariablePayId", sql.Int, approvalData.VariablePayId)
      .input("isApprovalDoneAdmin", sql.Bit, 1)
      .input("IsApproved", sql.Bit, 1)
      .input("PayStructure", sql.NVarChar, approvalData.PayStructure || null)
      .input("VariablepayAmount", approvalData.VariablepayAmount || null)
      .input("EffectiveDate", sql.Date, approvalData.EffectiveDate || null)
      .input(
        "variablePayRemark",
        sql.NVarChar,
        approvalData.variablePayRemark || null
      ).query(`
            UPDATE [VariablePay]
            SET ApprovalStatusPay = 'Approved',
                isApprovalDoneAdmin = @isApprovalDoneAdmin,
                IsApproved = @IsApproved,
                ApprovedAdminDate = GETDATE()
            WHERE VariablePayId = @VariablePayId
        `);
    await pool
      .request()
      .input("VariablePayId", sql.Int, approvalData.VariablePayId).query(`
    UPDATE [VariablePayAdminApprovals]
    SET ApprovalStatusPay = 'Approved',
        ApprovedAdminDate = GETDATE()
    WHERE VariablePayId = @VariablePayId
`);
    return { success: true, message: "Variable Pay approved successfully." };
  } catch (error) {
    console.error("Error approving Variable Pay:", error);
    throw new Error("Error approving Variable Pay.");
  }
}

async function rejectAdminVariablePay(VariablePayId, Remarks) {
  try {
    const pool = await poolPromise;
    const approvalResult = await pool
      .request()
      .input("VariablePayId", sql.Int, VariablePayId).query(`
                SELECT * FROM [VariablePay]
                WHERE VariablePayId = @VariablePayId
            `);

    if (approvalResult.recordset.length === 0) {
      throw new Error("Approval record not found.");
    }

    const approvalData = approvalResult.recordset[0];

    // Reject in VariablePay
    await pool
      .request()
      .input("VariablePayId", sql.Int, approvalData.VariablePayId)
      .input("Remarks", sql.NVarChar, Remarks || null) // Allow null if no Remarks provided
      .input("isApprovalReject", sql.Bit, 1)
      .input("IsRejected", sql.Bit, 1).query(`
                UPDATE [VariablePay]
                SET ApprovalStatusPay = 'Rejected',
                    Remarks = @Remarks,
                    isApprovalReject = @isApprovalReject,
                    IsRejected = @IsRejected,
                    RejectAdminDate = GETDATE()
                WHERE VariablePayId = @VariablePayId
            `);
    await pool
      .request()
      .input("VariablePayId", sql.Int, approvalData.VariablePayId)
      .input("Remarks", sql.NVarChar, Remarks || null).query(`
    UPDATE [VariablePayAdminApprovals]
    SET ApprovalStatusPay = 'Rejected',
        RejectAdminDate = GETDATE(),
        Remarks = @Remarks
    WHERE VariablePayId = @VariablePayId
`);

    return { success: true, message: "Variable Pay rejected successfully." };
  } catch (error) {
    console.error("Error rejecting Variable Pay:", error);
    throw new Error("Error rejecting Variable Pay.");
  }
}

const getVariablePayAdminApproval = async () => {
  const pool = await poolPromise;
  const result = await pool.request().query(`SELECT 
    V.*,
    CASE 
        WHEN EXISTS (
            SELECT 1 
            FROM [FinalizedSalaryPay] F
            WHERE F.LabourID = V.LabourID
              AND F.month = MONTH(V.EffectiveDate)
              AND F.year = YEAR(V.EffectiveDate)
        )
        THEN 'true'
        ELSE 'false'
    END AS IsApproveDisable
FROM [VariablePay] V order by V.CreatedAt desc;
`);
  return result.recordset;
};

async function getVariablePayByDateRange(
  projectName,
  startDate,
  endDate,
  approvalStatus
) {
  const pool = await poolPromise;

  const query = `
   WITH LatestVariablepay AS (
        SELECT 
            onboarding.LabourID,
            onboarding.name,
            onboarding.projectName,
            onboarding.companyName,
            onboarding.businessUnit,
            onboarding.departmentName,
            VariablePay.PayStructure,
            VariablePay.AdvancePay,
            VariablePay.DebitPay,
            VariablePay.IncentivePay,
            VariablePay.VariablepayAmount,
            VariablePay.variablePayRemark,
            VariablePay.EffectiveDate,
            VariablePay.CreatedAt,
            VariablePay.ApprovalStatusPay,
            ROW_NUMBER() OVER (PARTITION BY onboarding.LabourID ORDER BY VariablePay.CreatedAt DESC) AS RowNum
        FROM 
            [dbo].[labourOnboarding] AS onboarding
        LEFT JOIN 
            [dbo].[VariablePay] AS VariablePay
        ON 
            onboarding.LabourID = VariablePay.LabourID
            ${
              projectName !== "all"
                ? "AND VariablePay.ProjectName = @projectName"
                : ""
            }
            ${
              startDate && endDate
                ? "AND VariablePay.CreatedAt BETWEEN @startDate AND @endDate"
                : ""
            }
            ${
              approvalStatus
                ? approvalStatus === "Approved"
                  ? "AND VariablePay.ApprovalStatusPay = 'Approved'"
                  : "AND ISNULL(VariablePay.ApprovalStatusPay, '') <> 'Approved'"
                : ""
            }
        WHERE 
            onboarding.status IN ('Approved', 'Disable')
            ${
              projectName !== "all"
                ? "AND onboarding.projectName = @projectName"
                : ""
            }
    )
    SELECT 
        LabourID,
        name,
        projectName,
        companyName,
        businessUnit,
        departmentName,
        PayStructure,
        AdvancePay,
        DebitPay,
        IncentivePay,
        VariablepayAmount,
        variablePayRemark,
        EffectiveDate,
        CreatedAt,
        ApprovalStatusPay
    FROM LatestVariablepay
    WHERE RowNum = 1
    `;

  const request = pool.request();

  // Add input parameters based on the presence of 'projectName'
  if (projectName !== "all") {
    request.input("projectName", sql.VarChar, projectName);
  }

  // Add date range parameters if provided
  if (startDate && endDate) {
    request.input("startDate", sql.Date, startDate);
    request.input("endDate", sql.Date, endDate);
  }

  // Execute the query
  const result = await request.query(query);
  return result.recordset;
}

async function getVariablePayByExcel() {
  const pool = await poolPromise;
  const query = `
        SELECT 
            LabourID,
            PayStructure,
            AdvancePay,
            DebitPay,
            IncentivePay,
            VariablePayAmount,
            VariablePayRemark,
            EffectiveDate
        FROM 
            [dbo].[VariablePay]
    `;

  try {
    const result = await pool.request().query(query);
    return result.recordset;
  } catch (error) {
    console.error("Error fetching Labour records:", error);
    throw new Error("Database query failed.");
  }
}

// Function to get remark options based on PayStructure
const getRemarksOptions = (payStructure) => {
  switch (payStructure.toLowerCase()) {
    case "advance":
      return ["New Joinee", "Payment Delay"];
    case "debit":
      return ["Gadget Mishandling", "Performance Issue"];
    case "incentive":
      return ["Payment Arrears", "Outstanding Performance"];
    default:
      return [];
  }
};

async function insertVariablePayData(row) {
  const pool = await poolPromise;

  // Normalize PayStructure
  if (typeof row.PayStructure === "string") {
    row.PayStructure = row.PayStructure.trim().toLowerCase();
    row.PayStructure =
      row.PayStructure.charAt(0).toUpperCase() + row.PayStructure.slice(1); // Capitalize first letter
  }

  // Validate PayStructure
  const validPayStructures = ["Advance", "Debit", "Incentive"];
  if (!row.PayStructure || !validPayStructures.includes(row.PayStructure)) {
    throw new Error(`Invalid PayStructure value: ${row.PayStructure}`);
  }

  // Initialize flags
  let AdvancePay = 0,
    DebitPay = 0,
    IncentivePay = 0;
  let variablePayRemark = null;

  // Set flag and validate remarks based on PayStructure
  if (row.PayStructure === "Advance") {
    AdvancePay = 1;
    const remarks = getRemarksOptions("advance");
    if (!row.VariablePayRemark || !remarks.includes(row.VariablePayRemark)) {
      throw new Error(
        `Invalid VariablePayRemark for Advance. Allowed values: ${remarks.join(
          ", "
        )}`
      );
    }
    variablePayRemark = row.VariablePayRemark;
  } else if (row.PayStructure === "Debit") {
    DebitPay = 1;
    const remarks = getRemarksOptions("debit");
    if (!row.VariablePayRemark || !remarks.includes(row.VariablePayRemark)) {
      throw new Error(
        `Invalid VariablePayRemark for Debit. Allowed values: ${remarks.join(
          ", "
        )}`
      );
    }
    variablePayRemark = row.VariablePayRemark;
  } else if (row.PayStructure === "Incentive") {
    IncentivePay = 1;
    if (row.WeeklyOff == null || isNaN(parseInt(row.WeeklyOff, 10))) {
      throw new Error(`Invalid WeeklyOff value: ${row.WeeklyOff}`);
    }
    const remarks = getRemarksOptions("incentive");
    if (!row.VariablePayRemark || !remarks.includes(row.VariablePayRemark)) {
      throw new Error(
        `Invalid VariablePayRemark for Incentive. Allowed values: ${remarks.join(
          ", "
        )}`
      );
    }
    variablePayRemark = row.VariablePayRemark;
  }

  // Fetch labour details from labourOnboarding table
  const onboardingData = await pool
    .request()
    .input("LabourID", sql.NVarChar, row.LabourID || "").query(`
            SELECT 
                LabourID, name, projectName, companyName, businessUnit, departmentName, id
            FROM [dbo].[labourOnboarding]
            WHERE LabourID = @LabourID
        `);

  if (onboardingData.recordset.length === 0) {
    throw new Error(
      `LabourID ${row.LabourID} not found in labourOnboarding table`
    );
  }

  const labourDetails = onboardingData.recordset[0];
  const ApprovalStatusPay = "AdminPending";

  // Insert into VariablePay table
  const request = pool.request();
  request.input("userId", sql.Int, labourDetails.id || 0);
  request.input("LabourID", sql.VarChar, row.LabourID);
  request.input("payAddedBy", sql.VarChar, row.wagesEditedBy || "System");
  request.input("name", sql.VarChar, labourDetails.name || "");
  request.input("projectName", sql.Int, labourDetails.projectName || 0);
  request.input("companyName", sql.VarChar, labourDetails.companyName || "");
  request.input("businessUnit", sql.VarChar, labourDetails.businessUnit || "");
  request.input(
    "departmentName",
    sql.VarChar,
    labourDetails.departmentName || ""
  );
  request.input("PayStructure", sql.VarChar, row.PayStructure);
  request.input("AdvancePay", sql.Bit, AdvancePay);
  request.input("DebitPay", sql.Bit, DebitPay);
  request.input("IncentivePay", sql.Bit, IncentivePay);
  request.input(
    "VariablepayAmount",
    sql.Decimal(18, 2),
    row.VariablePayAmount || 0.0
  );
  request.input("variablePayRemark", sql.NVarChar(255), variablePayRemark);
  request.input("EffectiveDate", sql.Date, new Date());
  request.input("CreatedAt", sql.DateTime, new Date());
  request.input("ApprovalStatusPay", sql.NVarChar(50), ApprovalStatusPay);
  request.input("isApprovalSendAdmin", sql.Bit, 1);
  request.input("ImportedViaExcel", sql.Bit, 1);

  const insertResult = await request.query(`
        INSERT INTO [dbo].[VariablePay]
        (userId, LabourID, payAddedBy, name, projectName, companyName, businessUnit, departmentName, PayStructure, AdvancePay, DebitPay, IncentivePay, VariablepayAmount, variablePayRemark, EffectiveDate, CreatedAt, ApprovalStatusPay, isApprovalSendAdmin, ImportedViaExcel)
        OUTPUT INSERTED.VariablePayId
        VALUES (@userId, @LabourID, @payAddedBy, @name, @projectName, @companyName, @businessUnit, @departmentName, @PayStructure, @AdvancePay, @DebitPay, @IncentivePay, @VariablepayAmount, @variablePayRemark, @EffectiveDate, @CreatedAt, @ApprovalStatusPay, @isApprovalSendAdmin, @ImportedViaExcel)
    `);

  if (!insertResult.recordset || insertResult.recordset.length === 0) {
    throw new Error("Failed to insert VariablePay.");
  }

  // 🟢 Use the inserted VariablePayId
  const variablePayId = insertResult.recordset[0].VariablePayId;

  // Update the VariablePay table to mark it as pending
  await request.input("VariablePayId", sql.Int, variablePayId).query(`
        UPDATE [VariablePay]
        SET ApprovalStatusPay = 'AdminPending',
            EditDate = GETDATE()
        WHERE VariablePayId = @VariablePayId
    `);

  // Insert into VariablePayAdminApprovals table
  await request.query(`
        INSERT INTO [VariablePayAdminApprovals] (
            VariablePayId, LabourID, payAddedBy, VariablepayAmount, variablePayRemark, EffectiveDate,
             PayStructure, ApprovalStatusPay, CreatedAt, userId, name
        )
        VALUES (
            @VariablePayId, @LabourID, @payAddedBy, @VariablepayAmount, @variablePayRemark, @EffectiveDate,
             @PayStructure, 'Pending', GETDATE(), @userId, @name
        )
    `);

  return {
    success: true,
    message: "Variable Pay inserted and sent for approval.",
    VariablePayId: variablePayId,
  };
}

function getSundaysInMonth(month, year) {
  const sundays = [];

  // Note: JavaScript months are 0-based (January = 0)
  const date = new Date(year, month - 1, 1); // Start from 1st of the month

  while (date.getMonth() === month - 1) {
    if (date.getDay() === 0) {
      // Sunday
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, "0");
      const dd = String(date.getDate()).padStart(2, "0");
      sundays.push(`${yyyy}-${mm}-${dd}`);
    }
    date.setDate(date.getDate() + 1); // Move to next day
  }

  return sundays;
}

async function getAttendanceSummaryForLabour(
  labourId,
  month,
  year,
  workingHours,
  forSundaydailyWageRate
) {
  try {
    const pool = await poolPromise;

    const sundays = getSundaysInMonth(month, year);
    const parsedWorkingHours =
      workingHours === "FLEXI SHIFT - 9 HRS"
        ? 9
        : !isNaN(parseFloat(workingHours))
        ? parseFloat(workingHours)
        : 8;

    const sundayListSql =
      sundays.length > 0 ? sundays.map((date) => `'${date}'`).join(", ") : "''";

    const result = await pool
      .request()
      .input("labourId", sql.NVarChar, labourId)
      .input("month", sql.Int, month)
      .input("year", sql.Int, year).query(`
        SELECT 
          COUNT(DISTINCT att.[Date]) AS totalDays,
          COUNT(DISTINCT CASE WHEN att.Status = 'P' THEN att.[Date] END) AS presentDays,
          COUNT(DISTINCT CASE WHEN att.Status = 'A' THEN att.[Date] END) AS absentDays,
          COUNT(DISTINCT CASE WHEN att.Status = 'HD' THEN att.[Date] END) AS halfDays,
          COUNT(DISTINCT CASE WHEN att.Status = 'MP' THEN att.[Date] END) AS missPunchDays,
          COUNT(DISTINCT CASE WHEN att.Status = 'WO' THEN att.[Date] END) AS weeklyOffDay,
          COUNT(DISTINCT CASE WHEN att.Status = 'O' THEN att.[Date] END) AS normalOvertimeCount,
          COUNT(DISTINCT hol.HolidayDate) AS totalHolidaysInMonth,
          SUM(CASE 
            WHEN att.Status = 'P' AND hol.HolidayDate IS NOT NULL AND att.TotalHours IS NOT NULL
            THEN att.TotalHours ELSE 0 END) AS holidayOvertimeHours,
          SUM(CASE 
            WHEN att.Status = 'P' AND hol.HolidayDate IS NOT NULL AND att.TotalHours IS NOT NULL AND wages.PerHourWages IS NOT NULL
            THEN att.TotalHours * wages.PerHourWages ELSE 0 END) AS holidayOvertimeWages,
          SUM(CASE WHEN att.TotalHours IS NOT NULL THEN att.TotalHours ELSE 0 END) AS totalHoursForMonth
        FROM [dbo].[LabourAttendanceDetails] att
        LEFT JOIN [dbo].[HolidayDate] hol
          ON att.[Date] = hol.HolidayDate AND MONTH(hol.HolidayDate) = @month AND YEAR(hol.HolidayDate) = @year
        LEFT JOIN (
          SELECT LabourID, MAX(PerHourWages) AS PerHourWages
          FROM [dbo].[LabourMonthlyWages]
          WHERE PayStructure IN ('DAILY WAGES', 'FIXED MONTHLY WAGES')
          GROUP BY LabourID
        ) wages
          ON att.LabourID = wages.LabourID
        WHERE 
          att.LabourID = @labourId
          AND att.Date NOT IN (${sundayListSql})
          AND MONTH(att.[Date]) = @month
          AND YEAR(att.[Date]) = @year;
      `);

    const row = result.recordset[0] || {};

    const sundayAttendanceResult = await pool
      .request()
      .input("labourId", sql.NVarChar, labourId).query(`
        SELECT [Date], TotalHours
        FROM [dbo].[LabourAttendanceDetails]
        WHERE LabourID = @labourId AND [Date] IN (${sundayListSql})
      `);

    let additionalPresent = 0,
      additionalHalf = 0,
      additionalHours = 0;

    for (const { TotalHours } of sundayAttendanceResult.recordset) {
      const hours = parseFloat(TotalHours);
      const halfThreshold = parsedWorkingHours / 2;

      if (hours >= parsedWorkingHours) {
        additionalPresent++;
      } else if (hours > 0 && hours < halfThreshold) {
        additionalHalf++;
        additionalHours += hours;
      }
    }

    let sundayPayment = 0;
    if (additionalPresent > 0) {
      sundayPayment += additionalPresent * forSundaydailyWageRate;
    }
    if (additionalHours > 0) {
      sundayPayment +=
        additionalHours * (forSundaydailyWageRate / parsedWorkingHours);
    }

    return {
      totalDays: (row.totalDays ?? 0) + sundays.length,
      presentDays: (row.presentDays ?? 0) + additionalPresent,
      absentDays: row.absentDays ?? 0,
      halfDays: row.halfDays ?? 0,
      missPunchDays: row.missPunchDays ?? 0,
      weeklyOffDay: row.weeklyOffDay ?? 0,
      normalOvertimeCount: row.normalOvertimeCount ?? 0,
      totalHolidaysInMonth: row.totalHolidaysInMonth ?? 0,
      holidayOvertimeHours: row.holidayOvertimeHours ?? 0,
      holidayOvertimeWages: row.holidayOvertimeWages ?? 0,
      totalHoursForMonth: row.totalHoursForMonth ?? 0,
      sundayPayment,
      additionalPresent,
      additionalHalf,
    };
  } catch (error) {
    console.error("Error in getAttendanceSummaryForLabour:", error);
    throw error;
  }
}

async function getAttendanceSummaryForLabourMonthly(labourId, month, year) {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("labourId", sql.NVarChar, labourId)
      .input("month", sql.Int, month)
      .input("year", sql.Int, year).query(`
                WITH HolidayOvertime AS (
                    SELECT 
                        att.LabourID,
                        att.Date,
                        att.TotalHours,
                        wages.PerHourWages
                    FROM [dbo].[LabourAttendanceDetails] att
                    LEFT JOIN [dbo].[HolidayDate] hol
                        ON att.[Date] = hol.HolidayDate  
                        AND MONTH(hol.HolidayDate) = @month
                        AND YEAR(hol.HolidayDate) = @year  -- Ensure only holidays in the selected month

                    LEFT JOIN (
                        SELECT LabourID, MAX(PerHourWages) AS PerHourWages
                        FROM [dbo].[LabourMonthlyWages]
                        WHERE PayStructure IN ('DAILY WAGES', 'FIXED MONTHLY WAGES')
                        GROUP BY LabourID
                    ) wages
                        ON att.LabourID = wages.LabourID  -- Only include workers with DAILY WAGES

                    WHERE att.Status = 'P' -- Only count present days
                )
                SELECT 
                    -- Count total unique attendance days in the selected month
                    COUNT(DISTINCT att.[Date]) AS totalDays,  
                    
                    -- Count distinct days the labour was present
                    COUNT(DISTINCT CASE WHEN att.Status = 'P' THEN att.[Date] END) AS presentDays,

                    -- Count distinct days the labour was absent
                    COUNT(DISTINCT CASE WHEN att.Status = 'A' THEN att.[Date] END) AS absentDays,

                    -- Count distinct days the labour had a half-day
                    COUNT(DISTINCT CASE WHEN att.Status = 'HD' THEN att.[Date] END) AS halfDays,

                    -- Count distinct days the labour had a missed punch
                    COUNT(DISTINCT CASE WHEN att.Status = 'MP' THEN att.[Date] END) AS missPunchDays,

                     -- Count distinct days the labour had a missed punch
                    COUNT(DISTINCT CASE WHEN att.Status = 'WO' THEN att.[Date] END) AS weeklyOffDay,

                    -- Count normal overtime days
                    COUNT(DISTINCT CASE WHEN att.Status = 'O' THEN att.[Date] END) AS normalOvertimeCount,

                    -- Count how many holidays exist in the selected month
                    COUNT(DISTINCT hol.HolidayDate) AS totalHolidaysInMonth,

                    -- Sum only the actual TotalHours for holidays where the worker was present
                    SUM(CASE 
                        WHEN att.Status = 'P' 
                             AND hol.HolidayDate IS NOT NULL 
                             AND att.TotalHours IS NOT NULL
                        THEN att.TotalHours 
                        ELSE 0 
                    END) AS holidayOvertimeHours,

                   
                    SUM(CASE 
                        WHEN att.Status = 'P' 
                             AND hol.HolidayDate IS NOT NULL 
                             AND att.TotalHours IS NOT NULL
                             AND wages.PerHourWages IS NOT NULL
                        THEN att.TotalHours * wages.PerHourWages 
                        ELSE 0 
                    END) AS holidayOvertimeWages,

    SUM(CASE 
        WHEN att.TotalHours IS NOT NULL 
        THEN att.TotalHours 
        ELSE 0 
    END) AS totalHoursForMonth

                FROM [dbo].[LabourAttendanceDetails] att

                -- Join with HolidayDate table to ensure correct holiday mapping
                LEFT JOIN [dbo].[HolidayDate] hol
                    ON att.[Date] = hol.HolidayDate  
                    AND MONTH(hol.HolidayDate) = @month
                    AND YEAR(hol.HolidayDate) = @year  -- Ensure only holidays in the selected month

                -- Join with LabourMonthlyWages but avoid duplicates
                LEFT JOIN (
                    SELECT LabourID, MAX(PerHourWages) AS PerHourWages
                    FROM [dbo].[LabourMonthlyWages]
                    WHERE PayStructure IN ('DAILY WAGES', 'FIXED MONTHLY WAGES')
                    GROUP BY LabourID
                ) wages
                    ON att.LabourID = wages.LabourID  -- Only include workers with DAILY WAGES

                WHERE 
                    att.LabourID = @labourId
                    AND MONTH(att.[Date]) = @month
                    AND YEAR(att.[Date]) = @year;
            `);

    const row = result.recordset[0] || {};

    return {
      totalDays: row.totalDays || 0,
      presentDays: row.presentDays || 0,
      absentDays: row.absentDays || 0,
      halfDays: row.halfDays || 0,
      missPunchDays: row.missPunchDays || 0,
      weeklyOffDay: row.weeklyOffDay || 0,
      normalOvertimeCount: row.normalOvertimeCount || 0,
      totalHolidaysInMonth: row.totalHolidaysInMonth || 0,
      holidayOvertimeHours: row.holidayOvertimeHours || 0,
      holidayOvertimeWages: row.holidayOvertimeWages || 0,
      totalHoursForMonth: row.totalHoursForMonth || 0,
    };
  } catch (error) {
    console.error("Error in getAttendanceSummaryForLabour:", error);
    throw error;
  }
}

async function getVariablePayForLabour(labourId, month, year) {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("labourId", sql.NVarChar, labourId)
      .input("month", sql.Int, month)
      .input("year", sql.Int, year).query(`
                SELECT 
                    -- Sum of Advance amounts (only if IsApproved=1)
                    ISNULL(SUM(
                        CASE 
                            WHEN PayStructure = 'Advance' 
                                 AND AdvancePay = 1 
                                 AND IsApproved = 1 
                            THEN CAST(VariablePayAmount AS DECIMAL(18,2)) 
                            ELSE 0 
                        END
                    ), 0) AS totalAdvance,

                    -- Concatenate all Advance remarks (only if IsApproved=1)
                    STRING_AGG(
                        CASE 
                            WHEN PayStructure = 'Advance' 
                                 AND AdvancePay = 1 
                                 AND IsApproved = 1
                            THEN variablePayRemark 
                            ELSE NULL 
                        END, 
                        ', '
                    ) AS remarksAdvance,

                    -- Sum of Debit amounts (only if IsApproved=1)
                    ISNULL(SUM(
                        CASE 
                            WHEN PayStructure = 'Debit'
                                 AND DebitPay = 1
                                 AND IsApproved = 1
                            THEN CAST(VariablePayAmount AS DECIMAL(18,2)) 
                            ELSE 0 
                        END
                    ), 0) AS totalDebit,

                    -- Concatenate all Debit remarks (only if IsApproved=1)
                    STRING_AGG(
                        CASE 
                            WHEN PayStructure = 'Debit' 
                                 AND DebitPay = 1 
                                 AND IsApproved = 1
                            THEN variablePayRemark 
                            ELSE NULL 
                        END, 
                        ', '
                    ) AS remarksDebit,

                    -- Sum of Incentive amounts (only if IsApproved=1)
                    ISNULL(SUM(
                        CASE 
                            WHEN PayStructure = 'Incentive'
                                 AND IncentivePay = 1
                                 AND IsApproved = 1
                            THEN CAST(VariablePayAmount AS DECIMAL(18,2))
                            ELSE 0
                        END
                    ), 0) AS totalIncentive,

                    -- Concatenate all Incentive remarks (only if IsApproved=1)
                    STRING_AGG(
                        CASE 
                            WHEN PayStructure = 'Incentive' 
                                 AND IncentivePay = 1 
                                 AND IsApproved = 1
                            THEN variablePayRemark
                            ELSE NULL
                        END,
                        ', '
                    ) AS remarksIncentive

                FROM [VariablePay]
                WHERE
                    LabourID = @labourId
                    AND Month(EffectiveDate) = @month
                    AND Year(EffectiveDate) = @year
            `);

    // If no rows returned or the sums are all null, default to 0
    if (!result.recordset.length) {
      return {
        advance: 0,
        advanceRemarks: "",
        debit: 0,
        debitRemarks: "",
        incentive: 0,
        incentiveRemarks: "",
      };
    }

    // Destructure the returned columns
    const {
      totalAdvance,
      remarksAdvance,
      totalDebit,
      remarksDebit,
      totalIncentive,
      remarksIncentive,
    } = result.recordset[0];

    // Build the final object
    return {
      advance: totalAdvance || 0,
      advanceRemarks: remarksAdvance || "",
      debit: totalDebit || 0,
      debitRemarks: remarksDebit || "",
      incentive: totalIncentive || 0,
      incentiveRemarks: remarksIncentive || "",
    };
  } catch (error) {
    console.error("Error in getVariablePayForLabour:", error);
    throw error;
  }
}

async function getWageInfoForLabour(labourId, month, year) {
  const timer = `getWageInfoForLabour-${labourId}`;
  try {
    const pool = await poolPromise;

    // Last day of the target month
    const lastDayOfMonth = new Date(Date.UTC(year, month, 0));

    // Start of the target month
    const firstDayOfMonth = new Date(Date.UTC(year, month - 1, 1));

    const result = await pool
      .request()
      .input("labourId", sql.NVarChar, labourId)
      .input("monthEnd", sql.DateTime, lastDayOfMonth).query(`
         SELECT
          w.WageID,
          w.FromDate,
          w.ApprovalDate,
          w.EffectiveDate,
          w.PayStructure,
          w.DailyWages,
          w.PerHourWages,
          w.MonthlyWages,
          w.YearlyWages,
          w.WeeklyOff,
          w.FixedMonthlyWages,
          onb.workingHours AS OnboardWorkingHours
        FROM [dbo].[LabourMonthlyWages] w
        LEFT JOIN [labourOnboarding] onb
          ON onb.LabourID = w.LabourID
        WHERE
          w.LabourID = @labourId
          AND w.isApprovalDoneAdmin = 1
          AND w.EffectiveDate <= @monthEnd
        ORDER BY
          w.EffectiveDate ASC,
          w.ApprovalDate ASC
        `);

    if (result.recordset.length === 0) {
      // No wage record applies in this month
      return null;
    }

    // 2) Sort the result in ascending order by EffectiveDate (and ApprovalDate),
    //    so the earliest effective wage is first, the newest is last.
    // (If your query’s ORDER BY is already ascending, you can skip a manual sort.)
    const wages = result.recordset.map((r) => ({
      ...r,
      EffectiveDate: new Date(r.EffectiveDate),
      ApprovalDate: r.ApprovalDate ? new Date(r.ApprovalDate) : null,
    }));
    // wages.sort((a, b) => a.EffectiveDate - b.EffectiveDate);
    // (If needed, you can explicitly sort here.)
    const workingHours = wages[0].OnboardWorkingHours || 0;
    // 3) Iterate through all wage entries and compute partial-month wages.
    let totalWagesForMonth = 0;
    let wageBreakdown = [];

    for (let i = 0; i < wages.length; i++) {
      const currentWage = wages[i];

      // The start date for this wage slice is the later of:
      //   - the wage's EffectiveDate
      //   - the first day of the target month
      let sliceStart = new Date(
        Math.max(currentWage.EffectiveDate, firstDayOfMonth)
      );

      // The end date for this wage slice is the earlier of:
      //   - one day before the next wage’s EffectiveDate
      //   - the last day of the target month
      let nextEffectiveDate =
        i < wages.length - 1 ? wages[i + 1].EffectiveDate : null;
      let sliceEnd = nextEffectiveDate
        ? new Date(nextEffectiveDate.getTime() - 24 * 60 * 60 * 1000) // day before next wage
        : lastDayOfMonth;

      // Make sure we clamp the sliceEnd to at most the lastDayOfMonth
      if (sliceEnd > lastDayOfMonth) {
        sliceEnd = lastDayOfMonth;
      }

      // If the slice range is invalid or outside the month, skip
      if (sliceStart > sliceEnd) {
        continue;
      }

      // Calculate how many days are in [sliceStart, sliceEnd] (inclusive)
      const daysInSlice = daysBetweenInclusive(sliceStart, sliceEnd);

      // Use your partial wage formula
      let partialWage = calculatePartialWage(
        currentWage,
        daysInSlice,
        getDaysInMonth(year, month) // e.g. 31 for January
      );
      partialWage = Math.round(partialWage * 100) / 100;
      totalWagesForMonth += partialWage;

      wageBreakdown.push({
        wageId: currentWage.WageID,
        effectiveDate: currentWage.EffectiveDate,
        sliceStart: sliceStart.toISOString().split("T")[0],
        sliceEnd: sliceEnd.toISOString().split("T")[0],
        daysInSlice,
        partialWage,
        payStructure: currentWage.PayStructure,
        weeklyOff: currentWage.WeeklyOff,
        dailyWages: currentWage.DailyWages,
        monthlyWages: currentWage.MonthlyWages,
        fixedMonthlyWages: currentWage.FixedMonthlyWages,
      });
    }
    totalWagesForMonth = Math.round(totalWagesForMonth * 100) / 100;
    return {
      month,
      year,
      workingHours,
      totalWagesForMonth,
      wageBreakdown,
    };
  } catch (error) {
    console.error("Error in getWageInfoForLabour:", error);
    throw error;
  } finally {
    console.timeEnd(timer);
  }
}

function calculatePartialWage(wageRecord, daysApplicable, daysInMonth) {
  if (!wageRecord) return 0;

  const payStructure = wageRecord.PayStructure?.toUpperCase() || "";

  // 1) DAILY WAGES
  if (payStructure.includes("DAILY")) {
    return (wageRecord.DailyWages || 0) * daysApplicable;
  }

  // 2) FIXED MONTHLY WAGES
  if (payStructure.includes("FIXED")) {
    const fixedMonthly = wageRecord.FixedMonthlyWages || 0;
    return (fixedMonthly / daysInMonth) * daysApplicable;
  }

  // 3) REGULAR MONTHLY WAGES
  if (payStructure.includes("MONTHLY")) {
    const monthly = wageRecord.MonthlyWages || 0;
    return (monthly / daysInMonth) * daysApplicable;
  }

  // 4) Default to 0
  return 0;
}

function daysBetweenInclusive(date1, date2) {
  const msInDay = 24 * 60 * 60 * 1000;
  // Ensure date1 <= date2
  const start = new Date(
    date1.getFullYear(),
    date1.getMonth(),
    date1.getDate()
  );
  const end = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
  return Math.floor((end - start) / msInDay) + 1;
}

/**
 * Simple helper to get # of days in a given month/year.
 */
function getDaysInMonth(year, month) {
  // month is 1-based in this example, so we do new Date(year, month, 0)
  return new Date(year, month, 0).getDate();
}

/**
 * Utility: number of days inclusive between two JS Date objects.
 * E.g. Jan 1 to Jan 14 => 14 days
 * Make sure times are set to midnight or the calculation might be off by 1.
 */
function daysBetweenInclusive(d1, d2) {
  // copy to avoid mutating originals
  const date1 = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate());
  const date2 = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate());
  // difference in ms
  const diffTime = date2.getTime() - date1.getTime();
  // convert ms to days
  return Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
}

// function calculatePartialWage(wageRecord, daysApplicable, daysInMonth) {
//   if (!wageRecord) return 0;

//   // 1) DAILY WAGES
//   if (
//     wageRecord.PayStructure &&
//     wageRecord.PayStructure.toLowerCase().includes("DAILY WAGES")
//   ) {
//     return (wageRecord.DailyWages || 0) * daysApplicable;
//   }

//   // 2) FIXED MONTHLY
//   if (wageRecord.FixedMonthlyWages) {
//     return (wageRecord.FixedMonthlyWages / daysInMonth) * daysApplicable;
//   }

//   // 3) REGULAR MONTHLY
//   if (wageRecord.MonthlyWages) {
//     return (wageRecord.MonthlyWages / daysInMonth) * daysApplicable;
//   }

//   // 4) ELSE 0
//   return 0;
// }

async function getEligibleLabours(month, year, projectIds, idsArray) {
  console.log(
    "getEligibleLabours called with month:",
    month,
    "year:",
    year,
    "projectId:",
    projectIds,
    "idsArray:",
    idsArray
  );
  try {
    const pool = await poolPromise;

    const startDate = `${year}-${month.toString().padStart(2, "0")}-01`;
    const endDateObj = new Date(year, month, 0); // last day of month
    const endDate = endDateObj.toLocaleDateString("en-CA");

    console.log("startDate:", startDate, "endDate:", endDate);

    let onboardingQuery = `
          SELECT DISTINCT onboard.LabourID, onboard.status
FROM [labourOnboarding] AS onboard
WHERE
  onboard.status IN ('Approved', 'Disable')
  AND (
    @projectIds IS NULL
    OR CAST(onboard.projectName AS VARCHAR) IN (
      SELECT value FROM STRING_SPLIT(@projectIds, ',')
    )
  )
  AND (
    @labourIds IS NULL
    OR onboard.LabourID IN (
      SELECT TRIM(value) FROM STRING_SPLIT(@labourIds, ',')
    )
  )
ORDER BY onboard.LabourID
        `;

    const onboardingRequest = pool.request();
    onboardingRequest.input("startDate", sql.Date, startDate);
    onboardingRequest.input("endDate", sql.Date, endDate);

    if (projectIds && projectIds.length > 0) {
      onboardingRequest.input("projectIds", sql.VarChar, projectIds.join(","));
    } else {
      onboardingRequest.input("projectIds", sql.VarChar, null);
    }

    if (idsArray && idsArray.length > 0) {
      onboardingRequest.input("labourIds", sql.VarChar, idsArray.join(","));
    } else {
      onboardingRequest.input("labourIds", sql.VarChar, null);
    }
    const onboardingResult = await onboardingRequest.query(onboardingQuery);
    console.log("onboardingResult===>", onboardingResult.recordset.length);
    const labourMap = {};

    onboardingResult.recordset.forEach((row) => {
      const id = row.LabourID;
      if (!labourMap[id]) {
        labourMap[id] = [];
      }
      labourMap[id].push(row.status);
    });

    const eligibleLabourIds = [];

    for (const id in labourMap) {
      const statuses = labourMap[id];
      if (statuses.length > 1 && statuses.includes("Approved")) {
        eligibleLabourIds.push(id);
      } else if (statuses.length === 1) {
        eligibleLabourIds.push(id);
      }
    }

    if (eligibleLabourIds.length === 0) {
      return [];
    }

    const attendanceRequest = pool.request();
    attendanceRequest.input("month", sql.Int, month);
    attendanceRequest.input("year", sql.Int, year);
    attendanceRequest.input(
      "labourIds",
      sql.VarChar,
      eligibleLabourIds.join(",")
    );

    const query = `
            WITH AttendanceCTE AS (
                SELECT 
                    LabourId,
                    SUM(
                        CASE 
                            WHEN [Status] IN ('P', 'HD', 'H', 'MP', 'O') THEN 1 
                            ELSE 0
                        END
                    ) AS AttendanceCount
                FROM [dbo].[LabourAttendanceDetails]
                WHERE 
                    MONTH([Date]) = @month
                    AND YEAR([Date]) = @year
                GROUP BY LabourId
            ),
            RankedLabours AS (
                SELECT 
                    onboarding.id,
                    onboarding.LabourID AS LabourId,
                    onboarding.name,
                    onboarding.businessUnit,
                    onboarding.projectName,
                    onboarding.departmentName,
                    onboarding.department,
                    onboarding.workingHours,
                    onboarding.aadhaarNumber,
                    onboarding.accountNumber,
                    onboarding.status,
                    AttendanceCTE.AttendanceCount,
                    ROW_NUMBER() OVER (
                        PARTITION BY onboarding.LabourID
                        ORDER BY CASE 
                            WHEN onboarding.status = 'Approved' THEN 1
                            WHEN onboarding.status = 'Disable' THEN 2
                            ELSE 3
                        END
                    ) AS rn
                FROM 
                    [labourOnboarding] AS onboarding
                INNER JOIN 
                    AttendanceCTE ON AttendanceCTE.LabourId = onboarding.LabourID
                WHERE 
                    onboarding.status IN ('Approved', 'Disable')
                    AND AttendanceCTE.AttendanceCount > 0
                    AND NOT EXISTS (
                        SELECT 1 
                        FROM [dbo].[FinalizedSalaryPay] AS finalized
                        WHERE 
                            finalized.LabourID = onboarding.LabourID
                            AND finalized.[Month] = @month
                            AND finalized.[Year] = @year
                    )
                    AND onboarding.LabourID IN (SELECT value FROM STRING_SPLIT(@labourIds, ','))
            )
            SELECT * FROM RankedLabours WHERE rn = 1 ORDER BY LabourId;
        `;

    const result = await attendanceRequest.query(query);

    const labourDetails = result.recordset.map((row) => ({
      id: row.id,
      labourId: row.LabourId,
      name: row.name,
      businessUnit: row.businessUnit,
      projectName: row.projectName,
      departmentName: row.departmentName,
      department: row.department,
      aadhaarNumber: row.aadhaarNumber,
      accountNumber: row.accountNumber,
      attendanceCount: row.AttendanceCount,
      status: row.status,
    }));

    return labourDetails;
  } catch (error) {
    console.error("Error in getEligibleLabours:", error);
    throw error;
  }
}

async function calculateTotalOvertime(labourId, month, year) {
  try {
    const selectedMonth = `${year}-${month.toString().padStart(2, "0")}`;

    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("labourId", sql.NVarChar, labourId)
      .input("selectedMonth", sql.NVarChar, selectedMonth).query(`
                SELECT TotalOvertimeHoursManually 
                FROM [dbo].[LabourAttendanceSummary] 
                WHERE LabourId = @labourId 
                  AND SelectedMonth = @selectedMonth
            `);

    if (!result.recordset || result.recordset.length === 0) {
      return 0; // Return 0 instead of throwing error
    }

    const total = parseFloat(
      result.recordset[0].TotalOvertimeHoursManually || 0
    );
    const cappedOvertime = total > 120 ? 120 : total;

    return cappedOvertime;
  } catch (error) {
    console.error("Error in calculateTotalOvertime:", error);
    return 0;
  }
}

function withTimeout(
  promise,
  ms = DEFAULT_TIMEOUT_MS,
  label = "Operation",
  fallbackValue = null
) {
  return Promise.race([
    promise.catch((err) => {
      console.error(`[ERROR] ${label} failed:`, err);
      throw err;
    }),
    new Promise((resolve) => {
      setTimeout(() => {
        const msg = `[TIMEOUT] ${label} exceeded ${ms} ms`;
        console.error(msg);
        resolve(fallbackValue);
      }, ms);
    }),
  ]);
}

async function calculateSalaryForLabour(labourId, month, year) {
  const salaryTimer = `Salary-${labourId}`;
  try {
    const wagesInfo = await withTimeout(
      getWageInfoForLabour(labourId, month, year),
      DEFAULT_TIMEOUT_MS,
      `getWageInfoForLabour-${labourId}`
    );
    if (!wagesInfo) {
      return {
        labourId,
        month,
        year,
        message: `No approved wages found for labour ID: ${labourId}`,
      };
    }
    const { wageBreakdown = [], workingHours } = wagesInfo;
    const forSundaylatestWage = wageBreakdown[wageBreakdown.length - 1];
    const forSundaydailyWageRate = forSundaylatestWage?.dailyWages || 0;

    console.time("getAttendanceSummary");
    let attendance;
    if (forSundaydailyWageRate) {
      attendance = await withTimeout(
        getAttendanceSummaryForLabour(
          labourId,
          month,
          year,
          workingHours,
          forSundaydailyWageRate
        ),
        DEFAULT_TIMEOUT_MS,
        `getAttendanceSummaryForLabour-${labourId}`
      );
    } else {
      attendance = await withTimeout(
        getAttendanceSummaryForLabourMonthly(labourId, month, year),
        DEFAULT_TIMEOUT_MS,
        `getAttendanceSummaryForLabourMonthly-${labourId}`
      );
    }
    console.timeEnd("getAttendanceSummary");

    const variablePay = await withTimeout(
      getVariablePayForLabour(labourId, month, year),
      DEFAULT_TIMEOUT_MS,
      `getVariablePayForLabour-${labourId}`
    );
    let cappedOvertime = 0;

    try {
      cappedOvertime = await withTimeout(
        calculateTotalOvertime(labourId, month, year),
        DEFAULT_TIMEOUT_MS,
        `calculateTotalOvertime-${labourId}`
      );
    } finally {
      // console.timeEnd('calculateTotalOvertime');
    }

    if (!wagesInfo || !wagesInfo.wageBreakdown?.length) {
      console.warn("[WARN] No valid wages found.");
      return {
        labourId,
        month,
        year,
        message: `No valid wages found for labour ID: ${labourId}`,
      };
    }

    const {
      presentDays = 0,
      absentDays = 0,
      halfDays = 0,
      missPunchDays = 0,
      normalOvertimeCount = 0,
      holidayOvertimeHours = 0,
      holidayOvertimeWages = 0,
      totalHolidaysInMonth = 0,
      totalHoursForMonth = 0,
      sundayPayment = 0,
      additionalHalf = 0,
      additionalPresent = 0,
      weeklyOffDay: weeklyOffDays = 0,
    } = attendance;

    // Destructure variable pay
    const {
      advance = 0,
      advanceRemarks = "-",
      debit = 0,
      debitRemarks = "-",
      incentive = 0,
      incentiveRemarks = "-",
    } = variablePay;

    let latestWage = wageBreakdown[wageBreakdown.length - 1];
    for (let i = wageBreakdown.length - 1; i >= 0; i--) {
      const wage = wageBreakdown[i];
      if (wage.fixedMonthlyWages > 0 || wage.monthlyWages > 0) {
        latestWage = wage;
        break;
      }
    }
    const wageType = (latestWage?.payStructure || "").toUpperCase();
    const dailyWageRate = latestWage?.dailyWages || 0;
    const monthlySalary = latestWage?.monthlyWages || 0;
    const fixedMonthlyWage = latestWage?.fixedMonthlyWages || 0;
    const daysInSlice = latestWage?.daysInSlice || getDaysInMonth(year, month);
    const workingHoursRaw = wagesInfo.workingHours || "";
    const parsedWorkingHours =
      workingHoursRaw === "FLEXI SHIFT - 9 HRS" ? 9 : 8;

    let baseWage = 0;
    let weeklyOffPay = 0;
    const isDailyWage = wageType.includes("DAILY");
    const isFixedMonthly = wageType.includes("FIXED");
    const totalHrsExcludingOT = totalHoursForMonth - cappedOvertime;

    if (isDailyWage) {
      const totalPossibleHours = presentDays * parsedWorkingHours;
      const hourlyWage = dailyWageRate / parsedWorkingHours;
      baseWage = totalPossibleHours * hourlyWage;
      baseWage += sundayPayment;
    } else if (isFixedMonthly) {
      const baseMonthly = fixedMonthlyWage || monthlySalary;
      const hourlyWage = baseMonthly / (daysInSlice * parsedWorkingHours);
      const expectedDays =
        presentDays +
        (latestWage?.weeklyOff && latestWage?.weeklyOff > 0
          ? weeklyOffDays
          : 0);

      if (
        expectedDays >= daysInSlice &&
        (latestWage?.weeklyOff || latestWage?.weeklyOff > 0)
      ) {
        const actualWorkedHours = presentDays * parsedWorkingHours;
        const workedPay = actualWorkedHours * hourlyWage;
        weeklyOffPay =
          presentDays <= daysInSlice / 2
            ? (weeklyOffDays / 2) * parsedWorkingHours * hourlyWage
            : weeklyOffDays * parsedWorkingHours * hourlyWage;

        baseWage = Math.round(workedPay + weeklyOffPay);
      } else if (expectedDays >= daysInSlice) {
        baseWage = baseMonthly;
      } else {
        const actualWorkedHours = presentDays * parsedWorkingHours;
        const workedPay = actualWorkedHours * hourlyWage;

        weeklyOffPay =
          presentDays <= daysInSlice / 2
            ? (weeklyOffDays / 2) * parsedWorkingHours * hourlyWage
            : weeklyOffDays * parsedWorkingHours * hourlyWage;

        baseWage = latestWage?.weeklyOff
          ? Math.round(workedPay + weeklyOffPay)
          : Math.round(workedPay);
      }
      baseWage += sundayPayment;
    }

    const derivedPerHour =
      isDailyWage && parsedWorkingHours > 0
        ? dailyWageRate / parsedWorkingHours
        : 0;

    const overtimePay = isDailyWage ? cappedOvertime * derivedPerHour : 0;

    const hasAttendanceIssues =
      absentDays > 0 || missPunchDays > 0 || halfDays > 0;

    let holidayOvertimePay = 0;
    if (isDailyWage) {
      holidayOvertimePay = hasAttendanceIssues
        ? totalHolidaysInMonth * dailyWageRate
        : 0;
    } else {
      holidayOvertimePay = holidayOvertimeWages || 0;
    }

    const previousWageAmount = 0;
    const bonuses = incentive || 0;
    const totalAttendanceDeductions = 0;
    const totalDeductions = totalAttendanceDeductions + advance + debit;

    let grossPay = baseWage + bonuses;
    if (isDailyWage) {
      grossPay += overtimePay + holidayOvertimePay + previousWageAmount;
    }

    let netPay = grossPay - totalDeductions;
    const isNegativeSalary = netPay < 0;
    netPay = Math.max(netPay, 0);

    return {
      labourId,
      month,
      year,
      IsWagesApproved: true,
      wageType,
      dailyWageRate: dailyWageRate.toFixed(2),
      monthlySalary: monthlySalary.toFixed(2),
      fixedMonthlyWage: fixedMonthlyWage.toFixed(2),
      workingHours: workingHoursRaw,
      parsedWorkingHours,
      daysInSlice,
      weeklyOffDays,

      attendance: {
        presentDays,
        absentDays,
        halfDays,
        missPunchDays,
        normalOvertimeCount,
        holidayOvertimeHours,
        holidayOvertimeWages,
        totalHolidaysInMonth,
        sundayPayment,
        additionalHalf,
        additionalPresent,
      },

      wagesInfo,
      variablePay: {
        advance: advance.toFixed(2),
        advanceRemarks,
        debit: debit.toFixed(2),
        debitRemarks,
        incentive: incentive.toFixed(2),
        incentiveRemarks,
      },

      cappedOvertime: cappedOvertime.toFixed(2),
      derivedPerHour: derivedPerHour.toFixed(2),
      overtimePay: overtimePay.toFixed(2),
      holidayOvertimePay: holidayOvertimePay.toFixed(2),
      baseWage: baseWage.toFixed(2),
      weeklyOffPay: weeklyOffPay.toFixed(2),
      previousWageAmount: previousWageAmount.toFixed(2),
      bonuses: bonuses.toFixed(2),
      totalAttendanceDeductions: totalAttendanceDeductions.toFixed(2),
      totalDeductions: totalDeductions.toFixed(2),
      grossPay: grossPay.toFixed(2),
      netPay: netPay.toFixed(2),
      isNegativeSalary,
    };
  } catch (error) {
    const isTimeout = error.message.toLowerCase().includes("timed out");
    console.error(
      `[ERROR] Failed to process payroll for labourId: ${labourId}`,
      error
    );
    return {
      labourId,
      month,
      year,
      error: isTimeout
        ? "Request timed out while calculating salary."
        : error.message,
      message: "Error fetching salary generation data.",
    };
  } finally {
    console.timeEnd(salaryTimer);
  }
}

/**
 * Utility: Days in a given month/year
 */
function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

async function generateMonthlyPayroll(month, year) {
  const failedLabourIds = [];
  const alreadyExistLabourIds = [];
  let finalSalaries = [];

  try {
    // 1️⃣ Get all eligible labours and existing payroll records for this month/year
    const [eligibleLabours, existingPayrolls] = await Promise.all([
      getEligibleLabours(month, year),
      getExistingPayrolls(month, year),
    ]);

    // 2️⃣ Sort labour by ID for consistent order
    eligibleLabours.sort((a, b) => a.labourId.localeCompare(b.labourId));

    // 3️⃣ Acquire DB pool
    const pool = await poolPromise;

    // 4️⃣ Fetch labour details from [labourOnboarding] in bulk (for all eligible labours)
    const labourIds = eligibleLabours.map((labour) => labour.labourId);
    const labourDetailsResult = await pool.request().query(`
                SELECT 
                    id, LabourID, name, businessUnit, projectName, departmentName, department, aadhaarNumber, accountNumber, ifscCode
                FROM [dbo].[labourOnboarding]
                WHERE LabourID IN ('${labourIds.join("','")}')
                  AND status IN ('Approved', 'Disable')
            `);

    const labourDetailsMap = labourDetailsResult.recordset.reduce(
      (acc, detail) => {
        acc[detail.LabourID] = detail;
        return acc;
      },
      {}
    );

    // 5️⃣ Process each labour
    const salaryPromises = eligibleLabours.map(async (labour) => {
      try {
        const labourId = labour.labourId;

        if (existingPayrolls.includes(labourId)) {
          alreadyExistLabourIds.push(labourId);
          return;
        }

        const labourDetails = labourDetailsMap[labourId];
        if (!labourDetails) {
          failedLabourIds.push(labourId);
          return;
        }

        const salaryDetail = await calculateSalaryForLabour(
          labourId,
          month,
          year
        );
        if (!salaryDetail || !salaryDetail.labourId) {
          failedLabourIds.push(labourId);
          return;
        }

        finalSalaries.push(salaryDetail);

        // Prepare data for bulk insert
        const attendance = salaryDetail.attendance ?? {
          presentDays: 0,
          absentDays: 0,
          halfDays: 0,
          missPunchDays: 0,
          normalOvertimeCount: 0,
          holidayOvertimeCount: 0,
          totalHolidaysInMonth: 0,
          holidayOvertimeHours: 0,
          holidayOvertimeWages: 0,
        };

        const variablePay = salaryDetail.variablePay ?? {
          advance: 0,
          advanceRemarks: "",
          debit: 0,
          debitRemarks: "",
          incentive: 0,
          incentiveRemarks: "",
        };

        const truncateString = (str, num) =>
          str && str.length > num ? str.slice(0, num) : str || "";

        if (salaryDetail.IsWagesApproved) {
          await pool
            .request()
            .input("labourId", sql.NVarChar, salaryDetail.labourId)
            .input("month", sql.Int, month)
            .input("year", sql.Int, year)
            .input("wageType", sql.NVarChar, salaryDetail.wageType)
            .input(
              "dailyWageRate",
              sql.Decimal(18, 2),
              salaryDetail.dailyWageRate
            )
            .input(
              "fixedMonthlyWage",
              sql.Decimal(18, 2),
              salaryDetail.fixedMonthlyWage
            )
            .input("presentDays", sql.Int, attendance.presentDays || 0)
            .input("absentDays", sql.Int, attendance.absentDays)
            .input("halfDays", sql.Int, attendance.halfDays)
            .input("missPunchDays", sql.Int, attendance.missPunchDays)
            .input(
              "normalOvertimeCount",
              sql.Int,
              attendance.normalOvertimeCount
            )
            .input(
              "holidayOvertimeCount",
              sql.Int,
              attendance.holidayOvertimeCount
            )
            .input(
              "totalHolidaysInMonth",
              sql.Int,
              attendance.totalHolidaysInMonth
            )
            .input(
              "holidayOvertimePay",
              sql.Decimal(18, 2),
              salaryDetail.holidayOvertimePay
            )
            .input(
              "holidayOvertimeHours",
              sql.Decimal(18, 2),
              attendance.holidayOvertimeHours
            )
            .input(
              "holidayOvertimeWages",
              sql.Decimal(18, 2),
              attendance.holidayOvertimeWages
            )
            .input(
              "cappedOvertime",
              sql.Decimal(18, 2),
              salaryDetail.cappedOvertime
            )
            .input("basicSalary", sql.Decimal(18, 2), salaryDetail.baseWage)
            .input(
              "previousWageAmount",
              sql.Decimal(18, 2),
              salaryDetail.previousWageAmount
            )
            .input(
              "totalAttendanceDeductions",
              sql.Decimal(18, 2),
              salaryDetail.totalAttendanceDeductions
            )
            .input("overtimePay", sql.Decimal(18, 2), salaryDetail.overtimePay)
            .input(
              "weeklyOffPay",
              sql.Decimal(18, 2),
              salaryDetail.weeklyOffPay
            )
            .input("bonuses", sql.Decimal(18, 2), salaryDetail.bonuses)
            .input(
              "totalDeductions",
              sql.Decimal(18, 2),
              salaryDetail.totalDeductions
            )
            .input("grossPay", sql.Decimal(18, 2), salaryDetail.grossPay)
            .input("netPay", sql.Decimal(18, 2), salaryDetail.netPay)

            // Variable Pay
            .input("advance", sql.Decimal(18, 2), variablePay.advance)
            .input(
              "advanceRemarks",
              sql.NVarChar,
              truncateString(variablePay.advanceRemarks, 255)
            )
            .input("debit", sql.Decimal(18, 2), variablePay.debit)
            .input(
              "debitRemarks",
              sql.NVarChar,
              truncateString(variablePay.debitRemarks, 255)
            )
            .input("incentive", sql.Decimal(18, 2), variablePay.incentive)
            .input(
              "incentiveRemarks",
              sql.NVarChar,
              truncateString(variablePay.incentiveRemarks, 255)
            )
            .input("id", sql.Int, labourDetails.id)
            .input("name", sql.NVarChar, labourDetails.name)
            .input("businessUnit", sql.NVarChar, labourDetails.businessUnit)
            .input("projectName", sql.Int, labourDetails.projectName)
            .input("departmentName", sql.NVarChar, labourDetails.departmentName)
            .input("department", sql.Int, labourDetails.department)
            .input(
              "aadhaarNumber",
              sql.NVarChar(15),
              labourDetails.aadhaarNumber
            )
            .input(
              "accountNumber",
              sql.NVarChar(20),
              labourDetails.accountNumber
            )
            .input("ifscCode", sql.Int, labourDetails.ifscCode).query(`
              INSERT INTO [dbo].[FinalizedSalaryPay] (
                  LabourID, month, year, WageType, dailyWageRate, fixedMonthlyWage,
                  PresentDays, AbsentDays, HalfDays, missPunchDays, normalOvertimeCount, holidayOvertimeCount,
                  totalHolidaysInMonth, holidayOvertimePay, holidayOvertimeHours, holidayOvertimeWages, cappedOvertime,
                  BasicSalary, previousWageAmount, totalAttendanceDeductions, OvertimePay, WeeklyOffPay, Bonuses,
                  TotalDeductions, GrossPay, NetPay,
                  advance, AdvanceRemarks, debit, DebitRemarks, incentive, IncentiveRemarks,
                  id, name, businessUnit, projectName, departmentName, department, aadhaarNumber, accountNumber, ifscCode
              )
              VALUES (
                  @labourId, @month, @year, @wageType, @dailyWageRate, @fixedMonthlyWage,
                  @presentDays, @absentDays, @halfDays, @missPunchDays, @normalOvertimeCount, @holidayOvertimeCount,
                  @totalHolidaysInMonth, @holidayOvertimePay, @holidayOvertimeHours, @holidayOvertimeWages, @cappedOvertime,
                  @basicSalary, @previousWageAmount, @totalAttendanceDeductions, @overtimePay, @weeklyOffPay, @bonuses,
                  @totalDeductions, @grossPay, @netPay,
                  @advance, @advanceRemarks, @debit, @debitRemarks, @incentive, @incentiveRemarks,
                  @id, @name, @businessUnit, @projectName, @departmentName, @department, @aadhaarNumber, @accountNumber, @ifscCode)
              `);
        }
      } catch (error) {
        console.error(
          `❌ Failed payroll for labourId: ${labour.labourId}`,
          error
        );
        failedLabourIds.push(labour.labourId);
      }
    });

    // Wait for all salary processing to finish
    await Promise.all(salaryPromises);

    // 9️⃣ Log skipped labours
    if (failedLabourIds.length > 0 || alreadyExistLabourIds.length > 0) {
      await createJsonFileForSkippedLabours({
        month,
        year,
        dateGenerated: new Date().toISOString(),
        alreadyExistLabourIds,
        failedLabourIds,
      });
    }

    return finalSalaries;
  } catch (error) {
    console.error("❌ Error generating monthly payroll:", error);
    throw error;
  }
}

// Helper function to get existing payrolls
async function getExistingPayrolls(month, year) {
  const pool = await poolPromise;
  const result = await pool
    .request()
    .input("month", sql.Int, month)
    .input("year", sql.Int, year).query(`
            SELECT labourId 
            FROM [dbo].[FinalizedSalaryPay] 
            WHERE month = @month AND year = @year
        `);
  return result.recordset.map((record) => record.labourId);
}

/**
 * Writes skipped labour IDs to a JSON file for easy review:
 *  - alreadyExistLabourIds (those that already had payroll for this month/year)
 *  - failedLabourIds (those that had invalid data or an error)
 */
async function createJsonFileForSkippedLabours(data) {
  try {
    fs.writeFileSync(
      "SkippedLabours.json",
      JSON.stringify(data, null, 2),
      "utf8"
    );
  } catch (err) {
    console.error("❌ Failed to write JSON file:", err);
  }
}

async function deleteMonthlyPayrollData(month, year, labourIds = []) {
  try {
    const pool = await poolPromise;

    // If labourIds array is present & not empty, delete only those labourIds
    if (labourIds.length > 0) {
      // Build a parameter list for the IN clause, e.g. @lab0, @lab1, ...
      const labourIdParams = labourIds.map((_, i) => `@lab${i}`).join(", ");
      const request = pool.request();

      // Attach each labourId as an input parameter
      labourIds.forEach((id, i) => {
        request.input(`lab${i}`, sql.NVarChar, id);
      });

      // Also attach month & year
      request.input("month", sql.Int, month);
      request.input("year", sql.Int, year);

      const deleteQuery = `
          DELETE FROM [dbo].[FinalizedSalaryPay]
          WHERE month = @month
            AND year = @year
            AND labourId IN (${labourIdParams});
        `;

      const result = await request.query(deleteQuery);
      return {
        success: true,
        rowsAffected: result.rowsAffected[0],
        message: `Deleted ${
          result.rowsAffected[0]
        } record(s) for labourIds [${labourIds.join(", ")}].`,
      };
    }
    // Otherwise, delete all labourIds for the given month/year
    else {
      const result = await pool
        .request()
        .input("month", sql.Int, month)
        .input("year", sql.Int, year).query(`
            DELETE FROM [dbo].[FinalizedSalaryPay]
            WHERE month = @month
              AND year = @year
          `);

      return {
        success: true,
        rowsAffected: result.rowsAffected[0],
        message: `Deleted ${result.rowsAffected[0]} record(s) for month=${month}, year=${year}.`,
      };
    }
  } catch (error) {
    console.error("❌ Error deleting monthly payroll data:", error);
    throw error;
  }
}

async function getFinalizedSalaryData(month, year) {
  try {
    const pool = await poolPromise;

    // Base query
    let query = `
            SELECT * FROM [dbo].[FinalizedSalaryPay] 
            WHERE 1=1`;
    let request = pool.request();

    // Apply filters for month and year
    if (month) {
      query += ` AND month = @month`;
      request.input("month", sql.Int, parseInt(month));
    }
    if (year) {
      query += ` AND year = @year`;
      request.input("year", sql.Int, parseInt(year));
    }

    // Sort by year (descending) and month (descending) to get latest records first
    query += ` ORDER BY LabourID;`;
    // query += ` ORDER BY year DESC, month DESC;`;

    const result = await request.query(query);

    return result.recordset; // Return fetched data
  } catch (error) {
    console.error("Error fetching finalized salary data:", error);
    throw error;
  }
}

async function getFinalizedSalaryDataByLabourID({ labourId, month, year }) {
  try {
    const pool = await poolPromise;

    let query = `
            SELECT * FROM [dbo].[FinalizedSalaryPay]
            WHERE 1=1`;

    let request = pool.request();

    if (labourId) {
      query += ` AND LabourID = @labourId`;
      request.input("labourId", sql.NVarChar, labourId);
    }
    if (month) {
      query += ` AND month = @month`;
      request.input("month", sql.Int, parseInt(month));
    }
    if (year) {
      query += ` AND year = @year`;
      request.input("year", sql.Int, parseInt(year));
    }

    query += ` ORDER BY year DESC, month DESC;`;

    const result = await request.query(query);

    return result.recordset;
  } catch (error) {
    console.error("Error fetching finalized salary data by LabourID:", error);
    throw error;
  }
}

async function saveFinalizeSalaryData(salaryData) {
  const pool = await poolPromise; // Ensure poolPromise is correctly initialized and points to your SQL pool.
  let transaction;

  try {
    transaction = new sql.Transaction(pool); // Assign the transaction to a variable declared outside try block
    await transaction.begin();

    const request = new sql.Request(transaction);
    const table = new sql.Table("FinalizedSalaryPay");

    // Define columns exactly as per your database schema
    table.columns.add("labourId", sql.Int);
    table.columns.add("month", sql.Int);
    table.columns.add("year", sql.Int);
    table.columns.add("wageType", sql.NVarChar(50));
    table.columns.add("dailyWageRate", sql.Decimal(18, 2));
    table.columns.add("fixedMonthlyWage", sql.Decimal(18, 2));
    table.columns.add("presentDays", sql.Int);
    table.columns.add("absentDays", sql.Int);
    table.columns.add("halfDays", sql.Int);
    table.columns.add("missPunchDays", sql.Int);
    table.columns.add("normalOvertimeCount", sql.Int);
    table.columns.add("holidayOvertimeCount", sql.Int);
    table.columns.add("cappedOvertime", sql.Decimal(18, 2));
    table.columns.add("basicSalary", sql.Decimal(18, 2));
    table.columns.add("previousWageAmount", sql.Decimal(18, 2));
    table.columns.add("overtimePay", sql.Decimal(18, 2));
    table.columns.add("weeklyOffPay", sql.Decimal(18, 2));
    table.columns.add("bonuses", sql.Decimal(18, 2));
    table.columns.add("totalDeductions", sql.Decimal(18, 2));
    table.columns.add("grossPay", sql.Decimal(18, 2));
    table.columns.add("netPay", sql.Decimal(18, 2));
    table.columns.add("advance", sql.Decimal(18, 2));
    table.columns.add("advanceRemarks", sql.NVarChar(255));
    table.columns.add("debit", sql.Decimal(18, 2));
    table.columns.add("debitRemarks", sql.NVarChar(255));
    table.columns.add("incentive", sql.Decimal(18, 2));
    table.columns.add("incentiveRemarks", sql.NVarChar(255));

    // Populate the table with rows
    salaryData.forEach((item) => {
      table.rows.add(
        item.labourId,
        item.month,
        item.year,
        item.wageType,
        item.dailyWageRate,
        item.fixedMonthlyWage,
        item.presentDays,
        item.absentDays,
        item.halfDays,
        item.missPunchDays,
        item.normalOvertimeCount,
        item.holidayOvertimeCount,
        item.cappedOvertime,
        item.basicSalary,
        item.previousWageAmount,
        item.overtimePay,
        item.weeklyOffPay,
        item.bonuses,
        item.totalDeductions,
        item.grossPay,
        item.netPay,
        item.advance,
        item.advanceRemarks,
        item.debit,
        item.debitRemarks,
        item.incentive,
        item.incentiveRemarks
      );
    });

    await request.bulk(table); // Perform the bulk insert
    await transaction.commit(); // Commit transaction
    return { message: "Data saved successfully!" };
  } catch (error) {
    if (transaction) {
      await transaction.rollback(); // Rollback transaction if error
    }
    console.error("Error in saveFinalizeSalaryData:", error);
    throw error;
  }
}

async function getMonthlyPayrollData(month, year, projectName) {
  try {
    const pool = await poolPromise;
    let query = `
            SELECT 
                LabourID, name, businessUnit, projectName, departmentName, department,
                wageType, dailyWageRate, fixedMonthlyWage, presentDays, absentDays, halfDays, 
                basicSalary, overtimePay, weeklyOffPay, bonuses, totalDeductions, grossPay, netPay,
                advance, advanceRemarks, debit, debitRemarks, incentive, incentiveRemarks, month, year
            FROM [dbo].[FinalizedSalaryPay]
            WHERE month = @month AND year = @year`;

    let request = pool
      .request()
      .input("month", sql.Int, parseInt(month))
      .input("year", sql.Int, parseInt(year));

    if (projectName && projectName !== "all") {
      query += ` AND projectName = @projectName`;
      request.input("projectName", sql.NVarChar, projectName);
    }

    const result = await request.query(query);

    return result.recordset;
  } catch (error) {
    console.error("Error fetching finalized salary data for export:", error);
    throw error;
  }
}

async function getWagesByDateRange(projectName, payStructure, approvalStatus) {
  const pool = await poolPromise;

  console.log("projectName:", projectName, "| payStructure:", payStructure);

  const query = `
      WITH RankedWages AS (
        SELECT 
          *,
          ROW_NUMBER() OVER (PARTITION BY LabourID ORDER BY EffectiveDate DESC) AS RowNum
        FROM [dbo].[LabourMonthlyWages]
      )
      SELECT 
        onboarding.LabourID,
        onboarding.name,
        onboarding.projectName,
        onboarding.companyName,
        onboarding.From_Date,
        onboarding.businessUnit,
        onboarding.departmentName,
        onboarding.accountNumber,
        wages.PayStructure,
        wages.DailyWages,
        wages.WeeklyOff,
        wages.FixedMonthlyWages,
        wages.EffectiveDate,
        wages.ApprovalStatusWages
      FROM [dbo].[labourOnboarding] AS onboarding
      LEFT JOIN RankedWages AS wages
        ON onboarding.LabourID = wages.LabourID
        AND wages.RowNum = 1
      WHERE onboarding.status IN ('Approved', 'Disable')
        AND (
          @projectName = 'all'
          OR EXISTS (
            SELECT 1
            FROM STRING_SPLIT(@projectName, ',') s
            WHERE s.value = CAST(onboarding.projectName AS VARCHAR(50))
          )
        )
        AND (
          @payStructure IS NULL OR wages.PayStructure = @payStructure
        )
        AND (
          @approvalStatus IS NULL OR
          (@approvalStatus = 'Approved' AND wages.ApprovalStatusWages = 'Approved') OR
          (@approvalStatus = 'NotApproved' AND ISNULL(wages.ApprovalStatusWages, '') <> 'Approved')
        )
    `;

  const request = pool.request();
  request.input("projectName", sql.VarChar, projectName || "all");
  request.input("payStructure", sql.VarChar, payStructure || null);
  request.input("approvalStatus", sql.VarChar, approvalStatus || null);

  const result = await request.query(query);
  return result.recordset;
}

module.exports = {
  getAllLabours,
  registerData,
  searchFromVariablePay,
  searchFromAttendanceApproval,
  searchFromWagesApproval,
  searchFromViewMonthlyPayrolls,
  searchFromSiteTransferApproval,
  checkExistingVariablePay,
  upsertLabourVariablePay,
  getVariablePayAndLabourOnboardingJoin,
  markVariablePayForApproval,
  approvalAdminVariablePay,
  rejectAdminVariablePay,
  getVariablePayAdminApproval,
  getVariablePayByDateRange,
  getVariablePayByExcel,
  insertVariablePayData,
  // -----------------------------------------------------------------------  salary generation process --------------------------------------
  getAttendanceSummaryForLabour,
  getVariablePayForLabour,
  getWageInfoForLabour,
  getEligibleLabours,
  calculateSalaryForLabour,
  generateMonthlyPayroll,
  calculateTotalOvertime,
  saveFinalizeSalaryData,
  deleteMonthlyPayrollData,
  getFinalizedSalaryData,
  getFinalizedSalaryDataByLabourID,
  getMonthlyPayrollData,
  getWagesByDateRange,
  getLabourMonthlyWages,
};