// Simple signing service: load PDF, place signature with aspect-ratio fit, hash original/signed, and serve result.
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
const pdfCatalog = {
  default: path.resolve(__dirname, 'sample.pdf'),
};

if (!fs.existsSync(signedDir)) {
  fs.mkdirSync(signedDir, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use('/signed', express.static(signedDir));

const hashBuffer = (buffer) =>
  crypto.createHash('sha256').update(buffer).digest('hex');

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
    const { pdfId = 'default', signatureDataUrl, coordinates } = req.body;
    if (!signatureDataUrl || !coordinates) {
      return res
        .status(400)
        .json({ message: 'signatureDataUrl and coordinates are required' });
    }

    const pdfPath = pdfCatalog[pdfId] || pdfCatalog.default;
    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({ message: 'PDF not found' });
    }

    const originalBuffer = fs.readFileSync(pdfPath);
    const originalHash = hashBuffer(originalBuffer);
    const pdfDoc = await PDFDocument.load(originalBuffer);
    const pageIndex = Math.max(0, (coordinates.page || 1) - 1);
    const page = pdfDoc.getPage(pageIndex);

    const base64 = signatureDataUrl.split(',').pop();
    const signatureBytes = Buffer.from(base64, 'base64');
    const signatureImage = await pdfDoc.embedPng(signatureBytes);

    const boxWidth = coordinates.width;
    const boxHeight = coordinates.height;

    // Preserve aspect ratio while fitting inside the drawn box
    const scale = Math.min(
      boxWidth / signatureImage.width,
      boxHeight / signatureImage.height
    );
    const drawWidth = signatureImage.width * scale;
    const drawHeight = signatureImage.height * scale;
    const x = coordinates.x + (boxWidth - drawWidth) / 2;
    const y = coordinates.y + (boxHeight - drawHeight) / 2;

    page.drawImage(signatureImage, {
      x,
      y,
      width: drawWidth,
      height: drawHeight,
    });

    const signedBuffer = await pdfDoc.save();
    const signedHash = hashBuffer(signedBuffer);
    const fileName = `signed-${crypto.randomUUID()}.pdf`;
    const signedPath = path.join(signedDir, fileName);
    fs.writeFileSync(signedPath, signedBuffer);

    const baseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;
    const signedUrl = `${baseUrl}/signed/${fileName}`;

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

