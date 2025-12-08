# BoloForms Signature Injection Prototype

## What this does
- Render an A4 PDF and overlay draggable, resizable fields.
- Normalize positions so fields stay anchored across viewport sizes.
- Burn a drawn signature into the PDF on the backend with aspect-ratio fit.
- Hash original and signed PDFs (SHA-256) and log to Mongo when configured.

## Stack
- Frontend: React (Vite), react-pdf, react-rnd, react-signature-canvas, axios.
- Backend: Node/Express, pdf-lib, MongoDB (optional), crypto for SHA-256.

## Running locally
Frontend:
```
cd frontend
npm install
npm run dev
```
Backend:
```
cd backend
npm install
npm run dev
```

## Env vars
- Frontend: `VITE_API_URL` → backend origin (e.g., http://localhost:4000).
- Backend:
  - `PORT` (default 4000)
  - `PUBLIC_BASE_URL` → backend public URL (used for signed file links)
  - `MONGODB_URI` → Mongo connection string (optional; logs to console if absent)
  - `MONGO_DB` (optional, default `signature-proto`)

## Coordinate math (DOM → PDF)
- Normalize on placement: `xNorm = xPx / viewerWidth`, `yNorm = yPx / viewerHeight`, same for width/height.
- On render: `xPx = xNorm * viewerWidth`, `yPx = yNorm * viewerHeight`.
- To PDF points (origin bottom-left, 72 DPI):
  - `xPt = xNorm * pageWidthPts`
  - `hPt = hNorm * pageHeightPts`
  - `yPtFromTop = yNorm * pageHeightPts`
  - `yPt = pageHeightPts - yPtFromTop - hPt`
  - `wPt = wNorm * pageWidthPts`

Aspect-ratio fit for signature:
```
scale = min(wPt / imgW, hPt / imgH)
drawW = imgW * scale
drawH = imgH * scale
drawX = xPt + (wPt - drawW) / 2
drawY = yPt + (hPt - drawH) / 2
```

## Deployment notes
- Frontend (Vercel/Netlify): build `npm run build`, output `dist`, set `VITE_API_URL`.
- Backend (Render/Railway): start `npm start`, set `PORT`, `PUBLIC_BASE_URL`, `MONGODB_URI`, `MONGO_DB`. `sample.pdf` is bundled; `signed/` is auto-created and served at `/signed`.

## Current scope
- Burn-in is implemented for signature fields. Other field types are visual overlays only; extend `/sign-pdf` to draw text/date/radio/image if needed.

