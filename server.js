


//     // This code change on 19-07-2024 with the essl send data
    

//     require('dotenv').config();
// const express = require('express');
// const cors = require('cors');
// const bodyParser = require('body-parser');
// const multer = require('multer');
// const fs = require('fs');
// const path = require('path');
// const JSZip = require('jszip');
// const axios = require('axios');
// const xml2js = require('xml2js');
// const labourRoutes = require('./routes/labourRoutes');
// const EmployeeRoute = require('./routes/dataRoutes')
// const labourController = require('./controllers/labourController');
// const userRoutes = require('./routes/UserRoutes');
// const dataRoutes = require('./routes/dataRoutes');
// const { poolPromise2 } = require('./config/dbConfig2');

// const app = express();
// const PORT = process.env.PORT || 4000;


// app.use(express.text({ type: 'text/xml' }));


// app.use(cors({
//     origin: '*'
// }));


// // app.use(cors())

// app.use(bodyParser.json({ limit: '100mb' }));
// app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));

// const storage = multer.diskStorage({
//     destination: (req, file, cb) => {
//         const uploadDir = path.join(__dirname, 'uploads');
//         if (!fs.existsSync(uploadDir)) {
//             fs.mkdirSync(uploadDir);
//         }
//         cb(null, uploadDir);
//     },
//     filename: (req, file, cb) => {
//         cb(null, `${Date.now()}-${file.originalname}`);
//     }
// });

// const upload = multer({
//     storage: storage,
//     limits: { fileSize: 100 * 1024 * 1024 } // 100MB file size limit
// });

// app.use('/uploads', express.static(path.join(__dirname, 'uploads')));




// app.get('/labours/:id/download/full-form', (req, res) => {
//     const { id } = req.params;
//     const filePath = path.join(__dirname, 'uploads', `full_form_${id}.pdf`);
//     if (fs.existsSync(filePath)) {
//         res.download(filePath, `full_form_${id}.pdf`);
//     } else {
//         res.status(404).send('File not found.');
//     }
// });

// app.get('/labours/:id/download/aadhaar-card', async (req, res) => {
//     const { id } = req.params;
//     const frontFilePath = path.join(__dirname, 'uploads', `aadhaar_front_${id}.jpg`);
//     const backFilePath = path.join(__dirname, 'uploads', `aadhaar_back_${id}.jpg`);
//     const idProofFilePath = path.join(__dirname, 'uploads', `id_Proof${id}.jpg`);
//     const inductionFilePath = path.join(__dirname, 'uploads', `id_Proof${id}.jpg`);

//     if (fs.existsSync(frontFilePath) && fs.existsSync(backFilePath) && fs.existsSync(idProofFilePath) && fs.existsSync(inductionFilePath)) {
//         const frontFile = fs.readFileSync(frontFilePath);
//         const backFile = fs.readFileSync(backFilePath);
//         const idFile = fs.readFileSync(idProofFilePath);
//         const inductionFile = fs.readFileSync(inductionFilePath);

//         const zip = new JSZip();
//         zip.file(`aadhaar_front_${id}.jpg`, frontFile);
//         zip.file(`aadhaar_back_${id}.jpg`, backFile);
//         zip.file(`id_Proof${id}.jpg`, idFile);
//         zip.file(`Upload_Induction${id}.jpg`, inductionFile);

//         res.set('Content-Type', 'application/zip');
//         res.set('Content-Disposition', `attachment; filename="aadhaar_${id}.zip"`);

//         zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true })
//             .pipe(res)
//             .on('finish', () => {
//                 console.log(`Aadhaar card zip for Labour ID ${id} has been generated and sent.`);
//             });
//     } else {
//         res.status(404).send('File not found.');
//     }
// });

// app.post('/labours', upload.fields([
//     { name: 'uploadAadhaarFront' },
//     { name: 'uploadAadhaarBack' },
//     { name: 'uploadIdProof' },
//     { name: 'uploadInductionDoc' },
//     { name: 'photoSrc' }
// ]), labourController.createRecord);

// app.post('/labours/:id', upload.fields([
//     { name: 'uploadAadhaarFront' },
//     { name: 'uploadAadhaarBack' },
//     { name: 'uploadIdProof' },
//     { name: 'uploadInductionDoc' },
//     { name: 'photoSrc' }
// ]), labourController.createRecordUpdate);

// // Define the route to update a labour record
// app.put('/labours/updatelabour/:id', upload.fields([
//     { name: 'uploadAadhaarFront' },
//     { name: 'uploadAadhaarBack' },
//     { name: 'uploadIdProof' },
//     { name: 'uploadInductionDoc' },
//     { name: 'photoSrc' }
// ]), labourController.updateRecord);

// app.use('/labours', labourRoutes);
// app.use('/users', userRoutes);
// app.use('/api', dataRoutes);
// app.use(EmployeeRoute)


