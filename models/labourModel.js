const { poolPromise2 } = require("../config/dbConfig2");
const { sql, poolPromise } = require("../config/dbConfig");
const { poolPromise3 } = require("../config/dbConfig3");
const READ_TIMEOUT_MS = 45_000;
const WRITE_TIMEOUT_MS = 45_000;
const RETRIES_READ = 1;
const RETRIES_WRITE = 1;
const DEADLOCK_RETRIES = 3;
const n = (v, def = 0) => (Number.isFinite(Number(v)) ? Number(v) : def);

async function checkAadhaarExists(aadhaarNumber) {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("aadhaarNumber", aadhaarNumber)
      .query(
        "SELECT LabourID, status, isApproved FROM [dbo].[labourOnboarding] WHERE aadhaarNumber = @aadhaarNumber"
      );
    return result.recordset.length > 0 ? result.recordset : null;
  } catch (error) {
    console.error("Error checking Aadhaar number:", error);
    throw new Error("Error checking Aadhaar number");
  }
}

async function getNextUniqueID(departmentId) {
  try {
    const pool = await poolPromise;

    const jihDepartments = [336, 337, 338, 339, 340, 341, 342];
    let prefix = "JC";
    let initialID = "JC4008";
    const exclusions = `'JCO519', 'VJ3893'`;

    if (jihDepartments.includes(departmentId)) {
      prefix = "JIH";
      initialID = "JIH0001";
    }

    const likeClause = prefix === "JIH" ? "%JIH%" : "%JC%";

    const lastIDQuery = `
            SELECT MAX(LabourID) AS lastID 
            FROM labourOnboarding 
            WHERE LabourID NOT IN (${exclusions}) 
            AND LabourID LIKE '${likeClause}'
        `;

    const result = await pool.request().query(lastIDQuery);
    const lastID = result.recordset[0].lastID;

    if (!lastID) {
      return initialID;
    }

    const numericPart = parseInt(lastID.slice(prefix.length)) + 1;
    const nextID = `${prefix}${numericPart.toString().padStart(4, "0")}`;

    return nextID;
  } catch (error) {
    throw new Error(`Error fetching next unique ID: ${error.message}`);
  }
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
      : ""; // Fallback to empty string if undefined
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

    console.log(
      "Inserting data into database for OnboardName:",
      labourData.OnboardName
    );
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
    console.log(
      "Data successfully inserted for OnboardName:",
      labourData.OnboardName
    );
    return result.recordset;
  } catch (error) {
    throw error;
  }
}

async function updateData(labourData) {
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
      "Employee_Type",
    ];
    const setInputWithUpperCase = (key, value) => {
      const valueAsString = value ? String(value) : "";
      request.input(
        key,
        sql.VarChar,
        valueAsString ? valueAsString.toUpperCase() : ""
      );
    };

    if (!labourData.LabourID) {
      console.error("LabourID is not provided or is null/undefined.");
      return null;
    }
    request.input("LabourID", sql.NVarChar, labourData.LabourID);

    let finalOnboardName = Array.isArray(labourData.OnboardName)
      ? labourData.OnboardName.filter(
          (name) => name && name.trim() !== ""
        ).pop()
      : labourData.OnboardName;

    if (!finalOnboardName || finalOnboardName.trim() === "") {
      throw new Error("OnboardName is missing or invalid.");
    }

    labourData.OnboardName = finalOnboardName.toUpperCase();

    Object.keys(labourData).forEach((key) => {
      if (key !== "LabourID") {
        if (toUpperCaseFields.includes(key)) {
          setInputWithUpperCase(key, labourData[key]);
        } else {
          let sqlType = sql.NVarChar;
          if (["aadhaarNumber", "pincode", "contactNumber"].includes(key)) {
            sqlType = sql.NVarChar;
          } else if (
            [
              "dateOfBirth",
              "dateOfJoining",
              "Induction_Date",
              "ValidTill",
              "ConfirmDate",
              "retirementDate",
              "CreationDate",
            ].includes(key)
          ) {
            sqlType = sql.DateTime;
          } else if (
            ["departmentId", "designationId", "labourCategoryId"].includes(key)
          ) {
            sqlType = sql.Int;
          } else if (key === "isApproved") {
            sqlType = sql.Int;
          }

          const value = labourData[key] === "null" ? null : labourData[key];
          request.input(key, sqlType, value);
        }
      }
    });

    request.input("status", sql.NVarChar, "Pending");
    request.input("isApproved", sql.Int, 0);

    const updateResult = await request.query(`
            UPDATE labourOnboarding SET
                labourOwnership = @labourOwnership,
                uploadAadhaarFront = @uploadAadhaarFront,
                uploadAadhaarBack = @uploadAadhaarBack,
                uploadIdProof = @uploadIdProof,
                uploadInductionDoc = @uploadInductionDoc,
                name = @name,
                aadhaarNumber = @aadhaarNumber,
                dateOfBirth = @dateOfBirth,
                contactNumber = @contactNumber,
                gender = @gender,
                dateOfJoining = @dateOfJoining,
                Group_Join_Date = @Group_Join_Date,
                From_Date = @From_Date,
                Period = @Period,
                address = @address,
                pincode = @pincode,
                taluka = @taluka,
                district = @district,
                village = @village,
                state = @state,
                emergencyContact = @emergencyContact,
                photoSrc = @photoSrc,
                bankName = @bankName,
                branch = @branch,
                accountNumber = @accountNumber,
                ifscCode = @ifscCode,
                projectName = @projectName,
                labourCategory = @labourCategory,
                department = @department,
                workingHours = @workingHours,
                contractorName = @contractorName,
                contractorNumber = @contractorNumber,
                designation = @designation,
                title = @title,
                Marital_Status = @Marital_Status,
                companyName = @companyName,
                Induction_Date = @Induction_Date,
                Inducted_By = @Inducted_By,
                OnboardName = @OnboardName,
                ValidTill = @ValidTill,
                location = @location,
                ConfirmDate = @ConfirmDate,
                retirementDate = @retirementDate,
                SalaryBu = @SalaryBu,
                WorkingBu = @WorkingBu,
                CreationDate = @CreationDate,
                businessUnit = @businessUnit,
                departmentId = @departmentId,
                designationId = @designationId,
                labourCategoryId = @labourCategoryId,
                departmentName = @departmentName,
                status = @status,
                isApproved = @isApproved
            WHERE LabourID = @LabourID
        `);

    if (updateResult.rowsAffected[0] === 0) {
      console.warn("No rows were updated, check LabourID or other conditions.");
      return null;
    }

    const fetchResult = await request.query(`
            SELECT * FROM labourOnboarding WHERE LabourID = @LabourID
        `);
    return fetchResult.recordset[0]; // Return the first row of the updated data
  } catch (error) {
    console.error("Error updating data:", error);
    throw error;
  }
}

async function updateDataDisableStatus(labourData) {
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
      : ""; // Fallback to empty string if undefined
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

async function registerDataUpdate(labourData) {
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

    let finalOnboardName = Array.isArray(labourData.OnboardName)
      ? labourData.OnboardName.filter(
          (name) => name && name.trim() !== ""
        ).pop()
      : labourData.OnboardName;

    if (!finalOnboardName || finalOnboardName.trim() === "") {
      throw new Error("OnboardName is missing or invalid.");
    }

    labourData.OnboardName = finalOnboardName.toUpperCase();

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

async function registerDataUpdateDisable(labourData) {
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

    const bitFields = [
      "isResubmit",
      "hideResubmit",
      "isCompanyTransfer",
      "isSiteTransfer",
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

    let finalOnboardName = Array.isArray(labourData.OnboardName)
      ? labourData.OnboardName.filter(
          (name) => name && name.trim() !== ""
        ).pop()
      : labourData.OnboardName;

    if (!finalOnboardName || finalOnboardName.trim() === "") {
      throw new Error("OnboardName is missing or invalid.");
    }

    labourData.OnboardName = finalOnboardName.toUpperCase();

    Object.keys(labourData).forEach((key) => {
      if (key === "LabourID" || key === "location") return;

      if (toUpperCaseFields.includes(key)) {
        setInputWithUpperCase(key, labourData[key]);
      } else if (bitFields.includes(key)) {
        // ✅ Set BIT fields explicitly
        let val = labourData[key];
        const boolValue =
          val === true || val === "true" || val === "1"
            ? true
            : val === false || val === "false" || val === "0"
            ? false
            : null;

        request.input(key, sql.Bit, boolValue);
      } else {
        request.input(key, sql.VarChar, labourData[key]);
      }
    });

    const result = await request.query(`
        INSERT INTO labourOnboarding (
          LabourID, labourOwnership, uploadAadhaarFront, uploadAadhaarBack, uploadIdProof, name, aadhaarNumber,
          dateOfBirth, contactNumber, gender, dateOfJoining, Group_Join_Date, From_Date, Period, address, pincode, taluka, district, village,
          state, emergencyContact, photoSrc, bankName, branch, accountNumber, ifscCode, projectName, 
          labourCategory, department, workingHours, contractorName, contractorNumber, designation,
          status, isApproved, title, Marital_Status, companyName, Induction_Date, Inducted_By, uploadInductionDoc, OnboardName, ValidTill, location, ConfirmDate, retirementDate, SalaryBu, WorkingBu, CreationDate, businessUnit, departmentId, designationId, labourCategoryId, departmentName, Reject_Reason) 
          VALUES (
          @LabourID, @labourOwnership, @uploadAadhaarFront, @uploadAadhaarBack, @uploadIdProof, @name, @aadhaarNumber,
          @dateOfBirth, @contactNumber, @gender, @dateOfJoining, @Group_Join_Date, @From_Date, @Period, @address, @pincode, @taluka, @district, @village,
          @state, @emergencyContact, @photoSrc, @bankName, @branch, @accountNumber, @ifscCode, @projectName,
          @labourCategory, @department, @workingHours, @contractorName, @contractorNumber, @designation,
          'Pending', 0, @title, @Marital_Status, @companyName, @Induction_Date, @Inducted_By, @uploadInductionDoc, @OnboardName,  @ValidTill, @location, @ConfirmDate, @retirementDate, @SalaryBu, @WorkingBu, @CreationDate, @businessUnit, @departmentId, @designationId, @labourCategoryId, @departmentName, @Reject_Reason)
        `);
    return result.recordset;
  } catch (error) {
    throw error;
  }
}

async function getAll() {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .query(`SELECT * FROM [labourOnboarding] ORDER BY LabourID DESC`);
    return result.recordset;
  } catch (error) {
    throw error;
  }
}

async function getAllLaboursOnboarding() {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`SELECT [id],
       [projectName],
       [department],
       [name],
       [workingHours],
       [status],
       [IsApproved],
       [LabourID],
       [companyName],
       [WorkingBu],
       [businessUnit],
       [departmentId],
       [designationId],
       [departmentName]
FROM [labourOnboarding]
WHERE status IN ('Approved', 'Disable')
 AND LabourID != 'VJ3893'
ORDER BY LabourID ASC;
`);
    return result.recordset;
  } catch (error) {
    throw error;
  }
}

async function getById(id) {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .query("SELECT * FROM labourOnboarding WHERE id = @id");
    return result.recordset[0];
  } catch (error) {
    throw error;
  }
}

async function updateLabour(id, updatedData) {
  try {
    const pool = await poolPromise;
    const request = pool.request().input("id", sql.Int, id);
    let updateQuery = "UPDATE labourOnboarding SET ";

    Object.keys(updatedData).forEach((key, index) => {
      if (key !== "id" && key !== "LabourID") {
        updateQuery += `${key} = @param${index}, `;
        request.input(`param${index}`, updatedData[key]);
      }
    });

    updateQuery = updateQuery.slice(0, -2) + " WHERE id = @id";

    const result = await request.query(updateQuery);
    return result.rowsAffected[0];
  } catch (error) {
    throw error;
  }
}

async function deleteById(id) {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .query("DELETE FROM labourOnboarding WHERE id = @id");
    return result.rowsAffected[0];
  } catch (error) {
    throw error;
  }
}

async function getImagePathsById(id) {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .query(
        "SELECT uploadAadhaarFront, uploadAadhaarBack, photoSrc, uploadIdProof, uploadInductionDoc FROM labourOnboarding WHERE id = @id"
      );
    return result.recordset[0];
  } catch (error) {
    throw error;
  }
}

async function search(query) {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("query", sql.NVarChar, `%${query}%`)
      .query(
        "SELECT * FROM labourOnboarding WHERE name LIKE @query OR aadhaarNumber LIKE @query OR LabourID LIKE @query OR OnboardName LIKE @query OR workingHours LIKE @query OR businessUnit LIKE @query OR designation LIKE @query OR location LIKE @query OR departmentName LIKE @query"
      );
    return result.recordset;
  } catch (error) {
    throw error;
  }
}

async function searchForAttendance(query) {
  const pool = await poolPromise;
  const likeQuery = `%${query}%`;

  let { recordset } = await pool
    .request()
    .input("query", sql.NVarChar, likeQuery).query(`
            SELECT *
            FROM   labourOnboarding
            WHERE  status = 'Approved'
              AND ( name           LIKE @query
                 OR aadhaarNumber  LIKE @query
                 OR LabourID       LIKE @query
                 OR OnboardName    LIKE @query
                 OR workingHours   LIKE @query
                 OR businessUnit   LIKE @query
                 OR designation    LIKE @query
                 OR location       LIKE @query
                 OR departmentName LIKE @query )
        `);

  if (recordset.length > 0) {
    console.log(
      `[AttendanceSearch] Status cohort: Approved | rows: ${recordset.length}`
    );
    return recordset; // exit early on success
  }

  ({ recordset } = await pool.request().input("query", sql.NVarChar, likeQuery)
    .query(`
            SELECT *
            FROM   labourOnboarding
            WHERE  status = 'Disable'
              AND ( name           LIKE @query
                 OR aadhaarNumber  LIKE @query
                 OR LabourID       LIKE @query
                 OR OnboardName    LIKE @query
                 OR workingHours   LIKE @query
                 OR businessUnit   LIKE @query
                 OR designation    LIKE @query
                 OR location       LIKE @query
                 OR departmentName LIKE @query )
        `));
  console.log(
    `[AttendanceSearch] Status cohort: Disable | rows: ${recordset.length}`
  );
  return recordset; // may be [] if nothing disables either
}

async function getAllLabours() {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .query(`SELECT * FROM [labourOnboarding] order by LabourID`);
    return result.recordset;
  } catch (error) {
    console.error("Error in getAllLabours:", error);
    throw error;
  }
}

