# BoloForms Signature

A prototype for placing signature fields on PDFs and burning them into the document. Fields stay anchored when you resize the viewport, and signatures are placed with proper aspect ratio.

## Features

- Drag and drop fields onto PDF (signature, text, date, radio, image)
- Resize fields by dragging corners
- Fields stay in the right place when switching between desktop/mobile view
- Draw signatures on canvas
- Burn signatures into PDF on backend
- SHA-256 hash tracking for audit trail (MongoDB optional)

## Tech Stack

**Frontend:**
- React with Vite
- react-pdf for PDF rendering
- react-rnd for drag/resize
- react-signature-canvas for drawing signatures
- axios for API calls

**Backend:**
- Node.js with Express
- pdf-lib for PDF manipulation
- MongoDB (optional) for audit logs
- crypto for SHA-256 hashing

## Setup

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

**Backend:**
```bash
cd backend
npm install
npm run dev
```

## Environment Variables

**Frontend (.env):**
```
VITE_API_URL=http://localhost:4000
```

**Backend (.env):**
```
PORT=4000
PUBLIC_BASE_URL=http://localhost:4000
MONGODB_URI=mongodb://... (optional)
MONGO_DB=signature-proto
```

## How It Works

### Coordinate System

The tricky part is converting between browser coordinates and PDF coordinates:

1. **Normalize positions**: When you place a field, store its position as a ratio (0-1) instead of pixels
   - `xNorm = xPixels / viewerWidth`
   - `yNorm = yPixels / viewerHeight`

2. **Render fields**: When drawing, convert back to pixels based on current viewer size
   - `xPixels = xNorm * currentViewerWidth`
   - `yPixels = yNorm * currentViewerHeight`

3. **Convert to PDF points**: PDF uses points (72 DPI) with origin at bottom-left
   - `xPt = xNorm * pageWidthPts`
   - `yPtFromTop = yNorm * pageHeightPts`
   - `yPt = pageHeightPts - yPtFromTop - heightPts` (flip Y axis)

### Signature Placement

When burning a signature into the PDF:
- Calculate scale to fit signature in box without distortion
- Use the smaller scale factor (width or height) so it fits both dimensions
- Center the signature within the box

## Deployment

**Frontend (Vercel/Netlify):**
- Build command: `npm run build`
- Output directory: `dist`
- Set `VITE_API_URL` environment variable

**Backend (Render/Railway):**
- Start command: `npm start`
- Set environment variables: `PORT`, `PUBLIC_BASE_URL`, `MONGODB_URI`
- The `sample.pdf` file is included in the repo
- Signed PDFs are saved to `signed/` directory and served at `/signed/*`

## Notes

- Currently only signature fields are burned into the PDF
- Other field types (text, date, radio, image) are visual overlays only
- To burn other field types, extend the `/sign-pdf` endpoint