// app.listen(PORT, () => {
//     console.log(`App is running on PORT ${PORT}`);
// });

// poolPromise2
//     .then(() => {
//         console.log('Connected to the database');
//     })
//     .catch(err => {
//         console.error('Database connection failed:', err);
//     });

//     module.exports = {
//         upload, 
//     };













require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const axios = require('axios');
const xml2js = require('xml2js');
const ExcelJS = require('exceljs'); // Added ExcelJS
const labourRoutes = require('./routes/labourRoutes');
const EmployeeRoute = require('./routes/dataRoutes');
const labourController = require('./controllers/labourController');
const userRoutes = require('./routes/UserRoutes');
const dataRoutes = require('./routes/dataRoutes');
const { poolPromise2 } = require('./config/dbConfig2');
const { poolPromise } = require('./config/dbConfig');
const insentiveRoutes = require('./routes/insentiveRoutes');
const dashBoardRoutes = require('./routes/dashBoardRoutes');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.text({ type: 'text/xml' }));

app.use(cors({
    origin: '*'
}));

console.log("in server.js")

app.use(bodyParser.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB file size limit
});

app.use('/api/labours', labourRoutes);

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Add the route to download the Excel file
// app.get('/download-excel', async (req, res) => {
//     try {
//         const pool = await poolPromise;
//         const result = await pool.request().query('SELECT * FROM labourOnboarding');
//         const data = result.recordset;

//         // Create a new workbook and a sheet
//         const workbook = new ExcelJS.Workbook();
//         const worksheet = workbook.addWorksheet('SSMS Data');

//         // Add headers to the sheet
//         worksheet.columns = Object.keys(data[0]).map(key => ({ header: key, key }));

//         // Add data to the sheet
//         data.forEach(row => {
//             worksheet.addRow(row);
//         });

//         // Adjust column widths
//         worksheet.columns.forEach(column => {
//             let maxLength = 0;
//             column.eachCell({ includeEmpty: true }, cell => {
//                 const cellValueLength = cell.value ? cell.value.toString().length : 0;
//                 maxLength = Math.max(maxLength, cellValueLength);
//             });
//             column.width = maxLength < 10 ? 10 : maxLength + 2; // Minimum width of 10, or length of content + 2
//         });

//         // Set the response headers for download
//         res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
//         res.setHeader('Content-Disposition', 'attachment; filename=ssms_data.xlsx');

//         // Send the workbook to the client
//         await workbook.xlsx.write(res);
//         res.end();
//     } catch (error) {
//         console.error('Error generating Excel file:', error);
//         res.status(500).send('Error generating Excel file');
//     }
// });







// app.get('/labours/:id/download/aadhaar-card', async (req, res) => {
//     const { id } = req.params;
//     const frontFilePath = path.join(__dirname, 'uploads', `aadhaar_front_${id}.jpg`);
//     const backFilePath = path.join(__dirname, 'uploads', `aadhaar_back_${id}.jpg`);
//     const idProofFilePath = path.join(__dirname, 'uploads', `id_Proof${id}.jpg`);
//     const inductionFilePath = path.join(__dirname, 'uploads', `id_Proof${id}.jpg`);

//     if (fs.existsSync(frontFilePath) && fs.existsSync(backFilePath) && fs.existsSync(idProofFilePath) && fs.existsSync(inductionFilePath)) {
//         const frontFile = fs.readFileSync(frontFilePath);
//         const backFile = fs.readFileSync(backFilePath);
//         const idFile = fs.readFileSync(idProofFilePath);
//         const inductionFile = fs.readFileSync(inductionFilePath);

//         const zip = new JSZip();
//         zip.file(`aadhaar_front_${id}.jpg`, frontFile);
//         zip.file(`aadhaar_back_${id}.jpg`, backFile);
//         zip.file(`id_Proof${id}.jpg`, idFile);
//         zip.file(`Upload_Induction${id}.jpg`, inductionFile);

//         res.set('Content-Type', 'application/zip');
//         res.set('Content-Disposition', `attachment; filename="aadhaar_${id}.zip"`);

//         zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true })
//             .pipe(res)
//             .on('finish', () => {
//                 console.log(`Aadhaar card zip for Labour ID ${id} has been generated and sent.`);
//             });
//     } else {
//         res.status(404).send('File not found.');
//     }
// });


app.use('/users', userRoutes);
app.use('/api',(req, res, next)=>{console.log('/api'); next()}, dataRoutes);
app.use('/insentive', insentiveRoutes);
app.use('/dashboard', dashBoardRoutes);
app.use(EmployeeRoute);

app.listen(PORT, () => {
    console.log(`App is running on PORT ${PORT}`);
});

poolPromise2
    .then(() => {
        console.log('Connected to the database');
    })
    .catch(err => {
        console.error('Database connection failed:', err);
    });

module.exports = {
    upload, 
};