async function approveLabour(id, nextID) {
  try {
    const pool = await poolPromise;
    const now = new Date();
    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .input("LabourID", sql.VarChar, nextID)
      .input("ApproveLabourDate", sql.DateTime, now)
      .query(
        "UPDATE labourOnboarding SET status = 'Approved', isApproved = 1, LabourID = @LabourID, ApproveLabourDate = @ApproveLabourDate WHERE id = @id AND (status = 'Pending' OR status = 'Rejected')"
      );

    if (result.rowsAffected[0] > 0) {
      const approvedResult = await pool
        .request()
        .input("id", sql.Int, id)
        .query(
          "SELECT * FROM labourOnboarding WHERE id = @id AND status = 'Approved'"
        );

      return approvedResult.recordset[0];
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error in approveLabour:", error);
    throw error;
  }
}

async function approveDisableLabours(id, labourID) {
  try {
    const pool = await poolPromise;
    const now = new Date();
    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .input("LabourID", sql.NVarChar, labourID)
      .input("ApproveLabourDate", sql.DateTime, now)
      .query(
        "UPDATE labourOnboarding SET status = 'Approved', isApproved = 1, LabourID = @LabourID, ApproveLabourDate = @ApproveLabourDate WHERE id = @id AND (status = 'Pending' OR status = 'Rejected')"
      );

    if (result.rowsAffected[0] > 0) {
      const approvedResult = await pool
        .request()
        .input("id", sql.Int, id)
        .query(
          "SELECT * FROM labourOnboarding WHERE id = @id AND status = 'Approved'"
        );

      return approvedResult.recordset[0];
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error in approveLabour:", error);
    throw error;
  }
}

async function rejectLabour(id, rejectReason) {
  try {
    const pool = await poolPromise;
    const now = new Date();
    const labour = await pool
      .request()
      .input("id", sql.Int, id)
      .query("SELECT * FROM labourOnboarding WHERE id = @id");

    if (labour.recordset.length === 0) {
      return false; // labour not found
    }

    const labourData = labour.recordset[0];

    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .input("Reject_Reason", sql.VarChar, rejectReason)
      .input("RejectLabourDate", sql.DateTime, now)
      .query(
        "UPDATE labourOnboarding SET status = 'Rejected', isApproved = 2, Reject_Reason = @Reject_Reason, RejectLabourDate = @RejectLabourDate WHERE id = @id AND (status = 'Pending' OR status = 'Approved')"
      );

    await pool
      .request()
      .input("userId", sql.Int, labourData.id)
      .input("name", sql.VarChar, labourData.name)
      .input("status", sql.VarChar, "Rejected")
      .input("Reject_Reason", sql.VarChar, rejectReason)
      .input("OnboardName", sql.VarChar, labourData.OnboardName)
      .input("aadhaarNumber", sql.VarChar, labourData.aadhaarNumber)
      .input("isApproved", sql.Int, 2) // isApproved is 2 for rejected
      .query(
        "INSERT INTO RejectLabours (userId, name, status, Reject_Reason, OnboardName, aadhaarNumber, isApproved) VALUES (@userId, @name, @status, @Reject_Reason, @OnboardName, @aadhaarNumber, @isApproved)"
      );

    return result.rowsAffected[0] > 0;
  } catch (error) {
    console.error("Error in rejectLabour:", error);
    throw error;
  }
}

async function getApprovedLabours() {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .query("SELECT * FROM labourOnboarding WHERE isApproved = 1");
    return result.recordset;
  } catch (error) {
    throw error;
  }
}

async function resubmit(id) {
  try {
    const pool = await poolPromise;
    const now = new Date();
    const labour = await pool
      .request()
      .input("id", sql.Int, id)
      .query("SELECT * FROM labourOnboarding WHERE id = @id");

    if (labour.recordset.length === 0) {
      return 0; // labour not found
    }

    const labourData = labour.recordset[0];
    let rejectReason =
      labourData.Reject_Reason ||
      "This labour attendance is older than 15 days or not present";

    if (labourData.status !== "Disable") {
      await pool
        .request()
        .input("id", sql.Int, id)
        .input("status", sql.VarChar, "Resubmitted")
        .input("isApproved", sql.Int, 3)
        .input("ResubmitLabourDate", sql.DateTime, now)
        .query(
          "UPDATE labourOnboarding SET status = @status, isApproved = @isApproved, ResubmitLabourDate = @ResubmitLabourDate WHERE id = @id"
        );
    } else {
      await pool
        .request()
        .input("id", sql.Int, id)
        .input("isResubmit", sql.Bit, 1)
        .query(
          "UPDATE labourOnboarding SET isResubmit = @isResubmit WHERE id = @id"
        );
    }

    await pool
      .request()
      .input("userId", sql.Int, labourData.id)
      .input("name", sql.VarChar, labourData.name)
      // .input('status', sql.VarChar, labourData.status === 'Disable' ? 'Disable' : 'Resubmitted')
      .input("status", sql.VarChar, "Resubmitted")
      .input("Reject_Reason", sql.VarChar, rejectReason) // might be empty on resubmission
      .input("OnboardName", sql.VarChar, labourData.OnboardName)
      .input("aadhaarNumber", sql.VarChar, labourData.aadhaarNumber)
      // .input('isApproved', sql.Int, labourData.status === 'Disable' ? labourData.isApproved : 3) // isApproved is 3 for resubmitted
      .input("isApproved", sql.Int, 3)

      .query(
        "INSERT INTO RejectLabours (userId, name, status, Reject_Reason, OnboardName, aadhaarNumber, isApproved) VALUES (@userId, @name, @status, @Reject_Reason, @OnboardName, @aadhaarNumber, @isApproved)"
      );

    return labour.recordset[0];
  } catch (error) {
    console.error("Error in resubmitLabour:", error);
    throw error;
  }
}

async function editLabour(id) {
  try {
    const pool = await poolPromise;
    const now = new Date();
    const labour = await pool
      .request()
      .input("id", sql.Int, id)
      .query("SELECT * FROM labourOnboarding WHERE id = @id");

    if (labour.recordset.length === 0) {
      return 0; // labour not found
    }

    const labourData = labour.recordset[0];

    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .input("status", sql.VarChar, "Approved")
      .input("isApproved", sql.Int, 1)
      .input("EditLabourDate", sql.DateTime, now)
      .query(
        "UPDATE labourOnboarding SET status = @status, isApproved = @isApproved, EditLabourDate = @EditLabourDate WHERE id = @id"
      );

    await pool
      .request()
      .input("userId", sql.Int, labourData.id)
      .input("name", sql.VarChar, labourData.name)
      .input("status", sql.VarChar, "Approved")
      .input("Reject_Reason", sql.VarChar, labourData.Reject_Reason)
      .input("OnboardName", sql.VarChar, labourData.OnboardName)
      .input("aadhaarNumber", sql.VarChar, labourData.aadhaarNumber)
      .input("isApproved", sql.Int, 1)
      .query(
        "INSERT INTO RejectLabours (userId, name, status, Reject_Reason, OnboardName, aadhaarNumber, isApproved) VALUES (@userId, @name, @status, @Reject_Reason, @OnboardName, @aadhaarNumber, @isApproved)"
      );

    return result.rowsAffected[0];
  } catch (error) {
    console.error("Error in resubmitLabour:", error);
    throw error;
  }
}

async function getLabourByAadhaar(aadhaarNumber) {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("aadhaarNumber", aadhaarNumber)
      .query(
        "SELECT * FROM labourOnboarding WHERE aadhaarNumber = @aadhaarNumber"
      );
    return result.recordset[0];
  } catch (error) {
    console.error("Error fetching labour by Aadhaar:", error);
    throw error;
  }
}

async function getFormDataByAadhaar(aadhaarNumber) {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("aadhaarNumber", aadhaarNumber)
      .query(
        "SELECT * FROM labourOnboarding WHERE aadhaarNumber = @aadhaarNumber"
      );
    return result.recordset[0];
  } catch (error) {
    console.error("Error fetching form data by Aadhaar:", error);
    throw error;
  }
}

async function getLabourStatuses(labourIds) {
  try {
    const labourIdsString = labourIds.map((id) => `'${id}'`).join(",");

    const pool = await poolPromise;
    const result = await pool.request().query(`
            SELECT 
                COALESCE(e.userId, r.userId) AS userId,
                CAST(COALESCE(e.LabourID, r.LabourID) AS VARCHAR(50)) AS LabourID,
                COALESCE(e.name, r.name) AS name,
                ISNULL(e.esslStatus, '-') AS esslStatus,
                CASE 
                    WHEN r.employeeMasterStatus = 'true' OR r.employeeMasterStatus = 1 THEN 'true'
                    ELSE '-'
                END AS employeeMasterStatus,
                logs.CreatedAt AS disabledAttendanceCreatedAt
            FROM [dbo].[API_EsslPayloads] e
            FULL OUTER JOIN [dbo].[API_ResponsePayloads] r
                ON CAST(e.LabourID AS VARCHAR(50)) = CAST(r.LabourID AS VARCHAR(50))
            LEFT JOIN (
                SELECT LabourID, MIN(CreatedAt) AS CreatedAt
                FROM [dbo].[LabourAttendanceLogs]
                WHERE attendanceStatus = 'Disable'
                GROUP BY LabourID
            ) logs
                ON logs.LabourID = COALESCE(e.LabourID, r.LabourID)
            WHERE (e.LabourID IS NOT NULL OR r.LabourID IS NOT NULL)
            AND COALESCE(e.LabourID, r.LabourID) IN (${labourIdsString});
        `);

    return result.recordset;
  } catch (error) {
    console.error("Error in getLabourStatuses:", error.message, error.stack);
    throw new Error("Error fetching labour statuses");
  }
}

async function updateHideResubmit(labourId, hideResubmitValue) {
  try {
    const pool = await poolPromise;
    const request = pool
      .request()
      .input("id", sql.Int, labourId)
      .input("hideResubmit", sql.Bit, hideResubmitValue); // Use Bit for boolean values

    const result = await request.query(
      "UPDATE labourOnboarding SET hideResubmit = @hideResubmit WHERE id = @id"
    );
    return result.rowsAffected[0]; // Return number of affected rows
  } catch (error) {
    throw error;
  }
}

async function getAllApprovedLabours() {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .query(
        `SELECT LabourID AS labourId, workingHours, projectName FROM [labourOnboarding] WHERE status IN ('Approved', 'Disable')`
      );
    //console.log('Fetched approved labours:', result.recordset);
    return result.recordset; // Returns an array of approved labour IDs and working hours
  } catch (err) {
    console.error("SQL error fetching approved labour IDs", err);
    throw new Error("Error fetching approved labour IDs");
  }
}

