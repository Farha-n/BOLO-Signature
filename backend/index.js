// PDF signing backend - burns signatures into PDFs and tracks audit trail
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { PDFDocument } = require('pdf-lib');

const app = express();
const PORT = process.env.PORT || 4000;
const signedDir = path.join(__dirname, 'signed');

// Simple catalog for PDFs - in production this would come from a database
const pdfCatalog = {
  default: path.resolve(__dirname, 'sample.pdf'),
};

// Create signed directory if it doesn't exist
if (!fs.existsSync(signedDir)) {
  fs.mkdirSync(signedDir, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use('/signed', express.static(signedDir));

// Helper to hash PDF bytes for audit trail
const hashBuffer = (buffer) =>
  crypto.createHash('sha256').update(buffer).digest('hex');

// Setup MongoDB for audit logging (optional)
let AuditLog;
const mongoUri = process.env.MONGODB_URI;
if (mongoUri) {
  mongoose
    .connect(mongoUri, { dbName: process.env.MONGO_DB || 'signature-proto' })
    .then(() => console.log('Connected to MongoDB'))
    .catch((err) => console.error('Mongo connection failed', err));

  const auditSchema = new mongoose.Schema(
    {
      pdfId: String,
      originalHash: String,
      signedHash: String,
      signedFile: String,
    },
    { timestamps: true }
  );
  AuditLog = mongoose.model('AuditLog', auditSchema);
} else {
  console.warn('MONGODB_URI not set. Audit trail will be logged to console.');
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/sign-pdf', async (req, res) => {
  try {
    const { pdfId = 'default', signatures, signatureDataUrl, coordinates } = req.body;
    
    // Support both old single signature format and new array format
    let signatureList = [];
    if (signatures && Array.isArray(signatures)) {
      signatureList = signatures;
    } else if (signatureDataUrl && coordinates) {
      signatureList = [{ signatureDataUrl, coordinates }];
    } else {
      return res
        .status(400)
        .json({ message: 'signatures array or signatureDataUrl+coordinates required' });
    }

    if (signatureList.length === 0) {
      return res.status(400).json({ message: 'At least one signature is required' });
    }

    // Load the original PDF
    const pdfPath = pdfCatalog[pdfId] || pdfCatalog.default;
    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({ message: 'PDF not found' });
    }

    const originalBuffer = fs.readFileSync(pdfPath);
    const originalHash = hashBuffer(originalBuffer);
    const pdfDoc = await PDFDocument.load(originalBuffer);

    // Burn each signature into the PDF
    for (const sig of signatureList) {
      const { signatureDataUrl, coordinates } = sig;
      if (!signatureDataUrl || !coordinates) {
        continue; // skip invalid entries
      }

      const pageIndex = Math.max(0, (coordinates.page || 1) - 1);
      const page = pdfDoc.getPage(pageIndex);

      // Extract base64 image data
      const base64 = signatureDataUrl.split(',').pop();
      const signatureBytes = Buffer.from(base64, 'base64');
      const signatureImage = await pdfDoc.embedPng(signatureBytes);

      const boxWidth = coordinates.width;
      const boxHeight = coordinates.height;

      // Calculate scale to fit signature in box without distorting aspect ratio
      // Use the smaller scale factor so it fits both width and height
      const scale = Math.min(
        boxWidth / signatureImage.width,
        boxHeight / signatureImage.height
      );
      const drawWidth = signatureImage.width * scale;
      const drawHeight = signatureImage.height * scale;
      
      // Center the signature within the box
      const x = coordinates.x + (boxWidth - drawWidth) / 2;
      const y = coordinates.y + (boxHeight - drawHeight) / 2;

      page.drawImage(signatureImage, {
        x,
        y,
        width: drawWidth,
        height: drawHeight,
      });
    }

    // Save the signed PDF and generate hash for audit trail
    const signedBuffer = await pdfDoc.save();
    const signedHash = hashBuffer(signedBuffer);
    const fileName = `signed-${crypto.randomUUID()}.pdf`;
    const signedPath = path.join(signedDir, fileName);
    fs.writeFileSync(signedPath, signedBuffer);

    // Generate URL for the signed PDF
    const baseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;
    const signedUrl = `${baseUrl}/signed/${fileName}`;

    // Log to MongoDB if available, otherwise console
    if (AuditLog) {
      await AuditLog.create({
        pdfId,
        originalHash,
        signedHash,
        signedFile: fileName,
      });
    } else {
      console.log('Audit log', {
        pdfId,
        originalHash,
        signedHash,
        signedFile: fileName,
      });
    }

    res.json({ signedUrl, originalHash, signedHash });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to sign PDF', error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});

