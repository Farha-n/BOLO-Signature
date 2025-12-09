import { useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Rnd } from 'react-rnd';
import SignaturePad from 'react-signature-canvas';
import dayjs from 'dayjs';
import axios from 'axios';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import './App.css';

// Setup PDF.js worker - had issues with this initially
pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

const samplePdf = '/sample.pdf';

// Field types available for placement
const fieldPalette = [
  { type: 'signature', label: 'Signature' },
  { type: 'text', label: 'Text Box' },
  { type: 'image', label: 'Image Box' },
  { type: 'date', label: 'Date' },
  { type: 'radio', label: 'Radio' },
];

// Default size for new fields (normalized 0-1)
const defaultBox = {
  widthNorm: 0.24,
  heightNorm: 0.08,
};

// Converting DOM coordinates to PDF points
// This was tricky - DOM uses top-left origin, PDF uses bottom-left
// Also need to convert from CSS pixels to PDF points (72 DPI)
const toPdfCoords = (field, pageMeta) => {
  if (!field || !pageMeta?.widthPts || !pageMeta?.heightPts) return null;
  const x = field.xNorm * pageMeta.widthPts;
  const yTop = field.yNorm * pageMeta.heightPts;
  const height = field.heightNorm * pageMeta.heightPts;

  return {
    page: field.page,
    x,
    y: pageMeta.heightPts - yTop - height, // flip Y axis from top-left to bottom-left
    width: field.widthNorm * pageMeta.widthPts,
    height,
    pageWidth: pageMeta.widthPts,
    pageHeight: pageMeta.heightPts,
  };
};