async function getAllApprovedOrMonthlyDisabledLabours() {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
                    SELECT DISTINCT lo.LabourID AS labourId, lo.workingHours, lo.projectName, lo.status
                    FROM [labourOnboarding] lo
                    WHERE lo.status IN ('Approved', 'Disable')

                    UNION

                    SELECT DISTINCT lo.LabourID AS labourId, lo.workingHours, lo.projectName, lo.status
                    FROM [labourOnboarding] lo
                    JOIN [LabourOnboardingForm].[dbo].[LabourAttendanceLogs] lal
                        ON lal.LabourID = lo.LabourID
                    WHERE lal.attendanceStatus = 'Disable'
            `);

    return result.recordset;
  } catch (err) {
    console.error("SQL error fetching labours", err);
    throw new Error("Error fetching approved or monthly disabled labours");
  }
}

async function getAttendanceByLabourId(labourId, month, year) {
  try {
    //console.log('Fetching attendance from DB for:', { labourId, month, year });
    const pool = await poolPromise3;
    const result = await pool
      .request()
      .input("labourId", sql.NVarChar, labourId)
      .input("month", sql.Int, month)
      .input("year", sql.Int, year).query(`
                SELECT * FROM [etimetracklite11.8].[dbo].[Attendance]
                WHERE user_id = @labourId
                AND MONTH(punch_date) = @month
                AND YEAR(punch_date) = @year
                ORDER BY punch_date, punch_time
            `);
    // //console.log('SQL Result:', result.recordset);
    return result.recordset;
  } catch (err) {
    console.error("SQL error", err);
    throw new Error("Error fetching attendance data");
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

async function saveEsslAttendance(date, cronLogger) {
  const INSERT_CONCURRENCY = 10; // tune as needed
  const READ_TIMEOUT_MS = 120000; // 2 min for the big read
  const WRITE_TIMEOUT_MS = 30000; // 30s per write

  const job = "saveEsslAttendance";
  const runId = `essl-${date}-${Math.random().toString(36).slice(2, 8)}`;
  const t0 = process.hrtime.bigint();

  // START (flat fields)
  cronLogger.info({
    event: `${job}_start`,
    job,
    runId,
    date,
    cfg_insert_concurrency: INSERT_CONCURRENCY,
    cfg_read_timeout_ms: READ_TIMEOUT_MS,
    cfg_write_timeout_ms: WRITE_TIMEOUT_MS,
  });

  const endAndLog = (level, status, extra = {}) => {
    const t1 = process.hrtime.bigint();
    const elapsedMs = Number(t1 - t0) / 1e6;
    const payload = {
      event: `${job}_end_${status}`, // success | early | error
      job,
      runId,
      date,
      duration_ms: Math.round(elapsedMs),
      duration_hms: formatDuration(elapsedMs),
      ...extra,
    };
    cronLogger[level](payload);
  };

  const mapWithConcurrency = async (items, limit, worker) => {
    const results = [];
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
            .catch((err) => {
              results[idx] = { ok: false, error: err };
            })
            .finally(() => {
              active--;
              launch();
            });
        }
      };
      launch();
    });
  };

  try {
    const pool = await poolPromise3;

    const readReq = pool.request();
    readReq.timeout = READ_TIMEOUT_MS;
    const result = await readReq.input("date", sql.Date, date).query(`
        SELECT * FROM [etimetracklite11.8].[dbo].[Attendance]
        WHERE (user_id LIKE 'JC%' OR user_id LIKE 'JIH%')
          AND punch_date BETWEEN DATEADD(DAY, -10, @date) AND @date
        ORDER BY user_id ASC, punch_date ASC, punch_time ASC;
      `);

    const rows = result.recordset ?? [];
    cronLogger.info({
      event: `${job}_fetched_rows`,
      job,
      runId,
      date,
      fetched: rows.length,
    });

    if (rows.length === 0) {
      endAndLog("info", "early", {
        fetched: 0,
        prepared: 0,
        inserted: 0,
        skipped: 0,
        failed: 0,
        note: "no_rows_fetched",
      });
      return { fetched: 0, prepared: 0, inserted: 0, skipped: 0, failed: 0 };
    }

    // Your existing grouping helper
    const esslData =
      getFirstAndLastPunches(rows, { alwaysTwo: false, minGapSeconds: 300 }) ||
      [];
    cronLogger.info({
      event: `${job}_prepared_group`,
      job,
      runId,
      date,
      prepared: esslData.length,
    });

    if (esslData.length === 0) {
      endAndLog("info", "early", {
        fetched: rows.length,
        prepared: 0,
        inserted: 0,
        skipped: 0,
        failed: 0,
        note: "nothing_to_insert_after_grouping",
      });
      return {
        fetched: rows.length,
        prepared: 0,
        inserted: 0,
        skipped: 0,
        failed: 0,
      };
    }

    const pool1 = await poolPromise;

    const worker = async (record) => {
      try {
        // existence check
        const checkReq = pool1.request();
        checkReq.timeout = WRITE_TIMEOUT_MS;
        const check = await checkReq
          .input("attendance_id", sql.Int, record.attendance_id)
          .query(
            "SELECT COUNT(*) AS count FROM [EsslAttendance] WHERE attendance_id = @attendance_id"
          );

        if (check.recordset?.[0]?.count > 0) {
          return {
            ok: true,
            inserted: false,
            skipped: true,
            id: record.attendance_id,
          };
        }

        // insert
        const insReq = pool1.request();
        insReq.timeout = WRITE_TIMEOUT_MS;
        const res = await insReq
          .input("attendance_id", sql.Int, record.attendance_id)
          .input("user_id", sql.NVarChar, record.user_id)
          .input("punch_date", sql.Date, record.punch_date)
          .input("Device_id", sql.NVarChar, record.Device_id)
          .input("punch_time", sql.Time, record.punch_time).query(`
            INSERT INTO [EsslAttendance] (attendance_id, user_id, punch_date, Device_id, punch_time)
            VALUES (@attendance_id, @user_id, @punch_date, @Device_id, @punch_time)
          `);

        const ok = res.rowsAffected?.[0] === 1;
        return { ok, inserted: ok, skipped: !ok, id: record.attendance_id };
      } catch (e) {
        return { ok: false, error: e, id: record.attendance_id };
      }
    };

    const results = await mapWithConcurrency(
      esslData,
      INSERT_CONCURRENCY,
      worker
    );

    let inserted = 0,
      skipped = 0,
      failed = 0;
    for (const r of results) {
      if (!r) continue;
      if (r.ok && r.inserted) inserted++;
      else if (r.ok && r.skipped) skipped++;
      else failed++;
    }

    cronLogger.info({
      event: `${job}_insert_summary`,
      job,
      runId,
      date,
      fetched: rows.length,
      prepared: esslData.length,
      inserted,
      skipped,
      failed,
    });

    if (failed > 0) {
      endAndLog("info", "success", {
        fetched: rows.length,
        prepared: esslData.length,
        inserted,
        skipped,
        failed,
        partial: true,
      });
      return {
        fetched: rows.length,
        prepared: esslData.length,
        inserted,
        skipped,
        failed,
        partial: true,
      };
    }

    endAndLog("info", "success", {
      fetched: rows.length,
      prepared: esslData.length,
      inserted,
      skipped,
      failed: 0,
    });
    return {
      fetched: rows.length,
      prepared: esslData.length,
      inserted,
      skipped,
      failed: 0,
    };
  } catch (err) {
    endAndLog("error", "error", {
      error_message: err?.message,
      error_stack: err?.stack,
    });
    throw new Error("Error fetching or inserting Essl attendance", {
      cause: err,
    });
  }
}

function getFirstAndLastPunches(
  rows,
  { alwaysTwo = true, minGapSeconds = 0 } = {}
) {
  const dateKey = (d) =>
    d instanceof Date ? d.toISOString().slice(0, 10) : String(d);
  const toSeconds = (t) => {
    if (t == null) return Number.POSITIVE_INFINITY;
    if (t instanceof Date)
      return (
        t.getUTCHours() * 3600 + t.getUTCMinutes() * 60 + t.getUTCSeconds()
      );
    const [h = 0, m = 0, s = 0] = String(t).split(":").map(Number);
    return h * 3600 + m * 60 + s;
  };
  const cmpAsc = (a, b) => {
    const at = toSeconds(a.punch_time),
      bt = toSeconds(b.punch_time);
    if (at !== bt) return at - bt;
    return Number(a.attendance_id) - Number(b.attendance_id);
  };
  const cmpDesc = (a, b) => -cmpAsc(a, b);

  const groups = new Map(); // key: user_id||YYYY-MM-DD -> { first, last }
  for (const r of rows) {
    if (!r || !r.user_id || !r.punch_date || r.punch_time == null) continue;
    const key = `${r.user_id}||${dateKey(r.punch_date)}`;
    const g = groups.get(key);
    if (!g) groups.set(key, { first: r, last: r });
    else {
      if (cmpAsc(r, g.first) < 0) g.first = r;
      if (cmpDesc(r, g.last) < 0) g.last = r;
    }
  }

  const out = [];
  for (const { first, last } of groups.values()) {
    const gap = Math.abs(
      toSeconds(last.punch_time) - toSeconds(first.punch_time)
    );
    // If the gap is smaller than the threshold, treat as a single punch: keep FIRST, drop LAST.
    if (gap < minGapSeconds) {
      out.push({ ...first, punch_kind: "FIRST" });
      continue;
    }
    // Normal behavior
    out.push({ ...first, punch_kind: "FIRST" });
    if (!alwaysTwo) {
      if (last.attendance_id !== first.attendance_id)
        out.push({ ...last, punch_kind: "LAST" });
    } else {
      out.push({ ...last, punch_kind: "LAST" });
    }
  }

  out.sort(
    (a, b) =>
      String(a.user_id).localeCompare(String(b.user_id)) ||
      new Date(a.punch_date) - new Date(b.punch_date) ||
      (a.punch_kind === b.punch_kind ? 0 : a.punch_kind === "FIRST" ? -1 : 1)
  );
  return out;
}

async function getESSLAttendance(labourId, date) {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("labourId", sql.NVarChar, labourId)
      .input("punchDate", sql.Date, date).query(`
             SELECT * FROM [EsslAttendance]
             WHERE user_id = @labourId
             AND punch_date = @punchDate
             ORDER BY punch_time
      `);
    return result.recordset;
  } catch (err) {
    console.error("❌ SQL error in getAttendanceByLabourIdAndDate:", err);
    throw new Error("Error fetching attendance for specific date");
  }
}

async function getAttendanceByLabourIdAndDate(labourId, date) {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("labourId", sql.NVarChar, labourId)
      .input("punchDate", sql.Date, date).query(`
             SELECT * FROM [EsslAttendance]
             WHERE user_id = @labourId
             AND punch_date = @punchDate
             ORDER BY punch_time
      `);
    return result.recordset;
  } catch (err) {
    console.error("❌ SQL error in getAttendanceByLabourIdAndDate:", err);
    throw new Error("Error fetching attendance for specific date");
  }
}

async function getLabourDetailsById(labourId) {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("labourId", sql.NVarChar, labourId)
      .query(
        `SELECT LabourID AS labourId, workingHours FROM [labourOnboarding] WHERE LabourID = @labourId`
      );

    return result.recordset[0];
  } catch (err) {
    console.error("SQL error fetching labour details", err);
    throw new Error("Error fetching labour details");
  }
}

async function isHoliday(date) {
  try {
    const pool = await poolPromise;
    const result = await pool.request().input("date", sql.Date, date).query(`
                SELECT * 
                FROM [dbo].[HolidayDate] 
                WHERE HolidayDate = @date
            `);
    return result.recordset.length > 0;
  } catch (err) {
    console.error("Error checking if date is a holiday", err);
    throw new Error("Error checking if date is a holiday");
  }
}

async function getProjectIdByDeviceId(deviceId) {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("deviceId", sql.NVarChar, deviceId).query(`
                SELECT TOP 1 ProjectID 
                FROM [dbo].[ProjectDeviceStatus] 
                WHERE DeviceID = @deviceId
            `);
    return result.recordset[0]?.ProjectID || null;
  } catch (err) {
    console.error("SQL error fetching ProjectID by DeviceID", err);
    throw new Error("Error fetching ProjectID by DeviceID");
  }
}

async function addWeeklyOff(LabourID, offDate, addedBy) {
  try {
    const pool = await poolPromise;
    await pool
      .request()
      .input("LabourID", sql.NVarChar, LabourID)
      .input("offDate", sql.Date, offDate)
      .input("addedBy", sql.NVarChar, addedBy).query(`
                INSERT INTO [dbo].[WeeklyOffs] (LabourID, offDate, addedBy)
                VALUES (@LabourID, @offDate, @addedBy)
            `);
    return true;
  } catch (err) {
    console.error("Error adding weekly off:", err);
    return false;
  }
}

async function saveWeeklyOffs(LabourID, weeklyOffDates) {
  try {
    const pool = await poolPromise;

    await pool.request().input("LabourID", sql.NVarChar, LabourID).query(`
                DELETE FROM [dbo].[WeeklyOffs]
                WHERE LabourID = @LabourID 
                  AND MONTH(offDate) = MONTH(GETDATE())
                  AND YEAR(offDate) = YEAR(GETDATE())
            `);

    // Insert new weekly off dates
    for (const date of weeklyOffDates) {
      await pool
        .request()
        .input("LabourID", sql.NVarChar, LabourID)
        .input("offDate", sql.Date, date).query(`
                    INSERT INTO [dbo].[WeeklyOffs] (LabourID, offDate)
                    VALUES (@LabourID, @offDate)
                `);
    }

    return true;
  } catch (err) {
    console.error("Error saving weekly offs:", err);
    return false;
  }
}

async function getAttendanceByLabourIdForDate(labourId, date) {
  try {
    //console.log('Fetching attendance from DB for:', { labourId, date });
    const pool = await poolPromise3;
    const result = await pool
      .request()
      .input("labourId", sql.NVarChar, labourId)
      .input("date", sql.Date, date).query(`
                SELECT * FROM [dbo].[Attendance]
                WHERE user_id = @labourId
                AND CAST(punch_date AS DATE) = @date
                ORDER BY punch_time
            `);
    return result.recordset;
  } catch (err) {
    console.error("SQL error", err);
    throw new Error("Error fetching attendance data");
  }
}

async function getMissPunchCount(labourId, punchDate) {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("labourId", sql.NVarChar, labourId)
      .input("punchDate", sql.Date, punchDate).query(`
                SELECT COUNT(*) AS missPunchCount
                FROM [dbo].[Attendance]
                WHERE user_id = @labourId AND punch_date = @punchDate AND isMissPunch = 1
            `);
    return result.recordset[0];
  } catch (err) {
    console.error("SQL error fetching miss punch count", err);
    throw new Error("Error fetching miss punch count");
  }
}

async function addMissPunch(labourId, punchType, punchDate, punchTime) {
  try {
    const pool = await poolPromise;
    await pool
      .request()
      .input("labourId", sql.NVarChar, labourId)
      .input("punchType", sql.NVarChar, punchType)
      .input("punchDate", sql.Date, punchDate)
      .input("punchTime", sql.Time, punchTime).query(`
                INSERT INTO [dbo].[Attendance] (user_id, punch_type, punch_date, punch_time, isMissPunch)
                VALUES (@labourId, @punchType, @punchDate, @punchTime, 1)
            `);
    return true;
  } catch (err) {
    console.error("SQL error adding miss punch", err);
    return false;
  }
}

async function addApprovalRequest(labourId, punchType, punchDate, punchTime) {
  try {
    const pool = await poolPromise;
    await pool
      .request()
      .input("labourId", sql.NVarChar, labourId)
      .input("punchType", sql.NVarChar, punchType)
      .input("punchDate", sql.Date, punchDate)
      .input("punchTime", sql.Time, punchTime).query(`
                INSERT INTO [dbo].[AdminApprovals] (labour_id, punch_type, punch_date, punch_time, status)
                VALUES (@labourId, @punchType, @punchDate, @punchTime, 'Pending')
            `);
    return true;
  } catch (err) {
    console.error("SQL error adding approval request", err);
    return false;
  }
}

function isDuplicate(err) {
  return err?.number === 2627 || err?.number === 2601; // unique/duplicate key
}

async function withSqlRetry(
  op,
  { retries = DEADLOCK_RETRIES, label = "sql-op" } = {}
) {
  let attempt = 0;
  for (;;) {
    try {
      return await op();
    } catch (e) {
      attempt++;
      if (attempt > retries || !isTransient(e)) throw e;
      const backoff =
        Math.min(2000, 300 * 2 ** (attempt - 1)) +
        Math.floor(Math.random() * 150);
      console.warn(
        `[retry] ${label} failed (attempt ${attempt}/${retries + 1}): ${
          e.message
        }. Retrying in ${backoff}ms`
      );
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
}
const s = (v) => (v == null ? null : String(v));
const iOrNull = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};
const fOrZero = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

async function insertIntoLabourAttendanceDetails(details) {
  try {
    if (!details || typeof details !== "object")
      throw new Error("details is required");
    if (!details.labourId) throw new Error("details.labourId is required");
    if (!details.date) throw new Error("details.date is required (YYYY-MM-DD)");

    const pool = await poolPromise;

    const query = `
      IF NOT EXISTS (
        SELECT 1
        FROM [dbo].[LabourAttendanceDetails]
        WHERE LabourId = @LabourId AND Date = @Date
      )
      BEGIN
        INSERT INTO [dbo].[LabourAttendanceDetails] (
          [LabourId], [Date],
          [FirstPunch], [FirstPunchAttendanceId], [FirstPunchDeviceId],
          [LastPunch], [LastPunchAttendanceId], [LastPunchDeviceId],
          [TotalHours], [Overtime], [PayrollCalRoundOffOvertime], [Status],
          [CreationDate], [projectName],
          [FirstPunchManually], [LastPunchManually],
          [OvertimeManually], [RemarkManually],
          [projectIdFromDevicefirstPunch], [projectIdFromDeviceLastPunch]
        )
        VALUES (
          @LabourId, @Date,
          @FirstPunch, @FirstPunchAttendanceId, @FirstPunchDeviceId,
          @LastPunch, @LastPunchAttendanceId, @LastPunchDeviceId,
          @TotalHours, @Overtime, @PayrollCalRoundOffOvertime, @Status,
          @CreationDate, @projectName,
          @FirstPunchManually, @LastPunchManually,
          @OvertimeManually, @RemarkManually,
          @projectIdFromDevicefirstPunch, @projectIdFromDeviceLastPunch
        )
      END
      ELSE IF EXISTS (
        SELECT 1 FROM [dbo].[LabourAttendanceDetails]
        WHERE LabourId = @LabourId AND Date = @Date AND FirstPunch IS NULL
      )
      BEGIN
        UPDATE [dbo].[LabourAttendanceDetails]
        SET 
          FirstPunch = @FirstPunch,
          FirstPunchAttendanceId = @FirstPunchAttendanceId,
          FirstPunchDeviceId = @FirstPunchDeviceId,
          LastPunch = @LastPunch,
          LastPunchAttendanceId = @LastPunchAttendanceId,
          LastPunchDeviceId = @LastPunchDeviceId,
          TotalHours = @TotalHours,
          Overtime = @Overtime,
          PayrollCalRoundOffOvertime = @PayrollCalRoundOffOvertime,
          Status = @Status,
          CreationDate = @CreationDate,
          projectName = @projectName,
          FirstPunchManually = @FirstPunchManually,
          LastPunchManually = @LastPunchManually,
          OvertimeManually = @OvertimeManually,
          RemarkManually = @RemarkManually,
          projectIdFromDevicefirstPunch = @projectIdFromDevicefirstPunch,
          projectIdFromDeviceLastPunch = @projectIdFromDeviceLastPunch
        WHERE LabourId = @LabourId AND Date = @Date
      END
    `;

    const key = `${details.labourId}|${details.date}`;

    if (details.date < new Date().toISOString().split("T")[0]) {
      return withSqlRetry(
        async () => {
          const req = pool.request();
          req.timeout = WRITE_TIMEOUT_MS;

          await req
            .input("LabourId", sql.NVarChar, s(details.labourId))
            .input("projectName", sql.Int, iOrNull(details.projectName))
            .input("Date", sql.Date, details.date)
            .input("FirstPunch", sql.NVarChar, s(details.firstPunch))
            .input(
              "FirstPunchAttendanceId",
              sql.Int,
              iOrNull(details.firstPunchAttendanceId)
            )
            .input(
              "FirstPunchDeviceId",
              sql.NVarChar,
              s(details.firstPunchDeviceId)
            )
            .input("LastPunch", sql.NVarChar, s(details.lastPunch))
            .input(
              "LastPunchAttendanceId",
              sql.Int,
              iOrNull(details.lastPunchAttendanceId)
            )
            .input(
              "LastPunchDeviceId",
              sql.NVarChar,
              s(details.lastPunchDeviceId)
            )
            .input("TotalHours", sql.Float, fOrZero(details.totalHours))
            .input("Overtime", sql.Float, fOrZero(details.overtime))
            .input(
              "PayrollCalRoundOffOvertime",
              sql.Float,
              fOrZero(details.PayrollCalRoundOffOvertime)
            )
            .input("Status", sql.NVarChar, s(details.status))
            .input(
              "CreationDate",
              sql.DateTime,
              details.creationDate || new Date()
            )
            .input("FirstPunchManually", sql.NVarChar, s(details.firstPunch)) // as in your code
            .input("LastPunchManually", sql.NVarChar, s(details.lastPunch))
            .input(
              "OvertimeManually",
              sql.Float,
              fOrZero(details.OvertimeManually)
            )
            .input("RemarkManually", sql.NVarChar, s(details.remarkManually))
            .input(
              "projectIdFromDevicefirstPunch",
              sql.Int,
              iOrNull(details.projectIdFromDevicefirstPunch)
            )
            .input(
              "projectIdFromDeviceLastPunch",
              sql.Int,
              iOrNull(details.projectIdFromDeviceLastPunch)
            )
            .query(query);
        },
        { label: `LabourAttendanceDetails upsert ${key}` }
      ).catch((e) => {
        // treat duplicate as success (race on IF NOT EXISTS)
        if (isDuplicate(e)) {
          console.warn(
            `[dup] LabourAttendanceDetails already exists for ${key}, treating as success.`
          );
          return true;
        }
        throw e;
      });
    }
  } catch (err) {
    console.error("❌ Error inserting/updating LabourAttendanceDetails:", err);
    throw err;
  }
}

function monthKey(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; // YYYY-MM
}

function isTransient(err) {
  const msg = String(err?.message || "").toLowerCase();
  return (
    err?.code === "ETIMEOUT" ||
    err?.code === "ESOCKET" ||
    err?.code === "ECONNRESET" ||
    err?.code === "ECONNABORTED" ||
    msg.includes("timeout") ||
    msg.includes("temporar") ||
    msg.includes("connection") ||
    err?.number === 1205
  ); // deadlock
}

async function withRetry(op, { retries = 1, label = "op" } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      return await op();
    } catch (e) {
      attempt++;
      if (attempt > retries || !isTransient(e)) throw e;
      const backoff =
        Math.min(2000, 400 * 2 ** (attempt - 1)) +
        Math.floor(Math.random() * 150);
      console.warn(
        `[retry] ${label} failed (attempt ${attempt}/${retries + 1}): ${
          e.message
        }. Retrying in ${backoff}ms`
      );
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
}

async function insertOrUpdateLabourAttendanceSummary(labourId, date) {
  try {
    if (!labourId) throw new Error("labourId is required");
    // if (!date) throw new Error('date is required (YYYY-MM-DD)');
    const selectedMonth = monthKey(date);
    if (!selectedMonth) throw new Error(`Invalid date: ${date}`);

    const pool = await poolPromise;

    // Step 1 & 2 in parallel (no SQL text changes)
    const [summaryRes, existRes] = await Promise.all([
      withRetry(
        () => {
          const req = pool.request();
          req.timeout = READ_TIMEOUT_MS;
          return req
            .input("LabourId", sql.NVarChar, labourId)
            .input("SelectedMonth", sql.NVarChar, selectedMonth).query(`
        SELECT 
            COUNT(*) AS TotalDays,
            SUM(CASE WHEN Status = 'P' THEN 1 ELSE 0 END) AS PresentDays,
            SUM(CASE WHEN Status = 'HD' THEN 1 ELSE 0 END) AS HalfDays,
            SUM(CASE WHEN Status = 'A' THEN 1 ELSE 0 END) AS AbsentDays,
            SUM(CASE WHEN Status = 'MP' THEN 1 ELSE 0 END) AS MissPunchDays,
            SUM(Overtime) AS TotalOvertimeHours,
            SUM(OvertimeManually) AS TotalOvertimeHoursManually,
            SUM(PayrollCalRoundOffOvertime) AS PayrollCalRoundoffTotalOvertime
        FROM LabourAttendanceDetails
        WHERE LabourId = @LabourId
        AND FORMAT(Date, 'yyyy-MM') = @SelectedMonth
      `);
        },
        { retries: RETRIES_READ, label: "select summary from details" }
      ),

      withRetry(
        () => {
          const req = pool.request();
          req.timeout = READ_TIMEOUT_MS;
          return req
            .input("LabourId", sql.NVarChar, labourId)
            .input("SelectedMonth", sql.NVarChar, selectedMonth).query(`
        SELECT PresentDays
        FROM LabourAttendanceSummary
        WHERE LabourId = @LabourId AND SelectedMonth = @SelectedMonth
      `);
        },
        { retries: RETRIES_READ, label: "select existing summary row" }
      ),
    ]);

    const row = summaryRes.recordset?.[0] ?? {};
    // Guard against NULLs from SUM() and COUNT
    const TotalDays = Number(row.TotalDays ?? 0);
    const PresentDays = Number(row.PresentDays ?? 0);
    const HalfDays = Number(row.HalfDays ?? 0);
    const AbsentDays = Number(row.AbsentDays ?? 0);
    const MissPunchDays = Number(row.MissPunchDays ?? 0);
    const TotalOvertimeHours = Number(row.TotalOvertimeHours ?? 0);
    const TotalOvertimeHoursManually = Number(
      row.TotalOvertimeHoursManually ?? 0
    );
    const PayrollCalRoundoffTotalOvertime = Number(
      row.PayrollCalRoundoffTotalOvertime ?? 0
    );

    const exists = existRes.recordset?.length > 0;
    const presentVal = exists ? existRes.recordset[0]?.PresentDays : undefined;
    const shouldUpdate =
      exists && (presentVal === null || presentVal === undefined);

    if (exists && !shouldUpdate) {
      // Record exists and already populated → skip
      return { action: "skipped", labourId, selectedMonth };
    }

    if (exists) {
      await withRetry(
        () => {
          const req = pool.request();
          req.timeout = WRITE_TIMEOUT_MS;
          return req
            .input("LabourId", sql.NVarChar, labourId)
            .input("TotalDays", sql.Int, TotalDays)
            .input("PresentDays", sql.Int, PresentDays)
            .input("HalfDays", sql.Int, HalfDays)
            .input("AbsentDays", sql.Int, AbsentDays)
            .input("MissPunchDays", sql.Int, MissPunchDays)
            .input("TotalOvertimeHours", sql.Float, TotalOvertimeHours)
            .input(
              "TotalOvertimeHoursManually",
              sql.Float,
              TotalOvertimeHoursManually
            )
            .input(
              "PayrollCalRoundoffTotalOvertime",
              sql.Float,
              PayrollCalRoundoffTotalOvertime
            )
            .input("CreationDate", sql.DateTime, new Date())
            .input("SelectedMonth", sql.NVarChar, selectedMonth).query(`
          UPDATE LabourAttendanceSummary
          SET 
              TotalDays = @TotalDays,
              PresentDays = @PresentDays,
              HalfDays = @HalfDays,
              AbsentDays = @AbsentDays,
              MissPunchDays = @MissPunchDays,
              TotalOvertimeHours = @TotalOvertimeHours,
              TotalOvertimeHoursManually = @TotalOvertimeHoursManually,
              PayrollCalRoundoffTotalOvertime = @PayrollCalRoundoffTotalOvertime,
              CreationDate = @CreationDate
          WHERE LabourId = @LabourId AND SelectedMonth = @SelectedMonth
        `);
        },
        { retries: RETRIES_WRITE, label: "update summary" }
      );

      return { action: "updated", labourId, selectedMonth };
    } else {
      await withRetry(
        () => {
          const req = pool.request();
          req.timeout = WRITE_TIMEOUT_MS;
          return req
            .input("LabourId", sql.NVarChar, labourId)
            .input("TotalDays", sql.Int, TotalDays)
            .input("PresentDays", sql.Int, PresentDays)
            .input("HalfDays", sql.Int, HalfDays)
            .input("AbsentDays", sql.Int, AbsentDays)
            .input("MissPunchDays", sql.Int, MissPunchDays)
            .input("TotalOvertimeHours", sql.Float, TotalOvertimeHours)
            .input(
              "TotalOvertimeHoursManually",
              sql.Float,
              TotalOvertimeHoursManually
            )
            .input(
              "PayrollCalRoundoffTotalOvertime",
              sql.Float,
              PayrollCalRoundoffTotalOvertime
            )
            .input("CreationDate", sql.DateTime, new Date())
            .input("SelectedMonth", sql.NVarChar, selectedMonth).query(`
          INSERT INTO LabourAttendanceSummary (
              LabourId, TotalDays, PresentDays, HalfDays, AbsentDays, MissPunchDays,
              TotalOvertimeHours, TotalOvertimeHoursManually, PayrollCalRoundoffTotalOvertime, CreationDate, SelectedMonth
          ) VALUES (
              @LabourId, @TotalDays, @PresentDays, @HalfDays, @AbsentDays, @MissPunchDays,
              @TotalOvertimeHours, @TotalOvertimeHoursManually, @PayrollCalRoundoffTotalOvertime, @CreationDate, @SelectedMonth
          )
        `);
        },
        { retries: RETRIES_WRITE, label: "insert summary" }
      );

      console.log(
        `insertOrUpdateLabourAttendanceSummary job completed successfully for Date: ${date}`
      );
      return { action: "inserted", labourId, selectedMonth };
    }
  } catch (err) {
    console.error("❌ Error in insertOrUpdateLabourAttendanceSummary:", err);
    throw err;
  }
}

async function insertIntoLabourAttendanceSummary(summary) {
  try {
    const pool = await poolPromise;

    if (!summary || typeof summary !== "object")
      throw new Error("summary object is required");
    const {
      labourId,
      date, // YYYY-MM-DD
      selectedMonth: sm, // may be provided, else derive from date
      creationDate,
      shift,
    } = summary;

    if (!labourId) throw new Error("labourId is required");
    const selectedMonth = sm || monthKey(date);
    if (!selectedMonth) throw new Error(`Invalid date: ${date}`);

    const [summaryDataResult, existingRecordResult] = await Promise.all([
      withRetry(
        async () => {
          const req = pool.request();
          req.timeout = READ_TIMEOUT_MS;
          return req
            .input("LabourId", sql.NVarChar, labourId)
            .input("SelectedMonth", sql.NVarChar, selectedMonth).query(`
        SELECT 
            COUNT(*) AS TotalDays,
            SUM(CASE WHEN Status = 'P' THEN 1 ELSE 0 END) AS PresentDays,
            SUM(CASE WHEN Status = 'HD' THEN 1 ELSE 0 END) AS HalfDays,
            SUM(CASE WHEN Status = 'A' THEN 1 ELSE 0 END) AS AbsentDays,
            SUM(CASE WHEN Status = 'MP' THEN 1 ELSE 0 END) AS MissPunchDays,
            SUM(Overtime) AS TotalOvertimeHours,
            SUM(OvertimeManually) AS TotalOvertimeHoursManually,
            SUM(PayrollCalRoundOffOvertime) AS PayrollCalRoundoffTotalOvertime,
            SUM(PayrollCalRoundOffOvertime) AS RoundOffTotalOvertime
        FROM LabourAttendanceDetails
        WHERE LabourId = @LabourId
        AND FORMAT(Date, 'yyyy-MM') = @SelectedMonth
      `);
        },
        { retries: RETRIES_READ, label: "select monthly totals from details" }
      ),

      withRetry(
        async () => {
          const req = pool.request();
          req.timeout = READ_TIMEOUT_MS;
          return req
            .input("LabourId", sql.NVarChar, labourId)
            .input("SelectedMonth", sql.NVarChar, selectedMonth).query(`
        SELECT PresentDays
        FROM LabourAttendanceSummary
        WHERE LabourId = @LabourId AND SelectedMonth = @SelectedMonth
      `);
        },
        { retries: RETRIES_READ, label: "select existing summary row" }
      ),
    ]);

    const r = summaryDataResult.recordset?.[0] ?? {};
    const TotalDays = n(r.TotalDays, n(summary.totalDays, 0));
    const PresentDays = n(r.PresentDays, n(summary.presentDays, 0));
    const HalfDays = n(r.HalfDays, n(summary.halfDays, 0));
    const AbsentDays = n(r.AbsentDays, n(summary.absentDays, 0));
    const MissPunchDays = n(r.MissPunchDays, n(summary.missPunchDays, 0));
    const TotalOvertimeHours = n(
      r.TotalOvertimeHours,
      n(summary.totalOvertimeHours, 0)
    );
    const TotalOvertimeHoursManually = n(
      r.TotalOvertimeHoursManually,
      n(summary.TotalOvertimeHoursManually, 0)
    );
    const PayrollCalRoundoffTotalOvertime = n(
      r.PayrollCalRoundoffTotalOvertime,
      n(summary.PayrollCalRoundoffTotalOvertime, 0)
    );
    const RoundOffTotalOvertime = n(
      r.RoundOffTotalOvertime,
      n(summary.RoundOffTotalOvertime, 0)
    );

    const exists = existingRecordResult.recordset?.length > 0;

    const bind = (req) =>
      req
        .input("LabourId", sql.NVarChar, labourId)
        .input("TotalDays", sql.Int, TotalDays)
        .input("PresentDays", sql.Int, PresentDays)
        .input("HalfDays", sql.Int, HalfDays)
        .input("AbsentDays", sql.Int, AbsentDays)
        .input("MissPunchDays", sql.Int, MissPunchDays)
        .input("TotalOvertimeHours", sql.Float, TotalOvertimeHours)
        .input("RoundOffTotalOvertime", sql.Float, RoundOffTotalOvertime)
        .input(
          "TotalOvertimeHoursManually",
          sql.Float,
          TotalOvertimeHoursManually
        )
        .input(
          "PayrollCalRoundoffTotalOvertime",
          sql.Float,
          PayrollCalRoundoffTotalOvertime
        )
        .input("Shift", sql.NVarChar, shift ?? null)
        .input("CreationDate", sql.DateTime, creationDate ?? new Date())
        .input("SelectedMonth", sql.NVarChar, selectedMonth)
        .input("Date", sql.Date, date);

    if (exists) {
      await withRetry(
        async () => {
          const req = pool.request();
          req.timeout = WRITE_TIMEOUT_MS;
          return bind(req).query(`
        UPDATE LabourAttendanceSummary
        SET 
            TotalDays = @TotalDays,
            PresentDays = @PresentDays,
            HalfDays = @HalfDays,
            AbsentDays = @AbsentDays,
            MissPunchDays = @MissPunchDays,
            TotalOvertimeHours = @TotalOvertimeHours,
            RoundOffTotalOvertime = @RoundOffTotalOvertime,
            TotalOvertimeHoursManually = @TotalOvertimeHoursManually,
            PayrollCalRoundoffTotalOvertime = @PayrollCalRoundoffTotalOvertime,
            Shift = @Shift,
            CreationDate = @CreationDate,
            Date = @Date
        WHERE LabourId = @LabourId AND SelectedMonth = @SelectedMonth
      `);
        },
        { retries: RETRIES_WRITE, label: "update LabourAttendanceSummary" }
      );

      return { action: "updated", labourId, selectedMonth };
    } else {
      // ---- INSERT (no existing row)
      await withRetry(
        async () => {
          const req = pool.request();
          req.timeout = WRITE_TIMEOUT_MS;
          return bind(req).query(`
        INSERT INTO LabourAttendanceSummary (
            LabourId, TotalDays, PresentDays, HalfDays, AbsentDays, MissPunchDays,
            TotalOvertimeHours, RoundOffTotalOvertime, TotalOvertimeHoursManually,
            PayrollCalRoundoffTotalOvertime, Shift, CreationDate, SelectedMonth, Date
        )
        VALUES (
            @LabourId, @TotalDays, @PresentDays, @HalfDays, @AbsentDays, @MissPunchDays,
            @TotalOvertimeHours, @RoundOffTotalOvertime, @TotalOvertimeHoursManually,
            @PayrollCalRoundoffTotalOvertime, @Shift, @CreationDate, @SelectedMonth, @Date
        )
      `);
        },
        { retries: RETRIES_WRITE, label: "insert LabourAttendanceSummary" }
      );

      return { action: "inserted", labourId, selectedMonth };
    }
  } catch (err) {
    console.error("❌ Error in insertIntoLabourAttendanceSummary:", err);
    throw err; // preserve original stack for upstream handler
  }
}

async function deleteAttendanceDetails(month, year) {
  try {
    const pool = await poolPromise;
    await pool
      .request()
      .input("month", sql.Int, month)
      .input("year", sql.Int, year).query(`
                DELETE FROM [dbo].[LabourAttendanceDetails]
                WHERE MONTH(Date) = @month AND YEAR(Date) = @year
            `);
  } catch (error) {
    console.error("Error deleting attendance details:", error);
    throw new Error("Error deleting attendance details");
  }
}

async function deleteAttendanceSummary(month, year) {
  try {
    const pool = await poolPromise;
    await pool
      .request()
      .input("month", sql.Int, month)
      .input("year", sql.Int, year).query(`
                DELETE FROM [dbo].[LabourAttendanceSummary]
                WHERE MONTH(SelectedMonth) = @month AND YEAR(SelectedMonth) = @year
            `);
  } catch (error) {
    console.error("Error deleting attendance summary:", error);
    throw new Error("Error deleting attendance summary");
  }
}

async function fetchAttendanceByMonthYear(month, year) {
  try {
    const formattedMonth = `${year}-${month.toString().padStart(2, "0")}`;
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("selectedMonth", sql.NVarChar, formattedMonth).query(`
                SELECT *
                FROM [dbo].[LabourAttendanceSummary]
                WHERE SelectedMonth = @selectedMonth
            `);
    return result.recordset;
  } catch (error) {
    console.error("Error fetching attendance by month and year:", error);
    throw error;
  }
}

async function fetchAttendanceSummary() {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
            SELECT *
            FROM [dbo].[LabourAttendanceSummary]
        `);
    return result.recordset;
  } catch (error) {
    console.error("Error fetching attendance summary:", error);
    throw error;
  }
}

