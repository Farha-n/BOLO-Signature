import { useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Rnd } from 'react-rnd';
import SignaturePad from 'react-signature-canvas';
import dayjs from 'dayjs';
import axios from 'axios';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import './App.css';

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

const samplePdf = '/sample.pdf';

const fieldPalette = [
  { type: 'signature', label: 'Signature' },
  { type: 'text', label: 'Text Box' },
  { type: 'image', label: 'Image Box' },
  { type: 'date', label: 'Date' },
  { type: 'radio', label: 'Radio' },
];

const defaultBox = {
  widthNorm: 0.24,
  heightNorm: 0.08,
};

// Convert normalized top-left DOM coords into PDF points (origin bottom-left)
const toPdfCoords = (field, pageMeta) => {
  if (!field || !pageMeta?.widthPts || !pageMeta?.heightPts) return null;
  const x = field.xNorm * pageMeta.widthPts;
  const yTop = field.yNorm * pageMeta.heightPts;
  const height = field.heightNorm * pageMeta.heightPts;

  return {
    page: field.page,
    x,
    y: pageMeta.heightPts - yTop - height, // flip from top-left (DOM) to bottom-left (PDF)
    width: field.widthNorm * pageMeta.widthPts,
    height,
    pageWidth: pageMeta.widthPts,
    pageHeight: pageMeta.heightPts,
  };
};

function App() {
  const [numPages, setNumPages] = useState(null);
  const [pageMeta, setPageMeta] = useState({ widthPts: null, heightPts: null });
  const [renderSize, setRenderSize] = useState({ width: 0 });
  const [fields, setFields] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [signedUrl, setSignedUrl] = useState('');
  const [status, setStatus] = useState('');
  const [pdfError, setPdfError] = useState('');
  const sigPadRef = useRef(null);
  const pageWrapperRef = useRef(null);

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

  const handleDocumentLoad = ({ numPages: total }) => {
    setNumPages(total);
    setPdfError('');
  };

  const handlePageLoad = (page) => {
    const [xMin, yMin, xMax, yMax] = page.view;
    setPageMeta({ widthPts: xMax - xMin, heightPts: yMax - yMin });
  };

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

  const saveSignature = () => {
    if (!sigPadRef.current || sigPadRef.current.isEmpty() || !selectedField) return;
    updateFieldValue(selectedField.id, sigPadRef.current.toDataURL('image/png'));
  };

  const handleSign = async () => {
    setStatus('');
    setSignedUrl('');
    if (!pageMeta.widthPts || !pageMeta.heightPts) {
      setStatus('Load the PDF first.');
      return;
    }

    const signatureField = fields.find(
      (f) => f.type === 'signature' && f.value && f.page === 1
    );
    if (!signatureField) {
      setStatus('Add a signature field and draw a signature.');
      return;
    }

    const coords = toPdfCoords(signatureField, pageMeta);
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:4000';

    try {
      setStatus('Signing PDF...');
      const { data } = await axios.post(`${apiBase}/sign-pdf`, {
        pdfId: 'default',
        signatureDataUrl: signatureField.value,
        coordinates: coords,
      });
      setSignedUrl(data.signedUrl);
      setStatus('Success! Signed PDF ready below.');
    } catch (error) {
      setStatus(error.response?.data?.message || error.message || 'Failed to sign');
    }
  };

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
          <h1>BoloForms Signature Injection Prototype</h1>
          <p className="subtitle">
            Drag, resize, and anchor fields. Coordinates stay stable across viewports.
          </p>
        </div>
        <button className="primary" onClick={handleSign}>
          Burn Signature
        </button>
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

          <div className="panel status">
            <h4>Status</h4>
            <p className="meta">{status || 'Idle'}</p>
            {signedUrl && (
              <a className="link" href={signedUrl} target="_blank" rel="noreferrer">
                Open signed PDF
              </a>
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
            {renderSize.width > 0 && pageMeta.widthPts && pageMeta.heightPts && (
              <div
                className="overlay"
                style={{
                  width: renderSize.width,
                  height: (renderSize.width * pageMeta.heightPts) / pageMeta.widthPts,
                }}
              >
                {fields.map((field) => {
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