function App() {
  const [pageMeta, setPageMeta] = useState({ widthPts: null, heightPts: null });
  const [renderSize, setRenderSize] = useState({ width: 0 });
  const [fields, setFields] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [signedUrl, setSignedUrl] = useState('');
  const [status, setStatus] = useState('');
  const [pdfError, setPdfError] = useState('');
  const sigPadRef = useRef(null);
  const pageWrapperRef = useRef(null);

  // Watch for PDF viewer resize so we can recalculate field positions
  useEffect(() => {
    if (!pageWrapperRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      setRenderSize({ width });
    });
    observer.observe(pageWrapperRef.current);
    return () => observer.disconnect();
  }, []);

  const selectedField = useMemo(
    () => fields.find((f) => f.id === selectedId) || null,
    [fields, selectedId]
  );

  const selectedPdfCoords = useMemo(
    () => toPdfCoords(selectedField, pageMeta),
    [selectedField, pageMeta]
  );

  const handleDocumentLoad = () => {
    setPdfError('');
  };

  // Extract page dimensions in points when page loads
  const handlePageLoad = (page) => {
    const [xMin, yMin, xMax, yMax] = page.view;
    setPageMeta({ widthPts: xMax - xMin, heightPts: yMax - yMin });
  };

  // Add a new field to the PDF - slightly offset each one so they don't stack
  const addField = (type) => {
    const id = crypto.randomUUID();
    setFields((prev) => [
      ...prev,
      {
        id,
        type,
        page: 1,
        xNorm: 0.12 + prev.length * 0.02,
        yNorm: 0.1 + prev.length * 0.02,
        widthNorm: type === 'signature' ? 0.32 : defaultBox.widthNorm,
        heightNorm: type === 'signature' ? 0.12 : defaultBox.heightNorm,
        value: type === 'date' ? dayjs().format('YYYY-MM-DD') : '',
      },
    ]);
    setSelectedId(id);
  };

  // Update field position - convert pixel coords to normalized (0-1)
  // This keeps fields anchored when PDF viewer resizes
  const updateFieldPosition = (id, { x, y }, renderHeight) => {
    setFields((prev) =>
      prev.map((f) =>
        f.id === id
          ? {
              ...f,
              xNorm: renderSize.width ? x / renderSize.width : 0,
              yNorm: renderHeight ? y / renderHeight : 0,
            }
          : f
      )
    );
  };

  // Update field size - also normalized for responsiveness
  const updateFieldSize = (id, { width, height }, renderHeight) => {
    setFields((prev) =>
      prev.map((f) =>
        f.id === id
          ? {
              ...f,
              widthNorm: renderSize.width ? width / renderSize.width : f.widthNorm,
              heightNorm: renderHeight ? height / renderHeight : f.heightNorm,
            }
          : f
      )
    );
  };

  const updateFieldValue = (id, value) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, value } : f)));
  };

  const clearSignature = () => {
    sigPadRef.current?.clear();
  };

  // Save the drawn signature as a data URL and attach to selected field
  const saveSignature = () => {
    if (!sigPadRef.current || sigPadRef.current.isEmpty() || !selectedField) return;
    updateFieldValue(selectedField.id, sigPadRef.current.toDataURL('image/png'));
  };

  // Download the signed PDF with a timestamped filename
  const handleDownload = async () => {
    if (!signedUrl) return;
    try {
      const response = await fetch(signedUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `signed-document-${dayjs().format('YYYY-MM-DD-HHmmss')}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      setStatus('Failed to download PDF');
    }
  };

  // Send all signatures to backend for burning into PDF
  const handleSign = async () => {
    setStatus('');
    setSignedUrl('');
    if (!pageMeta.widthPts || !pageMeta.heightPts) {
      setStatus('Load the PDF first.');
      return;
    }

    // Find all signature fields that have been filled in
    const signatureFields = fields.filter(
      (f) => f.type === 'signature' && f.value && f.page === 1
    );
    if (signatureFields.length === 0) {
      setStatus('Add a signature field and draw a signature.');
      return;
    }

    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:4000';

    try {
      setStatus(`Signing PDF with ${signatureFields.length} signature(s)...`);
      
      // Convert each signature field to the format backend expects
      const signatures = signatureFields.map((field) => ({
        signatureDataUrl: field.value,
        coordinates: toPdfCoords(field, pageMeta),
      }));

      const { data } = await axios.post(`${apiBase}/sign-pdf`, {
        pdfId: 'default',
        signatures,
      });
      setSignedUrl(data.signedUrl);
      setStatus('Success! Signed PDF ready.');
    } catch (error) {
      setStatus(error.response?.data?.message || error.message || 'Failed to sign');
    }
  };

  // Show appropriate label for each field type
  const renderLabel = (field) => {
    if (field.type === 'signature') return field.value ? 'Signed' : 'Signature';
    if (field.type === 'date') return field.value || 'Date';
    if (field.type === 'radio') return field.value ? 'Selected' : 'Radio';
    if (field.type === 'image') return field.value ? 'Image' : 'Image Box';
    return field.value || 'Text';
  };

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>BoloForms Signature</h1>
          <p className="subtitle">Digital document signing and field placement</p>
        </div>
        <div className="header-actions">
          <div className="status-indicator">
            <div className="status-content">
              <span className="status-label">Status:</span>
              <span className="status-value">{status || 'Idle'}</span>
              {signedUrl && (
                <a className="status-link" href={signedUrl} target="_blank" rel="noreferrer">
                  Open signed PDF
                </a>
              )}
            </div>
          </div>
          {signedUrl && (
            <button className="secondary" onClick={handleDownload}>
              Download PDF
            </button>
          )}
          <button className="primary" onClick={handleSign}>
            Burn Signature
          </button>
        </div>
      </header>

      <main className="layout">
        <aside className="sidebar">
          <h3>Fields</h3>
          <div className="palette">
            {fieldPalette.map((item) => (
              <button
                key={item.type}
                className="ghost"
                onClick={() => addField(item.type)}
              >
                + {item.label}
              </button>
            ))}
          </div>

          <div className="panel">
            <h4>Selected Field</h4>
            {selectedField ? (
              <>
                <p className="meta">Type: {selectedField.type}</p>
                {selectedField.type === 'text' && (
                  <textarea
                    value={selectedField.value}
                    placeholder="Enter text to overlay"
                    onChange={(e) => updateFieldValue(selectedField.id, e.target.value)}
                  />
                )}
                {selectedField.type === 'date' && (
                  <input
                    type="date"
                    value={selectedField.value}
                    onChange={(e) => updateFieldValue(selectedField.id, e.target.value)}
                  />
                )}
                {selectedField.type === 'radio' && (
                  <label className="radio-row">
                    <input
                      type="checkbox"
                      checked={!!selectedField.value}
                      onChange={(e) =>
                        updateFieldValue(selectedField.id, e.target.checked ? 'yes' : '')
                      }
                    />
                    Checked
                  </label>
                )}
                {selectedField.type === 'signature' && (
                  <div className="sig-pad">
                    <SignaturePad
                      ref={sigPadRef}
                      canvasProps={{ className: 'sig-canvas' }}
                      backgroundColor="#fff"
                      penColor="#111"
                    />
                    <div className="row">
                      <button className="ghost" onClick={clearSignature}>
                        Clear
                      </button>
                      <button className="primary ghost" onClick={saveSignature}>
                        Save Signature
                      </button>
                    </div>
                  </div>
                )}
                {selectedPdfCoords && (
                  <div className="coords">
                    <p>PDF Coordinates (pts)</p>
                    <code>
                      x: {selectedPdfCoords.x.toFixed(1)}, y:{' '}
                      {selectedPdfCoords.y.toFixed(1)}
                    </code>
                    <code>
                      w: {selectedPdfCoords.width.toFixed(1)}, h:{' '}
                      {selectedPdfCoords.height.toFixed(1)}
                    </code>
                  </div>
                )}
              </>
            ) : (
              <p className="meta">Select a field to edit</p>
            )}
          </div>

        </aside>

        <section className="canvas">
          <div className="page-shell" ref={pageWrapperRef}>
            <Document
              file={samplePdf}
              onLoadSuccess={handleDocumentLoad}
              onLoadError={(err) => setPdfError(err?.message || 'PDF failed to load')}
            >
              <Page
                pageNumber={1}
                onLoadSuccess={handlePageLoad}
                width={renderSize.width || undefined}
                height={
                  pageMeta.widthPts && renderSize.width
                    ? (renderSize.width * pageMeta.heightPts) / pageMeta.widthPts
                    : undefined
                }
              />
            </Document>
            {pdfError && <p className="error">{pdfError}</p>}
            {/* Overlay for draggable fields - positioned absolutely over PDF */}
            {renderSize.width > 0 && pageMeta.widthPts && pageMeta.heightPts && (
              <div
                className="overlay"
                style={{
                  width: renderSize.width,
                  height: (renderSize.width * pageMeta.heightPts) / pageMeta.widthPts,
                }}
              >
                {fields.map((field) => {
                  // Calculate actual pixel positions from normalized coords
                  const renderHeight =
                    (renderSize.width * pageMeta.heightPts) / pageMeta.widthPts;
                  const x = field.xNorm * renderSize.width;
                  const y = field.yNorm * renderHeight;
                  const width = field.widthNorm * renderSize.width;
                  const height = field.heightNorm * renderHeight;

                  return (
                    <Rnd
                      key={field.id}
                      bounds="parent"
                      size={{ width, height }}
                      position={{ x, y }}
                      onDragStop={(_, data) => updateFieldPosition(field.id, data, renderHeight)}
                      onResizeStop={(_, __, ___, delta, position) => {
                        updateFieldSize(
                          field.id,
                          {
                            width: width + delta.width,
                            height: height + delta.height,
                          },
                          renderHeight
                        );
                        updateFieldPosition(field.id, position, renderHeight);
                      }}
                      onClick={() => setSelectedId(field.id)}
                      className={`box ${selectedId === field.id ? 'active' : ''}`}
                    >
                      <span>{renderLabel(field)}</span>
                    </Rnd>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
