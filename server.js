const http = require('http');
const formidable = require('formidable');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const sharp = require('sharp');
require('dotenv').config();


const API_KEY = process.env.API_KEY;

const server = http.createServer((req, res) => {
    const apiKey = req.headers['x-api-key'];

    // Validate API key
    if (!apiKey || apiKey !== API_KEY) {
        res.writeHead(401, { 'Content-Type': 'text/plain' });
        res.end('Unauthorized or Forbidden');
        return;
    }

    if (req.method === 'POST' && req.url === '/upload') {
        // File upload logic
        const folderName = req.headers['folder-name'].toLowerCase().replaceAll(" ", "_");
        if (!folderName) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Bad Request: Folder name is required in headers');
            return;
        }

        const form = new formidable.IncomingForm();
        const baseDir = path.join(__dirname, 'images', 'uploaded');
        const targetDir = path.join(baseDir, folderName);

        if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir);
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir);

        form.uploadDir = targetDir;
        form.keepExtensions = true;

        form.parse(req, (err, fields, files) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Error parsing form data');
                return;
            }

            const uploadedFile = files.file[0];

            if (!uploadedFile || !uploadedFile.originalFilename) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end('No file uploaded or invalid file');
                return;
            }

            const originalFilename = uploadedFile.originalFilename;
            const newFileName = originalFilename.toLowerCase().replaceAll(" ", "_");
            const newFilePath = path.join(targetDir, newFileName);

            fs.rename(uploadedFile.filepath, newFilePath, renameErr => {
                if (renameErr) {
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end('Error saving file');
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end(`File uploaded successfully to folder: ${folderName}`);
            });
        });
        return;
    }

    if (req.method === 'POST' && req.url === '/verification') {
        const action = req.headers['action'].toLowerCase(); // Expected: "verify" or "delete"
        const originFolder = req.headers['origin-folder'].toLowerCase();
        const folderName = req.headers['folder-name'].toLowerCase();
        const fileName = req.headers['file-name'].toLowerCase();

        if (!action || !['verify', 'delete'].includes(action)) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Bad Request: Action must be "verify" or "delete"');
            return;
        }

        if (!folderName || !fileName || !originFolder) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Bad Request: Origin Dir, Folder name and file name are required in headers');
            return;
        }

        if (!['uploaded', 'verified', 'deleted'].includes(originFolder)) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Bad Request: Origin Dir must be "uploaded", "verified" or "deleted"');
            return;
        }

        if (originFolder === 'verified' && action === 'verify') {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Bad Request: Origin Dir cannot be "verified" for verification');
            return;
        }

        if (originFolder === 'deleted' && action === 'delete') {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Bad Request: Origin Dir cannot be "deleted" for deletion');
            return;
        }

        const originDir = path.join(__dirname, 'images', originFolder, folderName);
        const verifiedDir = path.join(__dirname, 'images', 'verified', folderName);
        const deletedDir = path.join(__dirname, 'images', 'deleted', folderName);

        if (!fs.existsSync(originDir)) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found: Origin folder does not exist');
            return;
        }

        const filePath = path.join(originDir, fileName);

        if (!fs.existsSync(filePath)) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found: File does not exist');
            return;
        }

        if (action === 'verify') {
            // Ensure verified folder exists
            if (!fs.existsSync(verifiedDir)) fs.mkdirSync(verifiedDir, { recursive: true });

            const verifiedFilePath = path.join(verifiedDir, fileName);

            fs.rename(filePath, verifiedFilePath, err => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end('Error moving file to verified folder');
                    console.error(err);
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end(`File successfully verified and moved to: ${verifiedDir}`);
            });
        } else if (action === 'delete') {
            if (!fs.existsSync(deletedDir)) fs.mkdirSync(deletedDir, { recursive: true });

            const deletedFilePath = path.join(deletedDir, fileName);

            fs.rename(filePath, deletedFilePath, err => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end('Error deleting file');
                    console.error(err);
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end('File successfully deleted');
            });
        }
        return;
    }

    function deleteFile(filePath, res) {
        fs.unlink(filePath, err => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Error deleting file');
                console.error(err);
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('File successfully deleted');
            return;
        });
    }
    
    if (req.method === 'POST' && req.url === '/delete') {
        const originFolder = req.headers['origin-folder'].toLowerCase();
        const folderName = req.headers['folder-name'].toLowerCase();
        const fileName = req.headers['file-name'].toLowerCase();
    
        if (!folderName || !fileName || !originFolder) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Bad Request: Folder name and file name are required in headers');
            return;
        }

        if (!['uploaded', 'verified', 'deleted'].includes(originFolder)) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Bad Request: Origin Dir must be "uploaded", "verified" or "deleted"');
            return;
        }
    
        const originDir = path.join(__dirname, 'images', originFolder, folderName);
        const originFilePath = path.join(originDir, fileName);

        if (!fs.existsSync(originDir)) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found: Folder does not exist');
            return;
        }

        if (!fs.existsSync(originFilePath)) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found: File does not exist');
            return;
        }

        deleteFile(originFilePath, res);
        return;
    }

    if (req.method === 'GET' && req.url === '/get-image-count') {
        const folderType = req.headers['folder-type'].toLowerCase(); // Expected: "verified" or "uploaded"
    
        if (!folderType || !['verified', 'uploaded', 'deleted'].includes(folderType)) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Bad Request: Folder type must be "verified" or "uploaded" in headers');
            return;
        }
    
        const targetDir = path.join(__dirname, 'images', folderType);
    
        if (!fs.existsSync(targetDir)) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end(`Not Found: ${folderType} folder does not exist`);
            return;
        }
    
        let studentImageCounts = {};
        let totalImages = 0;
    
        fs.readdirSync(targetDir).forEach(studentFolder => {
            const studentFolderPath = path.join(targetDir, studentFolder);
    
            if (fs.lstatSync(studentFolderPath).isDirectory()) {
                const imageCount = fs.readdirSync(studentFolderPath).length;
                studentImageCounts[studentFolder] = imageCount;
                totalImages += imageCount;
            }
        });
    
        studentImageCounts["all"] = totalImages;
    
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(studentImageCounts, null, 2));
        return;
    }

    if (req.method === 'GET' && req.url === '/images') {
        const folderType = req.headers['folder-type'].toLowerCase(); // "verified" or "uploaded"
        const studentName = req.headers['student-name'].toLowerCase(); // Student name
        const page = parseInt(req.headers['page'], 10) || 1; // Page number, default is 1
        const limit = parseInt(req.headers['limit'], 10) || 5; // Images per page, default is 5
      
        if (!folderType || !['verified', 'uploaded', 'deleted'].includes(folderType)) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Bad Request: Folder type must be "verified" or "uploaded"');
          return;
        }
      
        if (!studentName) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Bad Request: Student name is required');
          return;
        }
      
        const folderPath = path.join(__dirname, 'images', folderType);
      
        if (!fs.existsSync(folderPath)) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found: Folder does not exist');
          return;
        }
      
        if (studentName === "all") {
          let allImageUrls = [];
      
          // Iterate over all student folders
          fs.readdir(folderPath, (err, students) => {
            if (err) {
              res.writeHead(500, { 'Content-Type': 'text/plain' });
              res.end('Unable to scan student folders');
              return;
            }
      
            // Filter directories (students)
            const studentFolders = students.filter(student => fs.statSync(path.join(folderPath, student)).isDirectory());
      
            studentFolders.forEach(student => {
              const studentFolderPath = path.join(folderPath, student);
      
              // Read all image files in the student folder
              const studentImages = fs.readdirSync(studentFolderPath).filter(file => {
                return file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.png') || file.endsWith('.webp');
              });
      
              // Map student images to URLs
              studentImages.forEach(image => {
                allImageUrls.push(`${folderType}/${student}/${image}`);
              });
            });
      
            // Calculate pagination
            const totalImages = allImageUrls.length;
            const startIndex = (page - 1) * limit;
            const endIndex = startIndex + limit;
            const paginatedImages = allImageUrls.slice(startIndex, endIndex);
      
            // Return the list of image URLs
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(paginatedImages));
          });
      
          return;
        }
      
        // If not "all", continue as before for a specific student
        const studentFolderPath = path.join(folderPath, studentName);
      
        if (!fs.existsSync(studentFolderPath)) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found: Student folder does not exist');
          return;
        }
      
        // Read all image files in the student folder
        fs.readdir(studentFolderPath, (err, files) => {
          if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Unable to scan files');
            return;
          }
      
          // Filter image files (e.g., png, jpg, jpeg, webp, etc.)
          const imageFiles = files.filter(file => {
            return file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.png') || file.endsWith('.webp');
          });
      
          // Calculate pagination
          const totalImages = imageFiles.length;
          const startIndex = (page - 1) * limit;
          const endIndex = startIndex + limit;
          const paginatedImages = imageFiles.slice(startIndex, endIndex);
      
          // Generate the list of image URLs
          const imageUrls = paginatedImages.map(file => `/images/${folderType}/${studentName}/${file}`);
      
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(imageUrls));
        });
        return;
    }

    // const compressImage = async (filePath, ext) => {
    //     const MAX_WIDTH = 250;
    //     const MAX_HEIGHT = 250;
    //     const MAX_FILE_SIZE = 100000;
    //     let quality = 80;
    
    //     const metadata = await sharp(filePath).rotate().metadata();
    //     const originalWidth = metadata.width;
    //     const originalHeight = metadata.height;
    
    //     let width = originalWidth > MAX_WIDTH ? MAX_WIDTH : originalWidth;
    //     let height = originalHeight > MAX_HEIGHT ? MAX_HEIGHT : originalHeight;
    
    //     if (originalWidth > MAX_WIDTH || originalHeight > MAX_HEIGHT) {
    //         const ratio = Math.min(MAX_WIDTH / originalWidth, MAX_HEIGHT / originalHeight);
    //         width = Math.round(originalWidth * ratio);
    //         height = Math.round(originalHeight * ratio);
    //     }

    //     while (quality > 20) {
    //         const buffer = await sharp(filePath)
    //             .rotate()
    //             .resize(width, height)
    //             .toFormat(ext === '.png' ? 'png' : 'jpeg', { quality })
    //             .toBuffer();
    //         if (buffer.length <= MAX_FILE_SIZE) {
    //             return buffer;
    //         }
    //         quality -= 10;
    //     }
    //     return fs.promises.readFile(filePath);
    // };

    const compressImage = async (filePath) => {
        const MAX_WIDTH = 250;
        const MAX_HEIGHT = 250;
        const MAX_FILE_SIZE = 100000;
        let quality = 80;
        let buffer;
    
        while (quality > 20) {
            buffer = await sharp(filePath)
                .rotate() // automatische Ausrichtung basierend auf EXIF-Daten
                .resize(MAX_WIDTH, MAX_HEIGHT, {
                    fit: 'contain', // komplettes Bild sichtbar
                    background: { r: 0, g: 0, b: 0, alpha: 0 } // transparenter Hintergrund
                })
                .toFormat('webp', { quality })
                .toBuffer();
            if (buffer.length <= MAX_FILE_SIZE) {
                return buffer;
            }
            quality -= 10;
        }
        return fs.promises.readFile(filePath);
    };
    

    if (req.method === 'GET' && req.url.startsWith('/images/')) {
        (async () => { 
            const decodedUrl = decodeURIComponent(req.url);
            const cleanPath = decodedUrl.split('?')[0];
            const filePath = path.join(__dirname, cleanPath);
            const quality = req.headers['quality'];
    
            if (!fs.existsSync(filePath)) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Not Found: Image does not exist');
                return;
            }

            if (!quality || (quality !== 'low' && quality !== 'high')) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end('Bad Request: Missing or invalid "quality" header (must be "low" or "high")');
                return;
            }
    
            const ext = path.extname(filePath).toLowerCase();
            const mimeTypes = {
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.webp': 'image/webp'
            };
    
            if (mimeTypes[ext]) {
                try {
                    const contentType = mimeTypes[ext] || 'application/octet-stream';
                    const fileName = path.basename(filePath); 
    
                    res.writeHead(200, {
                        'Content-Type': contentType,
                        'Content-Disposition': `inline; filename="${fileName}"`
                    });
    
                    if (quality === 'high') {
                        const buffer = await sharp(filePath)
                            .rotate()
                            .toFormat('webp', { quality: 95 })
                            .toBuffer();
                        res.end(buffer);
                    } else {
                        const compressedImage = await compressImage(filePath, ext);
                        res.end(compressedImage);
                    }
                } catch (err) {
                    console.log(err);
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end('Error processing image');
                }
            } else {
                res.writeHead(403, { 'Content-Type': 'text/plain' });
                res.end('Forbidden: Only image files are allowed');
            }
        })();
        return;
    }

    if (req.method === 'POST' && req.url === '/createzip') {
        const verifiedDir = path.join(__dirname, 'images', 'verified');
        const zipFilePath = path.join(__dirname, 'verified.zip');

        // Check if the verified folder exists
        if (!fs.existsSync(verifiedDir)) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found: Verified folder does not exist');
            return;
        }

        // Create ZIP file
        const output = fs.createWriteStream(zipFilePath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => {
            console.log(`ZIP file created with ${archive.pointer()} total bytes`);
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(`ZIP file created successfully: ${zipFilePath}`);
        });

        output.on('error', err => {
            console.error('Error creating ZIP file:', err);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Error creating ZIP file');
        });

        archive.pipe(output);
        
        fs.readdirSync(verifiedDir).forEach(studentFolder => {
            const studentFolderPath = path.join(verifiedDir, studentFolder);
            
            // Check if it's a directory
            if (fs.lstatSync(studentFolderPath).isDirectory()) {
                fs.readdirSync(studentFolderPath).forEach(file => {
                    const filePath = path.join(studentFolderPath, file);
                    archive.file(filePath, { name: file }); // Add files without subfolder structure
                });
            }
        });

        archive.finalize();
        return;
    }

    if (req.method === 'GET' && req.url === '/download') {
        const zipFilePath = path.join(__dirname, 'verified.zip');

        // Check if the ZIP file exists
        if (!fs.existsSync(zipFilePath)) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found: ZIP file does not exist. Please create it first.');
            return;
        }

        // Serve the ZIP file
        res.writeHead(200, {
            'Content-Type': 'application/zip',
            'Content-Disposition': 'attachment; filename=verified.zip',
        });

        const fileStream = fs.createReadStream(zipFilePath);
        fileStream.pipe(res);

        fileStream.on('end', () => {
            console.log('ZIP file sent to the client');
        });

        fileStream.on('error', err => {
            console.error('Error sending ZIP file:', err);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Error sending ZIP file');
        });
        return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
});

server.listen(4000, () => console.log('Server running on http://localhost:4000'));