async function fetchAttendanceDetailsByMonthYear(month, year) {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("month", sql.Int, month)
      .input("year", sql.Int, year).query(`
                SELECT 
                    L.*,
                    CASE 
                        WHEN EXISTS (
                            SELECT 1 
                            FROM dbo.LabourAttendanceDetails d
                            WHERE d.LabourId = L.LabourId
                            AND MONTH(d.Date) = @month
                            AND YEAR(d.Date) = @year
                            AND d.ApprovalStatus = 'Pending'
                        ) THEN CAST(1 AS BIT)
                        ELSE CAST(0 AS BIT)
                    END AS InApprovalStatus
                FROM dbo.LabourAttendanceSummary AS L
                WHERE 
                    MONTH(TRY_CONVERT(DATE, L.SelectedMonth + '-01')) = @month 
                    AND YEAR(TRY_CONVERT(DATE, L.SelectedMonth + '-01')) = @year
                    AND L.PresentDays > 0;  -- Add condition to exclude labors with PresentDays = 0
            `);
    return result.recordset;
  } catch (error) {
    console.error("Error fetching attendance details for all labours:", error);
    throw error;
  }
}

async function fetchAttendanceDetailsByMonthYearForSingleLabour(
  labourId,
  month,
  year
) {
  try {
    const pool = await poolPromise;
    let formattedMonth = month.toString().padStart(2, "0");
    let datefornewquery = `${year}-${formattedMonth}`;

    const finalPayResult = await pool
      .request()
      .input("labourId", sql.NVarChar, labourId)
      .input("month", sql.Int, month)
      .input("year", sql.Int, year).query(`
              SELECT COUNT(*) AS Count
              FROM [dbo].[FinalizedSalaryPay]
              WHERE LabourID = @labourId AND Month = @month AND Year = @year
          `);

    const isFinalPayAvailable = finalPayResult.recordset[0].Count > 0;
    const result = await pool
      .request()
      .input("labourId", sql.NVarChar, labourId)
      .input("month", sql.Int, month)
      .input("year", sql.Int, year)
      .input("datefornewquery", sql.NVarChar, datefornewquery).query(`
                SELECT 
                    att.AttendanceId,
                    att.LabourId,
                    att.Date,
                    att.FirstPunch,
                    att.LastPunch,
                    att.TotalHours,
                    att.Overtime,
                    CASE 
                        WHEN hol.HolidayDate IS NOT NULL THEN 'H'
                        ELSE att.Status
                    END AS Status,
                    att.CreationDate,
                    att.FirstPunchManually,
                    att.LastPunchManually,
                    att.OvertimeManually,
                    att.RemarkManually,
                    att.FirstPunchAttendanceId,
                    att.FirstPunchDeviceId,
                    att.LastPunchAttendanceId,
                    att.LastPunchDeviceId,
                    att.TimesUpdate,
                    att.EditUserName,
                    att.LastUpdatedDate,
                    att.WorkingHours,
                    att.OnboardName,
                    att.ApprovalStatus,
                    att.projectName,
                    las.TotalOvertimeHoursManually,
                    las.Shift
                FROM [dbo].[LabourAttendanceDetails] att
                inner join LabourAttendanceSummary  las on las.LabourId=att.LabourId
                LEFT JOIN [dbo].[HolidayDate] hol
                    ON att.Date = hol.HolidayDate
                WHERE 
                    att.LabourId = @labourId
                    AND MONTH(att.Date) = @month 
                    AND YEAR(att.Date) = @year
                    and las.SelectedMonth=@datefornewquery
            `);

    const result2 = await pool
      .request()
      .input("labourId", sql.NVarChar, labourId)
      .input("datefornewquery", sql.NVarChar, datefornewquery) // Explicitly define type
      .query(
        `SELECT TotalOvertimeHours FROM LabourAttendanceSummary 
         WHERE LabourId = @labourId AND SelectedMonth = @datefornewquery`
      );

    return result.recordset.map((row) => {
      // Ensure the status is not an array
      row.Status = Array.isArray(row.Status) ? row.Status[0] : row.Status;
      row.isFinalPayAvailable = isFinalPayAvailable;
      return row;
    });
  } catch (error) {
    console.error(
      "Error fetching attendance details for a single labour:",
      error
    );
    throw error;
  }
}

async function showAttendanceCalenderSingleLabour(labourId, month, year) {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("labourId", sql.NVarChar, labourId)
      .input("month", sql.Int, month)
      .input("year", sql.Int, year).query(`
                SELECT 
                    att.Date,
                    CASE 
                        WHEN hol.HolidayDate IS NOT NULL THEN 'H'
                        ELSE ISNULL(att.Status, 'NA')
                    END AS Status
                FROM [dbo].[LabourAttendanceDetails] att
                LEFT JOIN [dbo].[HolidayDate] hol
                ON att.Date = hol.HolidayDate
                WHERE 
                    att.LabourId = @labourId
                    AND MONTH(att.Date) = @month
                    AND YEAR(att.Date) = @year
            `);

    return result.recordset.map((row) => ({
      Date: row.Date,
      Status: row.Status || "NA",
    }));
  } catch (error) {
    console.error(
      "Error fetching attendance details for a single labour:",
      error
    );
    throw error;
  }
}

async function getHolidayDates(month, year) {
  try {
    const formattedMonth = String(month).padStart(2, "0");

    const startDate = `${year}-${formattedMonth}-01`;

    const endDateObj = new Date(year, month, 0); // Month is 1-indexed here
    const lastDay = endDateObj.getDate();
    const endDate = `${year}-${formattedMonth}-${String(lastDay).padStart(
      2,
      "0"
    )}`;

    const pool = await poolPromise;

    const query = `
            SELECT CONVERT(VARCHAR(10), HolidayDate, 120) AS HolidayDate
            FROM [dbo].[HolidayDate]
            WHERE HolidayDate BETWEEN @startDate AND @endDate
        `;

    const result = await pool
      .request()
      .input("startDate", startDate)
      .input("endDate", endDate)
      .query(query);

    return result.recordset.map((holiday) => holiday.HolidayDate);
  } catch (error) {
    console.error("Error fetching holiday dates:", error);

    throw new Error(
      "Failed to retrieve holiday dates. Please try again later."
    );
  }
}

async function getTimesUpdateForMonth(labourId, date) {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("labourId", sql.NVarChar, labourId)
      .input("month", sql.Int, new Date(date).getMonth() + 1)
      .input("year", sql.Int, new Date(date).getFullYear()).query(`
                SELECT SUM(TimesUpdate) AS TotalTimesUpdate
                FROM [LabourAttendanceDetails]
                WHERE LabourId = @labourId
                  AND MONTH(Date) = @month
                  AND YEAR(Date) = @year
            `);

    return result.recordset[0]?.TotalTimesUpdate || 0;
  } catch (error) {
    console.error("Error fetching TimesUpdate:", error);
    throw new Error("Error fetching TimesUpdate for month.");
  }
}

