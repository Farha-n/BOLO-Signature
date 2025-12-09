// Script to generate a sample contract PDF for testing
// Creates a service agreement with signature boxes
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function generateContract() {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([595.28, 842]); // A4 size in points (595.28 x 842)
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();
  const margin = 50;
  let yPos = pageHeight - margin; // Start from top

  // Title
  page.drawText('SERVICE AGREEMENT', {
    x: margin,
    y: yPos,
    size: 24,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  yPos -= 40;

  // Date - use current date
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  page.drawText(`Date: ${today}`, {
    x: margin,
    y: yPos,
    size: 11,
    font: font,
    color: rgb(0.3, 0.3, 0.3),
  });
  yPos -= 30;

  // Parties section - who's involved
  page.drawText('PARTIES', {
    x: margin,
    y: yPos,
    size: 14,
    font: boldFont,
  });
  yPos -= 20;

  page.drawText('Service Provider:', {
    x: margin,
    y: yPos,
    size: 11,
    font: boldFont,
  });
  yPos -= 16;
  page.drawText('[Service Provider Name]', {
    x: margin + 20,
    y: yPos,
    size: 11,
    font: font,
  });
  yPos -= 20;

  page.drawText('Client:', {
    x: margin,
    y: yPos,
    size: 11,
    font: boldFont,
  });
  yPos -= 16;
  page.drawText('[Client Name]', {
    x: margin + 20,
    y: yPos,
    size: 11,
    font: font,
  });
  yPos -= 30;

  // Terms section - standard contract clauses
  page.drawText('TERMS AND CONDITIONS', {
    x: margin,
    y: yPos,
    size: 14,
    font: boldFont,
  });
  yPos -= 20;

  const terms = [
    '1. Scope of Services: The Service Provider agrees to deliver the services as described in this agreement.',
    '2. Term: This agreement shall commence on the date of execution and continue until completion of services.',
    '3. Compensation: The Client agrees to pay the Service Provider according to the payment terms specified herein.',
    '4. Confidentiality: Both parties agree to maintain confidentiality of all proprietary information.',
    '5. Termination: Either party may terminate this agreement with 30 days written notice.',
    '6. Governing Law: This agreement shall be governed by the laws of the jurisdiction specified.',
  ];

  // Draw each term, add new page if we run out of space
  for (const term of terms) {
    if (yPos < 200) {
      const newPage = pdfDoc.addPage([595.28, 842]);
      yPos = pageHeight - margin;
      page = newPage;
    }
    page.drawText(term, {
      x: margin,
      y: yPos,
      size: 10,
      font: font,
      maxWidth: pageWidth - margin * 2,
    });
    yPos -= 18;
  }

  yPos -= 20;

  // Signature section - two boxes for both parties
  // Labels are above boxes to avoid text overlap
  page.drawText('SIGNATURES', {
    x: margin,
    y: yPos,
    size: 14,
    font: boldFont,
  });
  yPos -= 30;

  // Service Provider signature box (left side)
  const sigBoxWidth = 220;
  const sigBoxHeight = 80;
  const leftSigX = margin;
  const leftSigY = yPos - sigBoxHeight;

  page.drawText('Service Provider:', {
    x: leftSigX,
    y: yPos + 5,
    size: 10,
    font: boldFont,
  });

  page.drawRectangle({
    x: leftSigX,
    y: leftSigY,
    width: sigBoxWidth,
    height: sigBoxHeight,
    borderColor: rgb(0.5, 0.5, 0.5),
    borderWidth: 1,
  });

  // Client signature box (right side)
  const rightSigX = pageWidth - margin - sigBoxWidth;
  const rightSigY = leftSigY;

  page.drawText('Client:', {
    x: rightSigX,
    y: yPos + 5,
    size: 10,
    font: boldFont,
  });

  page.drawRectangle({
    x: rightSigX,
    y: rightSigY,
    width: sigBoxWidth,
    height: sigBoxHeight,
    borderColor: rgb(0.5, 0.5, 0.5),
    borderWidth: 1,
  });

  const pdfBytes = await pdfDoc.save();
  const outputPath = path.join(__dirname, 'sample.pdf');
  fs.writeFileSync(outputPath, pdfBytes);
  console.log(`Contract PDF generated at ${outputPath}`);
}

generateContract().catch(console.error);

