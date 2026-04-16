const { query } = require('../config/db');
const { notFound, serverError, forbidden } = require('../utils/response');
const { formatDateIN } = require('../utils/helpers');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

/**
 * Generate a printable HTML e-pass and return as PDF
 * GET /api/passes/:appId/download
 */
const downloadPass = async (req, res) => {
  try {
    const { appId } = req.params;

    // Fetch app — user can only download their own
    const appRes = await query(
      `SELECT a.*, u.name as holder_name, u.mobile as holder_mobile, u.email as holder_email
       FROM applications a
       JOIN users u ON a.user_id = u.id
       WHERE a.id = $1`,
      [appId]
    );

    if (!appRes.rows.length) return notFound(res, 'Application not found');
    const app = appRes.rows[0];

    // Allow user who owns it or any admin
    const isAdmin = req.user.type === 'admin';
    const isOwner = req.user.type === 'user' && app.user_id === req.user.id;
    if (!isAdmin && !isOwner) return forbidden(res, 'Access denied');

    if (app.status !== 'Approved') {
      return res.status(400).json({ success: false, message: 'Pass is not approved yet' });
    }

    // Generate PDF using pdf-lib (works in serverless environments)
    try {
      const pdf = await buildPassPdf(app);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="GSRTC-EPass-${appId}.pdf"`);
      return res.send(Buffer.from(pdf));
    } catch (pdfErr) {
      console.warn('⚠️  PDF generation failed, serving HTML pass:', pdfErr.message);
      const html = buildPassHTML(app);
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Disposition', `inline; filename="GSRTC-EPass-${appId}.html"`);
      return res.send(html);
    }
  } catch (err) {
    return serverError(res, err, 'downloadPass');
  }
};

// ── HTML PASS TEMPLATE ─────────────────────────────────────────────────
function buildPassHTML(app) {
  const barcode = generateFakeBarcode(app.id);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>GSRTC E-Pass — ${app.id}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@600;700&family=Noto+Sans:wght@400;500;600&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Noto Sans',sans-serif;background:#f1f5f9;display:flex;justify-content:center;padding:20px;min-height:100vh;align-items:flex-start}
    .card{background:linear-gradient(145deg,#1d3f72 0%,#0d1f40 100%);border-radius:20px;padding:28px;width:380px;color:#fff;box-shadow:0 30px 80px rgba(0,0,0,.4);position:relative;overflow:hidden}
    .card::before{content:'';position:absolute;top:-40%;right:-15%;width:280px;height:280px;background:radial-gradient(circle,rgba(232,84,26,.12) 0%,transparent 70%);pointer-events:none}
    .hd{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;position:relative;z-index:1}
    .logo{display:flex;align-items:center;gap:10px}
    .logo-box{width:38px;height:38px;background:#E8541A;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:1.3rem}
    .logo-txt h2{font-family:'Rajdhani',sans-serif;font-size:1rem;font-weight:700;letter-spacing:1px}
    .logo-txt p{font-size:.62rem;color:rgba(255,255,255,.5)}
    .badge{background:rgba(16,185,129,.15);border:1px solid rgba(16,185,129,.35);color:#34d399;padding:4px 12px;border-radius:100px;font-size:.7rem;font-weight:700}
    .photo-row{display:flex;gap:14px;align-items:flex-start;margin-bottom:18px;position:relative;z-index:1}
    .avatar{width:70px;height:70px;border-radius:12px;background:linear-gradient(135deg,#2257B5,#1A3A6B);display:flex;align-items:center;justify-content:center;font-size:2rem;border:2px solid rgba(255,255,255,.12);flex-shrink:0}
    .holder-name{font-family:'Rajdhani',sans-serif;font-size:1.3rem;font-weight:700;margin-bottom:4px}
    .meta{font-size:.72rem;color:rgba(255,255,255,.55);line-height:1.9}
    .meta strong{color:rgba(255,255,255,.75)}
    hr{border:none;border-top:1px dashed rgba(255,255,255,.12);margin:14px 0;position:relative;z-index:1}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;position:relative;z-index:1}
    .field label{display:block;font-size:.6rem;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px}
    .field span{font-size:.8rem;font-weight:600}
    .route{display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,.05);border-radius:10px;padding:12px 14px;margin-bottom:14px;position:relative;z-index:1}
    .city-lbl{font-size:.58rem;color:rgba(255,255,255,.35);margin-bottom:2px;text-transform:uppercase;letter-spacing:.5px}
    .city-name{font-size:.95rem;font-weight:700}
    .arrow{color:#E8541A;font-size:1.4rem}
    .barcode-row{background:rgba(255,255,255,.05);border-radius:10px;padding:12px;display:flex;align-items:center;gap:12px;position:relative;z-index:1}
    .bars{display:flex;gap:2px;align-items:center;height:38px}
    .bars span{display:block;width:2px;background:rgba(255,255,255,.75);border-radius:1px}
    .barcode-info p{font-size:.62rem;color:rgba(255,255,255,.4);margin-bottom:3px}
    .barcode-info code{font-size:.73rem;color:#F5A623;letter-spacing:1px;font-weight:600}
    .footer{margin-top:16px;text-align:center;font-size:.62rem;color:rgba(255,255,255,.25);position:relative;z-index:1}
    @media print{body{background:none;padding:0}.card{box-shadow:none}}
  </style>
</head>
<body>
<div class="card">
  <div class="hd">
    <div class="logo">
      <div class="logo-box">🚌</div>
      <div class="logo-txt">
        <h2>GSRTC E-PASS</h2>
        <p>Gujarat State Road Transport Corporation</p>
      </div>
    </div>
    <div class="badge">✅ APPROVED</div>
  </div>

  <div class="photo-row">
    <div class="avatar">👤</div>
    <div>
      <div class="holder-name">${app.applicant_name}</div>
      <div class="meta">
        <strong>Mobile:</strong> ${app.mobile}<br>
        ${app.email ? `<strong>Email:</strong> ${app.email}<br>` : ''}
        ${app.college_org && app.college_org !== '—' ? `<strong>Org:</strong> ${app.college_org}<br>` : ''}
        <strong>Pass ID:</strong> <code style="color:#F5A623;font-size:.7rem">${app.id}</code>
      </div>
    </div>
  </div>

  <hr/>

  <div class="route">
    <div><div class="city-lbl">From</div><div class="city-name">${app.from_city}</div></div>
    <div class="arrow">⟶</div>
    <div><div class="city-lbl">To</div><div class="city-name">${app.to_city}</div></div>
  </div>

  <div class="grid">
    <div class="field"><label>Pass Type</label><span>${app.pass_type}</span></div>
    <div class="field"><label>Validity</label><span>${app.validity}</span></div>
    <div class="field"><label>Valid From</label><span>${formatDateIN(app.valid_from)}</span></div>
    <div class="field"><label>Valid Until</label><span>${formatDateIN(app.valid_until)}</span></div>
    <div class="field"><label>Amount Paid</label><span>₹${app.amount}</span></div>
    <div class="field"><label>Issued On</label><span>${formatDateIN(app.pass_issued_at || app.reviewed_at)}</span></div>
  </div>

  <div class="barcode-row">
    <div class="bars">${barcode}</div>
    <div class="barcode-info">
      <p>Scan to verify pass</p>
      <code>${app.id}</code>
    </div>
  </div>

  <div class="footer">
    This is a digitally issued pass. Valid only with GSRTC buses on the specified route.<br>
    Gujarat State Road Transport Corporation • Sardar Patel Bhavan, Ahmedabad
  </div>
</div>
</body>
</html>`;
}

function generateFakeBarcode(seed) {
  const heights = [28, 20, 36, 16, 38, 22, 14, 32, 26, 18, 36, 14, 28, 22, 38, 16, 30, 24, 20, 36, 18, 28, 14, 32, 26];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash) + seed.charCodeAt(i);
  return heights.map((h, i) => {
    const style = `height:${h + (Math.abs(hash + i * 7) % 8)}px`;
    return `<span style="${style}"></span>`;
  }).join('');
}

async function buildPassPdf(app) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([420, 595]);
  const { width, height } = page.getSize();
  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const orange = rgb(0.91, 0.33, 0.1);
  const navy = rgb(0.05, 0.12, 0.25);
  const gold = rgb(0.96, 0.65, 0.14);
  const white = rgb(1, 1, 1);
  const muted = rgb(0.77, 0.81, 0.88);

  page.drawRectangle({ x: 20, y: 20, width: width - 40, height: height - 40, color: navy });
  page.drawRectangle({ x: 20, y: height - 78, width: width - 40, height: 58, color: orange });
  page.drawText('GSRTC E-PASS', { x: 36, y: height - 58, size: 20, font: fontBold, color: white });
  page.drawText('Gujarat State Road Transport Corporation', { x: 36, y: height - 74, size: 9, font: fontRegular, color: white });
  page.drawText('APPROVED', { x: width - 116, y: height - 58, size: 11, font: fontBold, color: white });

  page.drawRectangle({ x: 36, y: height - 162, width: 64, height: 64, color: rgb(0.12, 0.25, 0.48) });
  page.drawText('PHOTO', { x: 49, y: height - 128, size: 12, font: fontBold, color: white });

  page.drawText(app.applicant_name, { x: 118, y: height - 114, size: 18, font: fontBold, color: white });
  page.drawText(`Pass ID: ${app.id}`, { x: 118, y: height - 134, size: 10, font: fontRegular, color: gold });
  page.drawText(`Mobile: ${app.mobile}`, { x: 118, y: height - 150, size: 10, font: fontRegular, color: muted });
  if (app.email) {
    page.drawText(`Email: ${app.email}`, { x: 118, y: height - 166, size: 10, font: fontRegular, color: muted });
  }
  if (app.college_org) {
    page.drawText(`Org: ${app.college_org}`, { x: 118, y: height - 182, size: 10, font: fontRegular, color: muted });
  }

  const infoStartY = height - 240;
  const labelSize = 9;
  const valueSize = 12;
  const fields = [
    ['Route', `${app.from_city} -> ${app.to_city}`],
    ['Pass Type', app.pass_type],
    ['Validity', app.validity],
    ['Valid From', formatDateIN(app.valid_from)],
    ['Valid Until', formatDateIN(app.valid_until)],
    ['Amount', `Rs ${app.amount}`],
    ['Issued On', formatDateIN(app.pass_issued_at || app.reviewed_at)],
  ];

  fields.forEach(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = 36 + column * 180;
    const y = infoStartY - row * 58;
    page.drawText(label.toUpperCase(), { x, y, size: labelSize, font: fontBold, color: muted });
    page.drawText(String(value), { x, y: y - 18, size: valueSize, font: fontRegular, color: white });
  });

  page.drawRectangle({ x: 36, y: 84, width: width - 72, height: 70, color: rgb(0.1, 0.17, 0.31) });
  page.drawText('Scan / verify pass', { x: 52, y: 132, size: 10, font: fontRegular, color: muted });
  page.drawText(app.id, { x: 52, y: 112, size: 14, font: fontBold, color: gold });

  let cursorX = 210;
  const heights = [34, 18, 38, 14, 30, 26, 40, 16, 32, 22, 36, 14, 28, 34, 20, 38];
  heights.forEach((barHeight, index) => {
    page.drawRectangle({
      x: cursorX + index * 6,
      y: 96,
      width: index % 3 === 0 ? 3 : 2,
      height: barHeight,
      color: white,
    });
  });

  page.drawText('This digitally issued pass is valid only on the approved GSRTC route.', {
    x: 36,
    y: 48,
    size: 9,
    font: fontRegular,
    color: muted,
  });

  return pdf.save();
}

module.exports = { downloadPass };