async function markAttendanceForApproval(
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
) {
  try {
    if (
      AttendanceId === undefined ||
      AttendanceId === null ||
      isNaN(AttendanceId)
    ) {
      throw new Error(
        "AttendanceId must be a valid number and cannot be empty."
      );
    }

    const pool = await poolPromise;
    const request = pool.request();

    // Bind inputs for both queries
    request.input("AttendanceId", sql.Int, AttendanceId);
    request.input("labourId", sql.NVarChar, labourId);
    request.input("date", sql.Date, date);
    request.input("overtimeManually", sql.Float, overtimeManually || null);
    request.input("remarkManually", sql.VarChar, remarkManually || null);
    request.input("finalOnboardName", sql.VarChar, finalOnboardName || null);
    request.input(
      "firstPunchManually",
      sql.VarChar,
      firstPunchManually || null
    );
    request.input("lastPunchManually", sql.VarChar, lastPunchManually || null);
    request.input(
      "markWeeklyOff",
      sql.Bit,
      markWeeklyOff === true ? 1 : 0 || null
    );
    request.input(
      "UpdatedFields",
      sql.NVarChar,
      JSON.stringify(updatedFields) || null
    );
    request.input("userType", sql.NVarChar, userType || null);

    const result = await pool
      .request()
      .input("LabourID", sql.NVarChar, labourId).query(`
            SELECT name
            FROM [dbo].[labourOnboarding]
            WHERE LabourID = @LabourID
        `);

    const name = result.recordset.length > 0 ? result.recordset[0].name : null;
    // Perform the UPDATE query
    await request.query(`
            UPDATE [LabourAttendanceDetails]
            SET SentForApproval = 1,
                ApprovalStatus = 'Pending',
                RemarkManually = @remarkManually,
                OnboardName = @finalOnboardName,
                LastUpdatedDate = GETDATE()
            WHERE LabourId = @labourId AND Date = @date
        `);

    request.input("name", sql.NVarChar, name || null);
    // Perform the INSERT query
    await request.query(`
            INSERT INTO LabourAttendanceApproval (
              AttendanceId, LabourId, Date, OvertimeManually, RemarkManually, OnboardName, FirstPunchManually, LastPunchManually, markWeeklyOff, name, UpdatedFields, userType
            )
            VALUES (
              @AttendanceId, @labourId, @date, @overtimeManually, @remarkManually, @finalOnboardName, @firstPunchManually, @lastPunchManually, @markWeeklyOff, @name, @UpdatedFields, @userType
            )
        `);
  } catch (error) {
    console.error("Error marking attendance for approval:", error);
    throw new Error("Error marking attendance for admin approval.");
  }
}

async function approveAttendance(AttendanceId) {
  try {
    const pool = await poolPromise;
    console.log("AttendanceId add ==>", AttendanceId);
    // Fetch the approval record
    const result = await pool
      .request()
      .input("AttendanceId", sql.Int, AttendanceId).query(`
                SELECT *
                FROM LabourAttendanceApproval
                WHERE AttendanceId = @AttendanceId and ApprovalStatus = 'Pending'
            `);

    if (result.recordset.length === 0) {
      throw new Error("Approval record not found.");
    }

    const approvalData = result.recordset[0];
    console.log("approvalData attendance   --", approvalData);

    const formattedDate = approvalData.Date.toISOString().split("T")[0];

    const getResult = await pool
      .request()
      .input("LabourID", sql.NVarChar(50), approvalData.LabourId).query(`
        SELECT workingHours 
        FROM [dbo].[labourOnboarding] 
        WHERE LabourID = @LabourID
    `);

    if (getResult.recordset.length === 0) {
      throw new Error(
        `LabourID ${row.LabourID} not found in labourOnboarding table`
      );
    }

    const workingHours = getResult.recordset[0].workingHours;
    console.log("workingHours get for attendance", workingHours);

    await upsertAttendance({
      labourId: approvalData.LabourId,
      date: formattedDate,
      firstPunchManually: approvalData.FirstPunchManually,
      lastPunchManually: approvalData.LastPunchManually,
      overtimeManually: approvalData.OvertimeManually,
      remarkManually: approvalData.RemarkManually,
      workingHours: workingHours,
      onboardName: approvalData.OnboardName,
      markWeeklyOff: approvalData.markWeeklyOff,
    });

    await pool.request().input("AttendanceId", sql.Int, AttendanceId).query(`
                UPDATE LabourAttendanceApproval
                SET ApprovalStatus = 'Approved',
                    ApprovalDate = GETDATE()
                WHERE AttendanceId = @AttendanceId
            `);

    await pool
      .request()
      .input("labourId", sql.NVarChar, approvalData.LabourId)
      .input("date", sql.Date, formattedDate)
      .input("isApprovedAttendance", sql.Bit, 1).query(`
                UPDATE LabourAttendanceDetails
                SET ApprovalStatus = 'Approved',
                    ApprovalDate = GETDATE(),
                    isApprovedAttendance = @isApprovedAttendance
                WHERE LabourId = @labourId AND Date = @date
            `);

    return { success: true, message: "Attendance approved successfully." };
  } catch (error) {
    console.error("Error approving attendance:", error);
    throw new Error("Error approving attendance.");
  }
}

async function rejectAttendanceAdmin(AttendanceId, rejectReason) {
  try {
    const pool = await poolPromise;

    // Fetch the approval record
    const result = await pool
      .request()
      .input("AttendanceId", sql.Int, AttendanceId).query(`
                SELECT *
                FROM LabourAttendanceApproval
                WHERE AttendanceId = @AttendanceId
            `);

    if (result.recordset.length === 0) {
      throw new Error("Approval record not found.");
    }

    const approvalData = result.recordset[result.recordset.length - 1];

    const formattedDate = approvalData.Date.toISOString().split("T")[0];

    await upsertAttendance({
      labourId: approvalData.LabourId,
      date: formattedDate,
      firstPunchManually: approvalData.FirstPunchManually,
      lastPunchManually: approvalData.LastPunchManually,
      overtimeManually: approvalData.OvertimeManually,
      remarkManually: approvalData.RemarkManually,
      workingHours: approvalData.WorkingHours,
      onboardName: approvalData.OnboardName,
      markWeeklyOff: false,
    });

    await pool
      .request()
      .input("AttendanceId", sql.Int, AttendanceId)
      .input("rejectReason", sql.NVarChar, rejectReason).query(`
                UPDATE LabourAttendanceApproval
                SET ApprovalStatus = 'Rejected',
                    RejectedDate = GETDATE(),
                    RejectAttendanceReason = @rejectReason
                WHERE AttendanceId = @AttendanceId
            `);

    await pool
      .request()
      .input("labourId", sql.NVarChar, approvalData.LabourId)
      .input("date", sql.Date, formattedDate)
      .input("isRejectedAttendance", sql.Bit, 1).query(`
                UPDATE LabourAttendanceDetails
                SET ApprovalStatus = 'Rejected',
                    RejectedDate = GETDATE(),
                    isRejectedAttendance = @isRejectedAttendance
                WHERE LabourId = @labourId AND Date = @date
            `);

    return { success: true, message: "Attendance Rejected successfully." };
  } catch (error) {
    console.error("Error approving attendance:", error);
    throw new Error("Error approving attendance.");
  }
}

async function fetchAttendanceDetails(labourId, month, year, attendance) {
  try {
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);

    await transaction.begin();

    await transaction
      .request()
      .input("labourId", sql.NVarChar, labourId)
      .input("month", sql.Int, month)
      .input("year", sql.Int, year).query(`
                DELETE FROM [dbo].[LabourAttendanceDetails]
                WHERE LabourId = @labourId 
                AND MONTH(Date) = @month 
                AND YEAR(Date) = @year
            `);

    const insertQuery = `
            INSERT INTO [dbo].[LabourAttendanceDetails] (
                LabourId, Date, FirstPunch, LastPunch, TotalHours, Overtime, Status, CreationDate
            ) VALUES (@labourId, @date, @firstPunch, @lastPunch, @totalHours, @overtime, @status, GETDATE())
        `;

    const request = transaction.request();
    for (const record of attendance) {
      await request
        .input("labourId", sql.NVarChar, labourId)
        .input("date", sql.Date, record.date)
        .input("firstPunch", sql.Time, record.firstPunch || null)
        .input("lastPunch", sql.Time, record.lastPunch || null)
        .input("totalHours", sql.Float, record.totalHours || 0)
        .input("overtime", sql.Float, record.overtime || 0)
        .input("status", sql.NVarChar, record.status)
        .query(insertQuery);
    }

    await transaction.commit();
  } catch (error) {
    console.error("Error saving full month attendance:", error);
    throw error;
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

function determineStatus(punches, shiftHours, halfDayHours, workingHours) {
  // If no punches => A
  if (!punches || punches.length === 0) {
    return {
      status: "A",
      firstPunch: null,
      lastPunch: null,
      misPunch: false,
      totalHours: 0,
    };
  }

  // Sort by time
  punches.sort((a, b) => new Date(a.punch_time) - new Date(b.punch_time));

  const firstPunch = punches[0];
  const lastPunch = punches[punches.length - 1];
  const diffMs =
    new Date(lastPunch.punch_time) - new Date(firstPunch.punch_time);
  const totalHours = diffMs / (1000 * 60 * 60);

  if (totalHours <= 0) {
    return {
      status: "A",
      firstPunch,
      lastPunch,
      misPunch: false,
      totalHours: 0,
    };
  }

  // If <15 min => MP
  if (totalHours * 60 < 15) {
    return { status: "MP", firstPunch, lastPunch, misPunch: true, totalHours };
  }

  // If >= halfDay => P, else HD
  if (totalHours >= halfDayHours) {
    return { status: "P", firstPunch, lastPunch, misPunch: false, totalHours };
  } else {
    return { status: "HD", firstPunch, lastPunch, misPunch: false, totalHours };
  }
}

function roundOvertime(rawHours) {
  if (rawHours <= 0) return 0;

  const wholeHr = Math.floor(rawHours);
  let minutes = Math.round((rawHours - wholeHr) * 60);

  if (minutes < 15) {
    minutes = 0;
  } else if (minutes < 45) {
    minutes = 30;
  } else {
    minutes = 0;
    return wholeHr + 1;
  }
  return wholeHr + minutes / 60;
}

async function upsertAttendance({
  labourId,
  date,
  firstPunchManually,
  lastPunchManually,
  overtimeManually, // <-- This can come from frontend (Approval Data)
  remarkManually,
  workingHours,
  onboardName,
  markWeeklyOff,
  AttendanceStatus,
}) {
  console.log(
    "updasertAttendnace",
    labourId,
    date,
    firstPunchManually,
    lastPunchManually,
    overtimeManually,
    remarkManually,
    workingHours,
    onboardName,
    markWeeklyOff,
    AttendanceStatus
  );

  let totalHours = 0;
  let status = "A";
  let shiftHours = workingHours === "FLEXI SHIFT - 9 HRS" ? 9 : 8;
  let halfDayHours = shiftHours === 9 ? 4.5 : 4;

  try {
    const pool = await poolPromise;

    const holidayCheckResult = await pool
      .request()
      .input("date", sql.Date, date).query(`
                SELECT HolidayDate
                FROM [dbo].[HolidayDate]
                WHERE HolidayDate = @date
            `);
    if (holidayCheckResult.recordset.length > 0) {
      throw new Error(
        "The date is a holiday. You cannot modify punch times or overtime."
      );
    }

    // 2) Fetch existing record if any
    const attendanceResult = await pool
      .request()
      .input("labourId", sql.NVarChar, labourId)
      .input("date", sql.Date, date).query(`
                SELECT 
                    TimesUpdate, 
                    FirstPunch, 
                    LastPunch,
                    SentForApproval, 
                    ApprovalStatus
                FROM [dbo].[LabourAttendanceDetails]
                WHERE LabourId = @labourId 
                  AND Date = @date
            `);

    let sentForApproval = false;
    let approvalStatus = null;
    let existingFirstPunch = null;
    let existingLastPunch = null;

    if (attendanceResult.recordset.length > 0) {
      const record = attendanceResult.recordset[0];
      sentForApproval = record.SentForApproval;
      approvalStatus = record.ApprovalStatus;
      existingFirstPunch = record.FirstPunch;
      existingLastPunch = record.LastPunch;

      // If "Pending" => block changes
      if (approvalStatus === "Pending" && !sentForApproval) {
        throw new Error(
          "Attendance is pending admin approval and cannot be modified."
        );
      }
    }

    // 3) Decide final firstPunch, lastPunch
    const firstPunch = markWeeklyOff
      ? "00:00:00"
      : firstPunchManually || existingFirstPunch;
    const lastPunch = markWeeklyOff
      ? "00:00:00"
      : lastPunchManually || existingLastPunch;

    let rawOvertime = 0;

    // 4) Decide status & rawOvertime
    if (markWeeklyOff) {
      status = "WO";
      rawOvertime = 0;
    } else if (firstPunch && lastPunch) {
      // Compute total hours from times
      if (firstPunch === "00:00:00" && lastPunch === "00:00:00") {
        status = "A";
        rawOvertime = 0;
      } else {
        const firstPunchTime = new Date(`${date}T${firstPunch}`);
        const lastPunchTime = new Date(`${date}T${lastPunch}`);
        const diffMs = lastPunchTime - firstPunchTime;
        const hoursDiff = diffMs / (1000 * 60 * 60);

        totalHours = hoursDiff > 0 ? parseFloat(hoursDiff.toFixed(2)) : 0;

        // If <15 min total, treat as mis-punch
        if (totalHours > 0 && diffMs / (1000 * 60) < 15) {
          status = "MP";
          rawOvertime = 0;
        } else {
          // Half-day / Full-day logic
          if (totalHours >= halfDayHours) {
            status = "P";
            // Calculate OT from shift
            const potentialOvertime = totalHours - shiftHours;
            rawOvertime = potentialOvertime > 0 ? potentialOvertime : 0;
          } else {
            status = "HD";
            rawOvertime = 0;
          }
        }
      }
    } else if (overtimeManually && String(overtimeManually).trim() !== "") {
      // No (or partial) punches, but user specified manual OT => treat as present
      status = "P";
      // Use the user-provided OvertimeManually as rawOvertime
      rawOvertime = parseFloat(overtimeManually) || 0;
    } else {
      // No punches, no OT => absent
      status = "A";
      rawOvertime = 0;
      finalOvertimeManually = 0;
    }
    // console.log("rawOvertime",rawOvertime)
    // 5) Round the computed rawOvertime
    let payrollCalRoundOffOvertime = roundOvertime(rawOvertime);
    // console.log("payrollCalRoundOffOvertime",payrollCalRoundOffOvertime)

    // 6) If user explicitly gave "OvertimeManually" from the front-end, use that.
    //    Otherwise, cap system's computed rounding at 4.
    let finalOvertimeManually = 0;
    const isOvertimeManuallyDefined =
      overtimeManually !== null && overtimeManually !== undefined;
    if (isOvertimeManuallyDefined && String(overtimeManually).trim() !== "") {
      finalOvertimeManually = parseFloat(overtimeManually);
    } else {
      finalOvertimeManually = Math.min(4, payrollCalRoundOffOvertime);
    }
    // console.log("finalOvertimeManually",finalOvertimeManually)
    if (AttendanceStatus === "MP") {
      const potentialOvertime = totalHours - shiftHours;
      const adjustedOvertime = potentialOvertime > 0 ? potentialOvertime : 0;

      rawOvertime = adjustedOvertime;
      payrollCalRoundOffOvertime = roundOvertime(rawOvertime);
      finalOvertimeManually = Math.min(payrollCalRoundOffOvertime, 4);
      // finalOvertimeManually = payrollCalRoundOffOvertime;
    }

    // 7) MERGE/Upsert the attendance record
    const mergeQuery = `
            MERGE INTO [dbo].[LabourAttendanceDetails] AS [Target]
            USING (
                SELECT 
                    @labourId         AS [LabourId], 
                    @date             AS [Date], 
                    @firstPunch       AS [FirstPunch], 
                    @lastPunch        AS [LastPunch], 
                    @totalHours       AS [TotalHours],
                    @payrollRoundOff  AS [PayrollCalRoundOffOvertime],
                    @payrollRoundOff  AS [Overtime],
                    @status           AS [Status],
                    @finalOvertimeManually AS [OvertimeManually],
                    @remarkManually   AS [RemarkManually],
                    @onboardName      AS [OnboardName],
                    GETDATE()         AS [LastUpdatedDate]
            ) AS [Source]
            ON [Target].[LabourId] = [Source].[LabourId]
               AND [Target].[Date] = [Source].[Date]
            
            WHEN MATCHED THEN 
                UPDATE SET 
                    [FirstPunch]                  = COALESCE([Source].[FirstPunch], [Target].[FirstPunch]),
                    [LastPunch]                   = COALESCE([Source].[LastPunch],  [Target].[LastPunch]),
                    [FirstPunchManually]          = COALESCE([Source].[FirstPunch], [Target].[FirstPunchManually]),
                    [LastPunchManually]           = COALESCE([Source].[LastPunch],  [Target].[LastPunchManually]),
                    [TotalHours]                  = [Source].[TotalHours],
                    [Overtime]                    = [Source].[Overtime],
                    [PayrollCalRoundOffOvertime]  = [Source].[PayrollCalRoundOffOvertime],
                    [Status]                      = [Source].[Status],
                    [OvertimeManually]            = [Source].[OvertimeManually],
                    [RemarkManually]              = COALESCE([Source].[RemarkManually], [Target].[RemarkManually]),
                    [OnboardName]                 = COALESCE([Source].[OnboardName], [Target].[OnboardName]),
                    [LastUpdatedDate]             = GETDATE(),
                    [TimesUpdate]                 = ISNULL([Target].[TimesUpdate], 0) + 1
            
            WHEN NOT MATCHED THEN 
                INSERT (
                    [LabourId], [Date],
                    [FirstPunch], [LastPunch],
                    [FirstPunchManually], [LastPunchManually],
                    [TotalHours], [Overtime], [PayrollCalRoundOffOvertime],
                    [Status], [OvertimeManually], [RemarkManually],
                    [OnboardName], [LastUpdatedDate], [TimesUpdate]
                )
                VALUES (
                    [Source].[LabourId],
                    [Source].[Date],
                    [Source].[FirstPunch],
                    [Source].[LastPunch],
                    [Source].[FirstPunch],
                    [Source].[LastPunch],
                    [Source].[TotalHours],
                    [Source].[Overtime],
                    [Source].[PayrollCalRoundOffOvertime],
                    [Source].[Status],
                    [Source].[OvertimeManually],
                    [Source].[RemarkManually],
                    [Source].[OnboardName],
                    GETDATE(),
                    1
                );
        `;

    await pool
      .request()
      .input("labourId", sql.NVarChar, labourId)
      .input("date", sql.Date, date)
      .input("firstPunch", sql.VarChar, firstPunch)
      .input("lastPunch", sql.VarChar, lastPunch)
      .input("totalHours", sql.Float, totalHours)
      .input("payrollRoundOff", sql.Float, payrollCalRoundOffOvertime)
      .input("status", sql.VarChar, status)
      .input("finalOvertimeManually", sql.Float, finalOvertimeManually)
      .input("remarkManually", sql.VarChar, remarkManually)
      .input("onboardName", sql.NVarChar, onboardName)
      .query(mergeQuery);

    // 8) Recalculate monthly summary for the labour
    await insertOrUpdateLabourAttendanceSummary(labourId, date);

    // 9) (Optional) Re-run day-by-day logic for the entire month
    const [yearStr, monthStr] = date.split("-");
    const parsedYear = parseInt(yearStr, 10);
    const parsedMonth = parseInt(monthStr, 10);
    const daysInMonth = new Date(parsedYear, parsedMonth, 0).getDate();

    // 9a) Fetch all daily records for that labour for the month
    const labourAttendanceResult = await pool
      .request()
      .input("labourId", sql.NVarChar, labourId)
      .input("year", sql.Int, parsedYear)
      .input("month", sql.Int, parsedMonth).query(`
                SELECT
                    [LabourId],
                    [Date] AS [punch_date],
                    [FirstPunch] AS [punch_time]
                FROM [dbo].[LabourAttendanceDetails]
                WHERE LabourId = @labourId
                  AND YEAR([Date]) = @year
                  AND MONTH([Date]) = @month
                ORDER BY [Date]
            `);

    const labourAttendance = labourAttendanceResult.recordset || [];

    // Possibly fetch projectName
    let projectName = null;
    const projectResult = await pool
      .request()
      .input("labourId", sql.NVarChar, labourId).query(`
                SELECT TOP 1 [projectName]
                FROM [dbo].[LabourAttendanceDetails]
                WHERE [labourId] = @labourId
            `);
    if (projectResult.recordset.length > 0) {
      projectName =
        parseInt(projectResult.recordset[0].projectName, 10) || null;
    }

    // 9b) Build monthly attendance
    let presentDays = 0,
      halfDays = 0,
      missPunchDays = 0,
      absentDays = 0;
    let totalOvertimeHrs = 0;
    let totalManualOvertime = 0;
    let monthlyAttendance = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = String(day).padStart(2, "0");
      const fullDate = `${yearStr}-${monthStr}-${dayStr}`;

      // filter records for that date
      const punchesForDay = labourAttendance.filter((att) => {
        const attDateStr = new Date(att.punch_date).toISOString().split("T")[0];
        return attDateStr === fullDate;
      });

      // If no punches => skip or mark absent
      if (!punchesForDay || punchesForDay.length === 0) {
        monthlyAttendance.push({
          labourId,
          projectName,
          date: fullDate,
          firstPunch: null,
          lastPunch: null,
          totalHours: "0.00",
          overtime: 0,
          status: "A",
          misPunch: false,
          creationDate: new Date(),
          payrollCalRoundOffOvertime: 0,
          overtimeManually: 0,
        });
        absentDays++;
        continue;
      }

      // Use "determineStatus" or a direct approach
      const { status, firstPunch, lastPunch, misPunch, totalHours } =
        determineStatus(punchesForDay, shiftHours, halfDayHours, workingHours);

      let rawOT = 0;
      if (status === "P") {
        const potentialOT = totalHours - shiftHours;
        rawOT = potentialOT > 0 ? potentialOT : 0;
      }

      const dailyRoundedOT = roundOvertime(rawOT);
      const finalOTManually = Math.min(4, dailyRoundedOT);

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
        default:
          absentDays++;
          break;
      }
      totalOvertimeHrs += dailyRoundedOT;
      totalManualOvertime += finalOTManually;
      monthlyAttendance.push({
        labourId,
        projectName,
        date: fullDate,
        firstPunch: firstPunch
          ? formatTimeToHoursMinutes(firstPunch.punch_time)
          : null,
        lastPunch: lastPunch
          ? formatTimeToHoursMinutes(lastPunch.punch_time)
          : null,
        totalHours: totalHours.toFixed(2),
        overtime: dailyRoundedOT,
        status,
        misPunch,
        creationDate: new Date(),
        payrollCalRoundOffOvertime: dailyRoundedOT,
        overtimeManually: finalOTManually,
      });
    }
    // 9c) Insert monthly summary if needed
    const summary = {
      labourId,
      projectName,
      totalDays: daysInMonth,
      presentDays,
      halfDays,
      missPunchDays,
      absentDays,
      totalOvertimeHours: parseFloat(totalOvertimeHrs.toFixed(1)),
      shift: workingHours,
      creationDate: new Date(),
      selectedMonth: `${parsedYear}-${String(parsedMonth).padStart(2, "0")}`,
      RoundOffTotalOvertime: parseFloat(totalOvertimeHrs.toFixed(1)),
      TotalOvertimeHoursManually: parseFloat(totalManualOvertime.toFixed(1)),
    };

    await insertIntoLabourAttendanceSummary(summary);
    // re-run to ensure final summary is up to date
    await insertOrUpdateLabourAttendanceSummary(labourId, date);

    // 9d) Insert the daily records (skip if they already exist)
    for (const dayAttendance of monthlyAttendance) {
      await insertIntoLabourAttendanceDetails(dayAttendance);
    }
  } catch (error) {
    console.error("Error performing upsert:", error);
    if (error.statusCode) {
      throw error;
    } else {
      const serverError = new Error(
        "Error updating attendance. Please try again later."
      );
      serverError.statusCode = 500;
      throw serverError;
    }
  }
}

async function LabourAttendanceApprovalModel() {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
            SELECT 
    L.*,
    CASE 
        WHEN EXISTS (
            SELECT 1 
            FROM [FinalizedSalaryPay] F
            WHERE F.LabourID = L.LabourId
              AND F.month = MONTH(L.[Date])
              AND F.year = YEAR(L.[Date])
        )
        THEN 'true'
        ELSE 'false'
    END AS IsApproveDisable
FROM [LabourAttendanceApproval] L order by L.LastUpdatedDate desc;
        `);

    // return result.recordset;
    const parsedRecordset = result.recordset.map((record) => {
      let updatedFields = [];

      try {
        if (record.UpdatedFields) {
          updatedFields = JSON.parse(record.UpdatedFields);
        }
      } catch (err) {
        console.warn(
          "Failed to parse UpdatedFields for record:",
          record.LabourId,
          err
        );
      }

      return {
        ...record,
        UpdatedFields: updatedFields,
      };
    });
    console.log("parsedRecordset===>", parsedRecordset);
    return parsedRecordset;
  } catch (error) {
    console.error("Error fetching attendance Approval:", error);
    throw error;
  }
}

async function rejectAttendance(id, rejectReason) {
  try {
    const pool = await poolPromise;

    const existingRecord = await pool.request().input("id", sql.Int, id).query(`
                SELECT *
                FROM [dbo].[LabourAttendanceDetails]
                WHERE AttendanceId = @id
            `);

    if (existingRecord.recordset.length === 0) {
      return false; // Record not found
    }

    const { ApprovalStatus } = existingRecord.recordset[0];
    if (ApprovalStatus === "Rejected") {
      throw new Error("Attendance is already rejected.");
    }

    await pool
      .request()
      .input("id", sql.Int, id)
      .input("rejectReason", sql.NVarChar, rejectReason).query(`
            UPDATE LabourAttendanceApproval
            SET ApprovalStatus = 'Rejected',
                RejectedDate = GETDATE(),
                RejectAttendanceReason = @rejectReason
            WHERE AttendanceId = @id
        `);

    await pool
      .request()
      .input("id", sql.Int, id)
      .input("rejectReason", sql.NVarChar, rejectReason).query(`
                UPDATE [dbo].[LabourAttendanceDetails]
                SET RejectAttendanceReason = @rejectReason,
                    ApprovalStatus = 'Rejected',
                    LastUpdatedDate = GETDATE()
                WHERE AttendanceId = @id
            `);

    return true; // Success
  } catch (error) {
    console.error("Error rejecting attendance:", error);
    throw new Error("Error rejecting attendance.");
  }
}

async function getAttendanceByDateRange(
  projectNameStr,
  startDate,
  endDate,
  departmentStr
) {
  const pool = await poolPromise;

  if (!projectNameStr || !startDate || !endDate) {
    throw new Error("Missing required parameters.");
  }

  const projectNames = projectNameStr
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p); // remove empty entries

  if (projectNames.length === 0) {
    return []; // nothing to query
  }

  const request = pool.request();

  const projectPlaceholders = projectNames.map((_, i) => `@pn${i}`).join(",");
  projectNames.forEach((name, i) => {
    request.input(`pn${i}`, sql.VarChar, name);
  });

  request.input("startDate", sql.Date, startDate);
  request.input("endDate", sql.Date, endDate);

  let departmentFilterClause = "";
  if (departmentStr && departmentStr.trim()) {
    const departmentIds = departmentStr
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);
    const departmentPlaceholders = departmentIds
      .map((_, i) => `@dep${i}`)
      .join(",");
    departmentIds.forEach((id, i) => {
      request.input(`dep${i}`, sql.VarChar, id);
    });
    departmentFilterClause = `AND lo.department IN (${departmentPlaceholders})`;
  }

  const query = `
        SELECT 
            lad.AttendanceId, 
            lad.LabourId, 
            lad.Date, 
            lad.ProjectName, 
            lo.BusinessUnit,
            lo.name,
            lo.departmentName,
            lad.Status,
            lad.FirstPunchManually, 
            lad.LastPunchManually, 
            lad.OvertimeManually, 
            lad.RemarkManually
        FROM 
            LabourAttendanceDetails lad WITH (NOLOCK)
        INNER JOIN 
            labourOnboarding lo WITH (NOLOCK) 
            ON lad.LabourId = lo.LabourId
        WHERE 
            lad.ProjectName IN (${projectPlaceholders})
            AND lad.Date BETWEEN @startDate AND @endDate
            ${departmentFilterClause} order by lad.LabourId asc
    `;

  const result = await request.query(query);
  return result.recordset;
}

async function getMatchedRows(data) {
  const pool = await poolPromise;
  const matchedRows = [];
  const unmatchedRows = [];

  for (const row of data) {
    const result = await pool
      .request()
      .input("AttendanceId", sql.Int, row.AttendanceId)
      .input("LabourId", sql.VarChar(50), row.LabourId)
      .input("Date", sql.Date, row.Date)
      .query(
        `SELECT AttendanceId, LabourId, Date 
           FROM LabourAttendanceDetails
           WHERE AttendanceId = @AttendanceId AND LabourId = @LabourId AND Date = @Date`
      );

    if (result.recordset.length > 0) {
      matchedRows.push(row);
    } else {
      //console.log(`Row unmatched:`, row);
      unmatchedRows.push(row);
    }
  }

  return { matchedRows, unmatchedRows };
}

async function updateMatchedRows(data) {
  const pool = await poolPromise;

  for (const row of data) {
    await pool
      .request()
      .input("AttendanceId", sql.Int, row.AttendanceId)
      .input("LabourId", sql.VarChar(50), row.LabourId)
      .input("Date", sql.Date, row.Date)
      .input(
        "FirstPunchManually",
        sql.NVarChar(255),
        row.FirstPunchManually || null
      )
      .input(
        "LastPunchManually",
        sql.NVarChar(255),
        row.LastPunchManually || null
      )
      .input(
        "OvertimeManually",
        sql.Decimal(18, 2),
        row.OvertimeManually || null
      )
      .input("RemarkManually", sql.NVarChar(255), row.RemarkManually || null)
      .query(
        `UPDATE LabourAttendanceDetails
           SET FirstPunchManually = @FirstPunchManually,
               LastPunchManually = @LastPunchManually,
               OvertimeManually = @OvertimeManually,
               RemarkManually = @RemarkManually
           WHERE AttendanceId = @AttendanceId AND LabourId = @LabourId AND Date = @Date`
      );
  }
}

async function insertUnmatchedRows(data) {
  const pool = await poolPromise;
  const table = new sql.Table("LabourAttendanceDetails");
  table.columns.add("AttendanceId", sql.Int);
  table.columns.add("LabourId", sql.VarChar(50));
  table.columns.add("Date", sql.Date);
  table.columns.add("FirstPunchManually", sql.NVarChar(255));
  table.columns.add("LastPunchManually", sql.NVarChar(255));
  table.columns.add("OvertimeManually", sql.Decimal(18, 2));
  table.columns.add("RemarkManually", sql.NVarChar(255));

  data.forEach((row) => {
    table.rows.add(
      row.AttendanceId,
      row.LabourId,
      row.Date,
      row.FirstPunchManually || null,
      row.LastPunchManually || null,
      row.OvertimeManually || null,
      row.RemarkManually || null
    );
    //console.log(`Row to insert:`, row);
  });

  await pool.request().bulk(table);
  //console.log(`All unmatched rows inserted.`);
}

async function updateTotalOvertimeHours(labourId, selectedMonth) {
  try {
    const pool = await poolPromise;
    // Sum the OvertimeManually values for the given labour and month
    const overtimeResult = await pool
      .request()
      .input("LabourId", sql.VarChar(50), labourId)
      .input("SelectedMonth", sql.VarChar, selectedMonth) // e.g., '2024-08'
      .query(`
          SELECT SUM(OvertimeManually) AS TotalOvertime
          FROM LabourAttendanceDetails
          WHERE LabourId = @LabourId 
            AND CONVERT(varchar(7), Date, 120) = @SelectedMonth
        `);

    const totalOvertime = overtimeResult.recordset[0].TotalOvertime || 0;

    // Update LabourAttendanceSummary with the computed overtime total
    await pool
      .request()
      .input("LabourId", sql.VarChar(50), labourId)
      .input("SelectedMonth", sql.VarChar, selectedMonth)
      .input("TotalOvertimeHours", sql.Float, totalOvertime).query(`
          UPDATE LabourAttendanceSummary
          SET TotalOvertimeHoursManually = @TotalOvertimeHours
          WHERE LabourId = @LabourId AND SelectedMonth = @SelectedMonth
        `);

    return totalOvertime;
  } catch (error) {
    console.error("Error updating TotalOvertimeHours:", error);
    throw error;
  }
}

const getLabourMonthlyWages = async () => {
  const pool = await poolPromise;
  const result = await pool.request().query(`
        SELECT 
            lmw.WageID, lmw.LabourID, lmw.WagesEditedBy, lmw.PayStructure,
            lmw.DailyWages, lmw.PerHourWages, lmw.MonthlyWages, lmw.YearlyWages,
            lmw.FromDate, lmw.EffectiveDate, lmw.CreatedAt, lo.Name, lo.Location, lo.Department
        FROM LabourMonthlyWages lmw
        JOIN labourOnboarding lo ON lmw.LabourID = lo.id
    `);
  return result.recordset;
};

const parseDDMMYYYYtoDate = (dateStr) => {
  if (!dateStr || typeof dateStr !== "string") return null;

  const parts = dateStr.split("-");
  if (parts.length !== 3)
    throw new Error(`Invalid date format for effectiveDate: ${dateStr}`);

  const [day, month, year] = parts;
  return new Date(`${year}-${month}-${day}`); // Returns JS Date object
};

// Add or update wages
const upsertLabourMonthlyWages = async (wage) => {
  try {
    const pool = await poolPromise;
    console.log("object wages--->", wage);
    // Check if LabourID exists in LabourMonthlyWages
    const checkExistingWage = await pool
      .request()
      .input("LabourID", sql.NVarChar, wage.labourId || "").query(`
              SELECT LabourID, ApprovalStatusWages
                FROM LabourMonthlyWages
                WHERE LabourID = @LabourID and ApprovalStatusWages = 'Pending'
            `);

    if (checkExistingWage.recordset.length > 0) {
      const existingWage = checkExistingWage.recordset[0];
      return {
        success: false,
        message: `LabourID ${wage.labourId} already has a pending approval in Labour Monthly Wages`,
      };
    }

    // Fetch existing Labour details from labourOnboarding table
    const onboardingResult = await pool
      .request()
      .input("LabourID", sql.NVarChar, wage.labourId || "").query(`
                SELECT LabourID, name, projectName, companyName, From_Date, businessUnit, departmentName
                FROM [dbo].[labourOnboarding]
                WHERE LabourID = @LabourID
            `);

    // Check if LabourID exists in labourOnboarding
    if (
      !onboardingResult ||
      !onboardingResult.recordset ||
      onboardingResult.recordset.length === 0
    ) {
      throw new Error(
        `LabourID ${wage.labourId} not found in labourOnboarding table`
      );
    }
    const labourDetails = onboardingResult.recordset[0];
    const effectiveDateParsed = wage.effectiveDate
      ? parseDDMMYYYYtoDate(wage.effectiveDate)
      : null;

    // UPSERT Query with OUTPUT to return WageID
    const query = `
            INSERT INTO LabourMonthlyWages 
            (LabourID, PayStructure, DailyWages, PerHourWages, MonthlyWages, YearlyWages, FixedMonthlyWages, WeeklyOff, 
             WagesEditedBy, name, projectName, companyName, From_Date, businessUnit, departmentName, FromDate, EffectiveDate, CreatedAt)
            OUTPUT INSERTED.WageID
            VALUES 
            (@LabourID, @PayStructure, @DailyWages, @PerHourWages, @MonthlyWages, @YearlyWages, 
             CASE WHEN @PayStructure = 'FIXED MONTHLY WAGES' THEN @FixedMonthlyWages ELSE NULL END,
             CASE WHEN @PayStructure = 'FIXED MONTHLY WAGES' THEN @WeeklyOff ELSE NULL END,
             @WagesEditedBy, @name, @projectName, @companyName, @From_Date, @businessUnit, @departmentName, 
             GETDATE(), @EffectiveDate, GETDATE());
        `;

    // Execute Query
    const insertResult = await pool
      .request()
      .input("LabourID", sql.NVarChar, wage.labourId || "")
      .input("PayStructure", sql.NVarChar, wage.payStructure || null)
      .input("DailyWages", sql.Float, wage.dailyWages || 0)
      .input(
        "PerHourWages",
        sql.Float,
        wage.dailyWages ? wage.dailyWages / 8 : 0
      )
      .input("MonthlyWages", sql.Float, wage.monthlyWages || 0)
      .input("YearlyWages", sql.Float, wage.yearlyWages || 0)
      .input("FixedMonthlyWages", sql.Float, wage.fixedMonthlyWages || null)
      .input(
        "WeeklyOff",
        sql.Int,
        wage.weeklyOff ? parseInt(wage.weeklyOff, 10) : null
      )
      .input("WagesEditedBy", sql.NVarChar, wage.wagesEditedBy || "System")
      .input("name", sql.NVarChar, labourDetails.name || "")
      .input("projectName", sql.Int, labourDetails.projectName || "") // Fixed type issue
      .input("companyName", sql.NVarChar, labourDetails.companyName || "")
      .input("From_Date", sql.Date, labourDetails.From_Date || null)
      .input("businessUnit", sql.NVarChar, labourDetails.businessUnit || "")
      .input("departmentName", sql.NVarChar, labourDetails.departmentName || "")
      .input("EffectiveDate", sql.Date, effectiveDateParsed)
      .query(query);

    // Check if insertResult is valid
    if (
      !insertResult ||
      !insertResult.recordset ||
      insertResult.recordset.length === 0
    ) {
      throw new Error("Failed to retrieve WageID after inserting");
    }

    return insertResult.recordset[0]; // Return the inserted WageID
  } catch (error) {
    console.error("Error in upsertLabourMonthlyWages:", error.message);
    throw new Error(`Failed to upsert wages: ${error.message}`);
  }
};

// Fetch all approvals
const getWagesAdminApprovals = async () => {
  const pool = await poolPromise;
  const result = await pool.request().query(`SELECT 
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
FROM [WagesAdminApprovals] W order by W.CreatedAt desc;
`);
  return result.recordset;
};

const checkExistingWages = async (labourId) => {
  const pool = await poolPromise;

  const result = await pool.request().input("LabourID", sql.NVarChar, labourId)
    .query(`
            SELECT TOP 1 *
            FROM LabourMonthlyWages
            WHERE LabourID = @LabourID
            ORDER BY EffectiveDate DESC
        `);

  return result.recordset[0] || null;
};

// Send wages for admin approval
async function markWagesForApproval(
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
) {
  try {
    const pool = await poolPromise;
    const getNameResult = await pool
      .request()
      .input("LabourID", sql.NVarChar(50), labourId).query(`
            SELECT name
            FROM [dbo].[labourOnboarding]
            WHERE LabourID = @LabourID
        `);

    const labourName =
      getNameResult.recordset.length > 0
        ? getNameResult.recordset[0].name
        : null;
    const request = pool.request();
    console.log("effectiveDate", effectiveDate);
    const perHourWages = dailyWages ? dailyWages / 8 : 0;
    const effectiveDateOnly = effectiveDate ? new Date(effectiveDate) : null;
    console.log("effectiveDateOnly", effectiveDateOnly);
    request.input("WageID", sql.Int, wageId);
    request.input("LabourID", sql.NVarChar, labourId);
    request.input("DailyWages", sql.Float, dailyWages || null);
    request.input("MonthlyWages", sql.Float, monthlyWages || null);
    request.input("PerHourWages", sql.Float, perHourWages);
    request.input("YearlyWages", sql.Float, yearlyWages || null);
    request.input("EffectiveDate", sql.Date, effectiveDate);
    request.input("FixedMonthlyWages", sql.Float, fixedMonthlyWages || null);
    request.input("WeeklyOff", sql.Int, weeklyOff || null);
    request.input("PayStructure", sql.NVarChar, payStructure || null);
    request.input("WagesEditedBy", sql.VarChar, wagesEditedBy || null);
    request.input("Remarks", sql.NVarChar, remarks || null);
    request.input("name", sql.NVarChar, labourName || null);

    // Update the LabourMonthlyWages table
    const updateResult = await request.query(`
            UPDATE [LabourMonthlyWages]
            SET ApprovalStatusWages = 'Pending',
                WagesEditedBy = @WagesEditedBy,
                EditDate = GETDATE()
            WHERE WageID = @WageID
        `);

    if (updateResult.rowsAffected[0] === 0) {
      throw new Error(
        "Failed to update LabourMonthlyWages. WageID may not exist."
      );
    }

    // Insert into the WagesAdminApprovals table
    await request.query(`
            INSERT INTO [WagesAdminApprovals] (
                WageID, LabourID, DailyWages, MonthlyWages, FixedMonthlyWages, PerHourWages, YearlyWages, EffectiveDate,
                WeeklyOff, PayStructure, WagesEditedBy, ApprovalStatus, Remarks, CreatedAt, name
            )
            VALUES (
                @WageID, @LabourID, @DailyWages, @MonthlyWages, @FixedMonthlyWages, @PerHourWages, @YearlyWages, @EffectiveDate,
                @WeeklyOff, @PayStructure, @WagesEditedBy, 'Pending', @Remarks, GETDATE(), @name
            )
        `);

    //console.log('Wages marked for admin approval.');
    return { success: true, message: "Wages marked for admin approval." };
  } catch (error) {
    console.error("Error marking wages for approval:", error.message || error);
    throw new Error(error.message || "Error marking wages for approval.");
  }
}

async function approveWages(ApprovalID) {
  try {
    const pool = await poolPromise;
    // console.log('approvalWages ID in model.js:', ApprovalID);

    // Fetch the approval record
    const approvalResult = await pool
      .request()
      .input("ApprovalID", sql.Int, ApprovalID).query(`
                SELECT * FROM [WagesAdminApprovals]
                WHERE ApprovalID = @ApprovalID
            `);

    if (approvalResult.recordset.length === 0) {
      throw new Error("Approval record not found.");
    }

    const approvalData = approvalResult.recordset[0];
    // console.log('approvalData:', approvalData);

    // Approve in LabourMonthlyWages
    await pool
      .request()
      .input("WageID", sql.Int, approvalData.WageID)
      .input("isApprovalDoneAdmin", sql.Bit, 1)
      .input("DailyWages", sql.Float, approvalData.DailyWages || null)
      .input("MonthlyWages", sql.Float, approvalData.MonthlyWages || null)
      .input("PerHourWages", sql.Float, approvalData.PerHourWages || null)
      .input("EffectiveDate", sql.Date, approvalData.EffectiveDate || null)
      .input("Remarks", sql.NVarChar, approvalData.Remarks || null).query(`
            UPDATE [LabourMonthlyWages]
            SET ApprovalStatusWages = 'Approved',
                isApprovalDoneAdmin = @isApprovalDoneAdmin,
                DailyWages = @DailyWages,
                MonthlyWages = @MonthlyWages,
                PerHourWages = @PerHourWages,
                EffectiveDate = @EffectiveDate,
                Remarks = @Remarks,
                ApprovalDate = GETDATE()
            WHERE WageID = @WageID
        `);

    // Update WagesAdminApprovals
    await pool.request().input("ApprovalID", sql.Int, ApprovalID).query(`
                UPDATE [WagesAdminApprovals]
                SET ApprovalStatusWages = 'Approved',
                ApprovalStatus = 'Approved',
                    ApprovalDate = GETDATE()
                WHERE ApprovalID = @ApprovalID
            `);

    // console.log('Wages approved successfully.');
    return { success: true, message: "Wages approved successfully." };
  } catch (error) {
    console.error("Error approving wages:", error);
    throw new Error("Error approving wages.");
  }
}

async function rejectWages(ApprovalID, Remarks) {
  try {
    const pool = await poolPromise;
    //console.log('Rejecting wages with ApprovalID:', ApprovalID, 'and Remarks:', Remarks);

    // Fetch the approval record
    const approvalResult = await pool
      .request()
      .input("ApprovalID", sql.Int, ApprovalID).query(`
                SELECT * FROM [WagesAdminApprovals]
                WHERE ApprovalID = @ApprovalID
            `);

    if (approvalResult.recordset.length === 0) {
      throw new Error("Approval record not found.");
    }

    const approvalData = approvalResult.recordset[0];

    // Reject in LabourMonthlyWages
    await pool
      .request()
      .input("WageID", sql.Int, approvalData.WageID)
      .input("Remarks", sql.NVarChar, Remarks || null) // Allow null if no Remarks provided
      .input("isApprovalReject", sql.Bit, 1).query(`
                UPDATE [LabourMonthlyWages]
                SET ApprovalStatusWages = 'Rejected',
                    Remarks = @Remarks,
                    isApprovalReject = @isApprovalReject,
                    PayStructure = NULL,
                    DailyWages = NULL,
                    PerHourWages = NULL,
                    MonthlyWages = NULL,
                    YearlyWages = NULL,
                    WeeklyOff = NULL,
                    EffectiveDate = NULL,
                    FixedMonthlyWages = NULL
                WHERE WageID = @WageID
            `);

    // Update WagesAdminApprovals
    await pool
      .request()
      .input("ApprovalID", sql.Int, ApprovalID)
      .input("Remarks", sql.NVarChar, Remarks || null).query(`
                UPDATE [WagesAdminApprovals]
                SET ApprovalStatusWages = 'Rejected',
                 ApprovalStatus = 'Rejected',
                    RejectionDate = GETDATE(),
                    Remarks = @Remarks
                WHERE ApprovalID = @ApprovalID
            `);

    //console.log('Wages rejected successfully.');
    return { success: true, message: "Wages rejected successfully." };
  } catch (error) {
    console.error("Error rejecting wages:", error);
    throw new Error("Error rejecting wages.");
  }
}

// Add an approval
const addWageApproval = async (approval) => {
  const pool = await poolPromise;
  await pool
    .request()
    .input("WageID", sql.Int, approval.wageId)
    .input("AdminID", sql.Int, approval.adminId)
    .input("ApprovalStatus", sql.NVarChar, approval.approvalStatus)
    .input("WagesEditedBy", sql.NVarChar, approval.wagesEditedBy)
    .input("Remarks", sql.NVarChar, approval.remarks).query(`
            INSERT INTO WagesAdminApprovals (WageID, AdminID, ApprovalStatus, WagesEditedBy, ApprovalDate, Remarks)
            VALUES (@WageID, @AdminID, @ApprovalStatus, @WagesEditedBy, GETDATE(), @Remarks)
        `);
};

async function getWagesByDateRange(
  projectName,
  payStructure,
  startDate,
  endDate
) {
  const pool = await poolPromise;

  let query = `
      WITH LatestWages AS (
        SELECT 
          onboarding.LabourID,
          onboarding.name,
          onboarding.projectName,
          onboarding.companyName,
          onboarding.From_Date,
          onboarding.businessUnit,
          onboarding.departmentName,
          wages.PayStructure,
          wages.DailyWages,
          wages.WeeklyOff,
          wages.FixedMonthlyWages,
          wages.EffectiveDate,
          wages.CreatedAt,
          ROW_NUMBER() OVER (PARTITION BY onboarding.LabourID ORDER BY wages.CreatedAt DESC) AS RowNum
        FROM 
          [dbo].[labourOnboarding] AS onboarding
        LEFT JOIN 
          [dbo].[LabourMonthlyWages] AS wages
        ON 
          onboarding.LabourID = wages.LabourID
          AND wages.CreatedAt BETWEEN @startDate AND @endDate
          AND (@payStructure IS NULL OR wages.PayStructure = @payStructure)
    `;

  // If projectName is not "all", add an IN clause for multiple project IDs.
  if (projectName !== "all") {
    const projectIds = projectName.split(",").map((id) => id.trim());
    const placeholders = projectIds
      .map((_, index) => `@projectName${index}`)
      .join(", ");
    query += ` AND wages.ProjectName IN (${placeholders})`;
  }

  query += `
        WHERE 
          onboarding.status IN ('Approved', 'Disable')
      )
      SELECT 
        LabourID,
        name,
        projectName,
        companyName,
        From_Date,
        businessUnit,
        departmentName,
        PayStructure,
        DailyWages,
        WeeklyOff,
        FixedMonthlyWages,
        EffectiveDate,
        CreatedAt
      FROM LatestWages
      WHERE RowNum = 1
    `;

  const request = pool.request();

  // Bind each project ID if needed.
  if (projectName !== "all") {
    const projectIds = projectName.split(",").map((id) => id.trim());
    projectIds.forEach((id, index) => {
      request.input(`projectName${index}`, sql.Int, parseInt(id, 10));
    });
  }

  // Bind other parameters.
  request.input("payStructure", sql.VarChar, payStructure || null);
  if (startDate && endDate) {
    request.input("startDate", sql.Date, startDate);
    request.input("endDate", sql.Date, endDate);
  }

  const result = await request.query(query);
  return result.recordset;
}

async function insertWagesData(row) {
  const pool = await poolPromise;

  // Convert Excel date to JavaScript date or handle as null
  let fromDate = null;
  if (row.From_Date) {
    const dateObj = new Date(row.From_Date);
    if (!isNaN(dateObj)) {
      fromDate = dateObj.toISOString().split("T")[0]; // YYYY-MM-DD
    } else {
      throw new Error(`Invalid From_Date value: ${row.From_Date}`);
    }
  }

  // Handle EffectiveDate
  let effectiveDate = null;
  if (row.EffectiveDate) {
    if (typeof row.EffectiveDate === "number") {
      const excelDate = new Date((row.EffectiveDate - 25569) * 86400 * 1000);
      effectiveDate = excelDate.toISOString().split("T")[0];
    } else if (typeof row.EffectiveDate === "string") {
      const parts = row.EffectiveDate.split("-");
      if (parts.length === 3) {
        const [day, month, year] = parts.map((p) => parseInt(p, 10));
        if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
          effectiveDate = new Date(year, month - 1, day)
            .toISOString()
            .split("T")[0];
        } else {
          throw new Error(`Invalid EffectiveDate format: ${row.EffectiveDate}`);
        }
      } else {
        throw new Error(`Invalid EffectiveDate format: ${row.EffectiveDate}`);
      }
    } else {
      throw new Error(
        `Unexpected EffectiveDate type: ${typeof row.EffectiveDate}`
      );
    }
  }

  // Validate PayStructure
  const validPayStructures = ["DAILY WAGES", "FIXED MONTHLY WAGES"];
  if (!row.PayStructure || !validPayStructures.includes(row.PayStructure)) {
    throw new Error(`Invalid PayStructure value: ${row.PayStructure}`);
  }

  // No WeeklyOff for DAILY WAGES
  if (row.PayStructure === "DAILY WAGES" && row.WeeklyOff) {
    throw new Error("Cannot have WeeklyOff for DAILY WAGES PayStructure");
  }

  // Validate WeeklyOff for FIXED MONTHLY WAGES
  let weeklyOffValue = null;
  if (row.PayStructure === "FIXED MONTHLY WAGES") {
    if (row.WeeklyOff == null || row.WeeklyOff === "") {
      throw new Error("WeeklyOff is required for FIXED MONTHLY WAGES");
    }
    if (!/^[0-4]$/.test(row.WeeklyOff)) {
      throw new Error(
        "WeeklyOff must be an integer between 0 and 4 (inclusive)"
      );
    }
    weeklyOffValue = parseInt(row.WeeklyOff, 10);
  }

  // Fetch working hours for the LabourID
  const result = await pool
    .request()
    .input("LabourID", sql.VarChar, row.LabourID).query(`
            SELECT LabourID AS labourId, workingHours 
            FROM [dbo].[labourOnboarding] 
            WHERE LabourID = @LabourID
        `);

  if (result.recordset.length === 0) {
    throw new Error(
      `LabourID ${row.LabourID} not found in labourOnboarding table`
    );
  }

  const workingHours = result.recordset[0].workingHours;
  let hoursPerDay;
  if (workingHours === "FLEXI SHIFT - 9 HRS") {
    hoursPerDay = 9;
  } else if (workingHours === "FLEXI SHIFT - 8 HRS") {
    hoursPerDay = 8;
  } else {
    throw new Error(`Invalid workingHours value: ${workingHours}`);
  }

  // Calculate wage-related fields
  let dailyWages = null;
  let perHourWages = null;
  let monthlyWages = null;
  let yearlyWages = null;
  let fixedMonthlyWages = null;

  if (row.PayStructure === "DAILY WAGES") {
    dailyWages = parseFloat(row.DailyWages);
    if (isNaN(dailyWages)) {
      throw new Error(`Invalid DailyWages value: ${row.DailyWages}`);
    }
    perHourWages = dailyWages / hoursPerDay;
    monthlyWages = dailyWages * 26;
    yearlyWages = monthlyWages * 12;
  } else if (row.PayStructure === "FIXED MONTHLY WAGES") {
    fixedMonthlyWages = parseFloat(row.FixedMonthlyWages) || 0;
  }

  // Check for existing pending entry
  const existingPending = await pool
    .request()
    .input("LabourID", sql.VarChar, row.LabourID).query(`
            SELECT WageID 
            FROM [dbo].[LabourMonthlyWages] 
            WHERE LabourID = @LabourID AND ApprovalStatusWages = 'Pending'
        `);

  if (existingPending.recordset.length > 0) {
    throw new Error(
      `Wage entry with 'Pending' approval already exists for LabourID ${row.LabourID}`
    );
  }

  // Insert data
  const request = pool.request();
  request.input("LabourID", sql.VarChar, row.LabourID);
  request.input("WagesEditedBy", sql.VarChar, row.WagesEditedBy || "System");
  request.input("name", sql.VarChar, row.name);
  request.input("projectName", sql.Int, row.projectName);
  request.input("companyName", sql.VarChar, row.companyName);
  request.input("From_Date", sql.Date, fromDate);
  request.input("businessUnit", sql.VarChar, row.businessUnit);
  request.input("departmentName", sql.VarChar, row.departmentName);
  request.input("PayStructure", sql.VarChar, row.PayStructure);
  request.input("DailyWages", sql.Decimal, dailyWages);
  request.input("PerHourWages", sql.Decimal, perHourWages);
  request.input("MonthlyWages", sql.Decimal, monthlyWages);
  request.input("YearlyWages", sql.Decimal, yearlyWages);
  request.input("FixedMonthlyWages", sql.Decimal, fixedMonthlyWages);
  request.input(
    "WeeklyOff",
    sql.Int,
    Number.isNaN(weeklyOffValue) ? null : weeklyOffValue
  );
  request.input("EffectiveDate", sql.Date, effectiveDate);
  request.input("CreatedAt", sql.DateTime, new Date());
  request.input("isApprovalSendAdmin", sql.Bit, 1);
  request.input("accountNumber", sql.VarChar, row.accountNumber);

  const insertResult = await request.query(`
        INSERT INTO [dbo].[LabourMonthlyWages] 
        (LabourID, WagesEditedBy, name, projectName, companyName, From_Date, businessUnit, departmentName, PayStructure, DailyWages, PerHourWages, MonthlyWages, YearlyWages, FixedMonthlyWages, WeeklyOff, EffectiveDate, CreatedAt, isApprovalSendAdmin, accountNumber)
        OUTPUT INSERTED.WageID
        VALUES (@LabourID, @WagesEditedBy, @name, @projectName, @companyName, @From_Date, @businessUnit, @departmentName, @PayStructure, @DailyWages, @PerHourWages, @MonthlyWages, @YearlyWages, @FixedMonthlyWages, @WeeklyOff, @EffectiveDate, @CreatedAt, @isApprovalSendAdmin, @accountNumber)
    `);

  const WageID = insertResult.recordset[0].WageID;

  // Concurrent update and approval insert
  const updatePromise = pool.request().input("WageID", sql.Int, WageID).query(`
            UPDATE [dbo].[LabourMonthlyWages]
            SET ApprovalStatusWages = 'Pending',
                EditDate = GETDATE()
            WHERE WageID = @WageID
        `);

  const approvalPromise = pool
    .request()
    .input("WageID", sql.Int, WageID)
    .input("LabourID", sql.VarChar, row.LabourID)
    .input("name", sql.VarChar, row.name)
    .input("DailyWages", sql.Decimal, dailyWages)
    .input("MonthlyWages", sql.Decimal, monthlyWages)
    .input("FixedMonthlyWages", sql.Decimal, fixedMonthlyWages)
    .input("PerHourWages", sql.Decimal, perHourWages)
    .input("YearlyWages", sql.Decimal, yearlyWages)
    .input("EffectiveDate", sql.Date, effectiveDate)
    .input(
      "WeeklyOff",
      sql.Int,
      Number.isNaN(weeklyOffValue) ? null : weeklyOffValue
    )
    .input("PayStructure", sql.VarChar, row.PayStructure)
    .input("WagesEditedBy", sql.VarChar, row.WagesEditedBy || "System").query(`
            INSERT INTO [dbo].[WagesAdminApprovals] (
                WageID, LabourID, name, DailyWages, MonthlyWages, FixedMonthlyWages, PerHourWages, YearlyWages, EffectiveDate,
                WeeklyOff, PayStructure, WagesEditedBy, ApprovalStatus, Remarks, CreatedAt
            )
            VALUES (
                @WageID, @LabourID, @name, @DailyWages, @MonthlyWages, @FixedMonthlyWages, @PerHourWages, @YearlyWages, @EffectiveDate,
                @WeeklyOff, @PayStructure, @WagesEditedBy, 'Pending', '', GETDATE()
            )
        `);

  await Promise.all([updatePromise, approvalPromise]);

  return {
    success: true,
    LabourID: row.LabourID,
    WageID,
    message: "Wages inserted and sent for approval.",
  };
}

const getWagesAndLabourOnboardingJoin = async (filters = {}) => {
  const pool = await poolPromise;
  const request = pool.request();

  // Build OUTER APPLY filter for PayStructure if it exists
  const payStructureFilter = filters.PayStructure
    ? "AND R.PayStructure = @PayStructure"
    : "";

  let query = `
      WITH RankedWages AS (
        SELECT 
          *,
          ROW_NUMBER() OVER (PARTITION BY LabourID ORDER BY CreatedAt DESC) AS rn
        FROM [dbo].[LabourMonthlyWages]
      ),
      RankedOnboarding AS (
        SELECT 
          *,
          ROW_NUMBER() OVER (
              PARTITION BY LabourID 
              ORDER BY 
                  CASE WHEN status = 'Approved' THEN 1 
                       WHEN status = 'Disable' THEN 2 
                       ELSE 3 
                  END,
                  LabourID DESC
          ) AS rn
        FROM [dbo].[labourOnboarding]
        WHERE status IN ('Approved', 'Disable')
      )
      SELECT 
        onboarding.LabourID,
        onboarding.name,
        onboarding.businessUnit,
        onboarding.departmentName,
        onboarding.workingHours,
        onboarding.From_Date,
        onboarding.projectName AS ProjectID,
        onboarding.department AS DepartmentID,
        wages.WagesEditedBy,
        wages.PayStructure,
        wages.DailyWages,
        wages.PerHourWages,
        wages.MonthlyWages,
        wages.YearlyWages,
        wages.WeeklyOff,
        wages.CreatedAt,
        wages.FixedMonthlyWages,
        wages.EffectiveDate,
        wages.ApprovalStatusWages
      FROM RankedOnboarding AS onboarding
      OUTER APPLY (
        SELECT TOP 1 *
        FROM RankedWages R
        WHERE R.LabourID = onboarding.LabourID
        ${payStructureFilter}
        ORDER BY 
          CASE 
            WHEN R.ApprovalStatusWages = 'Approved' THEN 1 
            WHEN R.ApprovalStatusWages = 'Pending' THEN 2
            ELSE 3 
          END,
          R.CreatedAt DESC
      ) AS wages
      WHERE onboarding.rn = 1
    `;

  // 🔵 Apply ProjectID filter
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

  // 🔵 Apply DepartmentID filter
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

  // 🔵 Apply PayStructure filter
  if (filters.PayStructure) {
    request.input("PayStructure", filters.PayStructure);
    query += ` AND wages.PayStructure = @PayStructure`;
  }

  const result = await request.query(query);
  return result.recordset;
};

const getAttendanceReportAAndLabourOnboardingJoin = async (filters = {}) => {
  const pool = await poolPromise;
  const request = pool.request();

  let query = `
         WITH RankedAttendance AS (
            SELECT 
                *,
                ROW_NUMBER() OVER (PARTITION BY LabourID ORDER BY LabourId DESC) AS rn
            FROM [dbo].[LabourAttendanceSummary]
        )
        SELECT 
            onboarding.LabourID,
            onboarding.name,
            onboarding.businessUnit,
            onboarding.departmentName,
            onboarding.workingHours,
            onboarding.From_Date,
            onboarding.projectName,
            onboarding.department,
            attendance.TotalDays,
            attendance.PresentDays,
            attendance.HalfDays,
            attendance.AbsentDays,
            attendance.TotalOvertimeHours,
            attendance.Shift,
            attendance.CreationDate,
            attendance.SelectedMonth,
            attendance.MissPunchDays,
            attendance.RoundOffTotalOvertime,
            attendance.PayrollCalRoundoffTotalOvertime
        FROM [dbo].[labourOnboarding] AS onboarding
        OUTER APPLY (
            SELECT TOP 1 *
            FROM RankedAttendance R
            WHERE R.LabourID = onboarding.LabourID AND R.rn = 1
        ) AS attendance
        WHERE onboarding.status IN ('Approved', 'Disable')
    `;

  // 🔍 Filter by ProjectID
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

  // 🔍 Filter by DepartmentID
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
  console.log("resultresultresult--", result.recordset); // Debugging log to check the result
  return result.recordset;
};

async function searchFromWages(query) {
  try {
    const pool = await poolPromise;
    const isLabourID = /^[A-Za-z]+\d+$/.test(query.trim());

    let searchQuery = `WITH LatestWages AS (
            SELECT 
                w.LabourID, w.From_Date, w.WagesEditedBy, w.PayStructure,
                w.DailyWages, w.PerHourWages, w.MonthlyWages, w.YearlyWages,
                w.WeeklyOff, w.CreatedAt, w.FixedMonthlyWages, w.EffectiveDate, w.ApprovalStatusWages,
                ROW_NUMBER() OVER (PARTITION BY w.LabourID ORDER BY w.CreatedAt DESC) AS rn
            FROM LabourMonthlyWages w
        )
        SELECT ${isLabourID ? "TOP (1)" : ""}
            l.id, l.aadhaarNumber, l.name, l.projectName AS ProjectID,
            l.labourCategory, l.department AS DepartmentID, l.departmentName,
            l.LabourID, l.companyName, l.OnboardName, l.workingHours, l.businessUnit,
            l.designation, l.location, lw.From_Date, lw.WagesEditedBy, lw.PayStructure,
            lw.DailyWages, lw.PerHourWages, lw.MonthlyWages, lw.YearlyWages, lw.WeeklyOff,
            lw.CreatedAt, lw.FixedMonthlyWages, lw.EffectiveDate, lw.ApprovalStatusWages
        FROM labourOnboarding l
        LEFT JOIN LatestWages lw ON l.LabourID = lw.LabourID AND lw.rn = 1
        WHERE l.status IN ('Approved', 'Disable')
        AND (${
          isLabourID
            ? "l.LabourID = @query"
            : `
            l.name LIKE '%' + @query + '%' 
            OR l.companyName LIKE '%' + @query + '%'
            OR l.departmentName LIKE '%' + @query + '%'
            OR l.location LIKE '%' + @query + '%'
        `
        })
        ORDER BY lw.CreatedAt DESC;`;
    const result = await pool
      .request()
      .input("query", sql.VarChar, query)
      .query(searchQuery);

    return result.recordset;
  } catch (error) {
    throw error;
  }
}

async function searchFromVariableInput(query) {
  try {
    const pool = await poolPromise;
    const isLabourID = /^[A-Za-z]+\d+$/.test(query.trim());

    let searchQuery = `
            WITH LatestVariablePay AS (
                SELECT 
                    vp.VariablePayId,
                    vp.LabourID,
                    vp.payAddedBy,
                    vp.PayStructure,
                    vp.projectName,
                    vp.name,
                    vp.companyName,
                    vp.businessUnit,
                    vp.departmentName,
                    vp.VariablepayAmount,
                    vp.EffectiveDate,
                    vp.ApprovalStatusPay,
                    vp.variablePayRemark,
                    ROW_NUMBER() OVER (PARTITION BY vp.LabourID ORDER BY vp.CreatedAt DESC) AS rn
                FROM VariablePay vp
            )
            SELECT ${isLabourID ? "TOP (1)" : ""}
                l.id,
                l.aadhaarNumber,
                COALESCE(l.name, vp.name) AS name,
                l.projectName AS ProjectID,
                l.department AS DepartmentID,
                COALESCE(l.departmentName, vp.departmentName) AS departmentName,
                COALESCE(l.LabourID, vp.LabourID) AS LabourID,
                COALESCE(l.companyName, vp.companyName) AS companyName,
                l.OnboardName,
                l.workingHours,
                COALESCE(l.businessUnit, vp.businessUnit) AS businessUnit,
                l.designation,
                l.location,
                vp.VariablePayId,
                vp.payAddedBy,
                vp.PayStructure,
                vp.projectName AS vpProjectName,
                vp.VariablepayAmount,
                vp.EffectiveDate,
                vp.ApprovalStatusPay,
                vp.variablePayRemark
            FROM labourOnboarding l
            LEFT JOIN LatestVariablePay vp ON l.LabourID = vp.LabourID AND vp.rn = 1
            WHERE l.status IN ('Approved', 'Disable')
              AND (${
                isLabourID
                  ? "l.LabourID = @query"
                  : `
                        l.name LIKE '%' + @query + '%'
                        OR l.companyName LIKE '%' + @query + '%'
                        OR l.departmentName LIKE '%' + @query + '%'
                        OR l.location LIKE '%' + @query + '%'
                      `
              })
            ORDER BY vp.VariablePayId DESC;
        `;

    const result = await pool
      .request()
      .input("query", sql.VarChar, query)
      .query(searchQuery);

    return result.recordset;
  } catch (error) {
    throw error;
  }
}

async function searchAttendance(query) {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("query", sql.NVarChar, `%${query}%`).query(`
                WITH RankedLabours AS (
                    SELECT *,
                        COUNT(*) OVER (PARTITION BY LabourID) AS LabourCount,
                        ROW_NUMBER() OVER (
                            PARTITION BY LabourID 
                            ORDER BY 
                                CASE 
                                    WHEN status = 'Approved' THEN 1 
                                    ELSE 2 
                                END
                        ) AS rn
                    FROM labourOnboarding
                    WHERE 
                        name LIKE @query OR 
                        aadhaarNumber LIKE @query OR 
                        LabourID LIKE @query OR 
                        OnboardName LIKE @query OR 
                        workingHours LIKE @query OR 
                        businessUnit LIKE @query OR 
                        designation LIKE @query OR 
                        location LIKE @query OR 
                        departmentName LIKE @query
                )
                SELECT * 
                FROM RankedLabours
                WHERE rn = 1
            `);
    return result.recordset;
  } catch (error) {
    throw error;
  }
}

async function searchLaboursFromSiteTransfer(query) {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("query", sql.NVarChar, `%${query}%`).query(`
                WITH LabourFiltered AS (
                    SELECT id, aadhaarNumber, name, projectName, labourCategory, department as departmentId,
                           LabourID, companyName, OnboardName, workingHours, businessUnit, designation, location,
                           ROW_NUMBER() OVER (PARTITION BY LabourID ORDER BY CASE WHEN status = 'Approved' THEN 1 ELSE 2 END) AS row_num
                    FROM labourOnboarding
                    WHERE status IN ('Approved', 'Disable')
                    AND (name LIKE @query 
                         OR companyName LIKE @query 
                         OR LabourID LIKE @query 
                         OR departmentName LIKE @query 
                         OR location LIKE @query)
                )
                SELECT id, aadhaarNumber, name, projectName, labourCategory, departmentId, LabourID, companyName, 
                       OnboardName, workingHours, businessUnit, designation, location
                FROM LabourFiltered
                WHERE row_num = 1;
            `);
    return result.recordset;
  } catch (error) {
    throw error;
  }
}

const getVariablePayAndLabourOnboardingJoin = async () => {
  const pool = await poolPromise;

  const result = await pool.request().query(`
        SELECT 
            onboarding.id,
            onboarding.LabourID,
            onboarding.name,
            onboarding.businessUnit,
            onboarding.projectName,
            onboarding.departmentName,
            onboarding.department,
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
    `);

  return result.recordset;
};

module.exports = {
  checkAadhaarExists,
  getNextUniqueID,
  registerData,
  getAll,
  getById,
  getAllLaboursOnboarding,
  deleteById,
  getImagePathsById,
  search,
  getAllLabours,
  approveLabour,
  rejectLabour,
  getApprovedLabours,
  resubmit,
  getLabourByAadhaar,
  getFormDataByAadhaar,
  updateLabour,
  registerDataUpdate,
  registerDataUpdateDisable,
  updateData,
  editLabour,
  updateDataDisableStatus,
  getLabourStatuses,
  updateHideResubmit,
  getAttendanceByLabourId,
  approveDisableLabours,
  getAllApprovedLabours,
  getLabourDetailsById,
  isHoliday,
  getMissPunchCount,
  addMissPunch,
  addApprovalRequest,
  addWeeklyOff,
  saveWeeklyOffs,
  insertIntoLabourAttendanceSummary,
  insertIntoLabourAttendanceDetails,
  deleteAttendanceDetails,
  deleteAttendanceSummary,
  fetchAttendanceSummary,
  fetchAttendanceDetails,
  fetchAttendanceByMonthYear,
  fetchAttendanceDetailsByMonthYear,
  fetchAttendanceDetailsByMonthYearForSingleLabour,
  upsertAttendance,
  getAttendanceByDateRange,
  getMatchedRows,
  updateMatchedRows,
  insertUnmatchedRows,
  getAttendanceByLabourIdForDate,
  insertOrUpdateLabourAttendanceSummary,
  getTimesUpdateForMonth,
  markAttendanceForApproval,
  approveAttendance,
  LabourAttendanceApprovalModel,
  rejectAttendance,
  rejectAttendanceAdmin,
  showAttendanceCalenderSingleLabour,
  getProjectIdByDeviceId,
  getLabourMonthlyWages,
  upsertLabourMonthlyWages,
  getWagesAdminApprovals,
  addWageApproval,
  getWagesByDateRange,
  insertWagesData,
  getWagesAndLabourOnboardingJoin,
  searchFromWages,
  checkExistingWages,
  markWagesForApproval,
  approveWages,
  rejectWages,
  getVariablePayAndLabourOnboardingJoin,
  getHolidayDates,
  searchAttendance,
  searchForAttendance,
  searchLaboursFromSiteTransfer,
  updateTotalOvertimeHours,
  searchFromVariableInput,
  getAttendanceReportAAndLabourOnboardingJoin,
  getAllApprovedOrMonthlyDisabledLabours,
  getAttendanceByLabourIdAndDate,
  saveEsslAttendance,
  getESSLAttendance,
};