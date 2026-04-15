const nodemailer = require('nodemailer');

let transporter = null;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST || 'smtp.gmail.com',
      port:   parseInt(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
};

const FROM = process.env.EMAIL_FROM || 'noreply@gsrtc.gujarat.gov.in';

// ── EMAIL TEMPLATES ──────────────────────────────────────────────────

const templates = {
  welcome: (user) => ({
    subject: 'Welcome to GSRTC E-Pass Portal 🎫',
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:auto">
        <div style="background:#E8541A;padding:20px;text-align:center;border-radius:8px 8px 0 0">
          <h1 style="color:#fff;margin:0">🚌 GSRTC E-Pass</h1>
          <p style="color:rgba(255,255,255,.8);margin:4px 0 0">Gujarat State Road Transport Corporation</p>
        </div>
        <div style="background:#f8fafc;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
          <h2 style="color:#0A1628">Welcome, ${user.name}! 👋</h2>
          <p style="color:#475569">Your account has been created successfully.</p>
          <p style="color:#475569">You can now apply for bus passes, track applications, and download your digital e-pass.</p>
          <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:20px 0">
            <p style="margin:0;color:#94a3b8;font-size:13px">Registered Mobile</p>
            <p style="margin:4px 0 0;color:#0A1628;font-weight:700;font-size:16px">${user.mobile}</p>
          </div>
          <p style="color:#94a3b8;font-size:13px;margin-top:24px">
            This is an automated message from GSRTC E-Pass Portal. Do not reply to this email.
          </p>
        </div>
      </div>
    `,
  }),

  applicationSubmitted: (app) => ({
    subject: `Application Submitted — ${app.id} | GSRTC E-Pass`,
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:auto">
        <div style="background:#E8541A;padding:20px;text-align:center;border-radius:8px 8px 0 0">
          <h1 style="color:#fff;margin:0">📨 Application Received</h1>
        </div>
        <div style="background:#f8fafc;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
          <h2 style="color:#0A1628">Hi ${app.applicant_name},</h2>
          <p style="color:#475569">Your e-pass application has been received.</p>
          <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:20px 0">
            <table style="width:100%;font-size:14px;color:#475569">
              <tr><td>Application ID</td><td style="color:#E8541A;font-weight:700;font-family:monospace">${app.id}</td></tr>
              <tr><td>Pass Type</td><td>${app.pass_type}</td></tr>
              <tr><td>Route</td><td>${app.from_city} → ${app.to_city}</td></tr>
              <tr><td>Validity</td><td>${app.validity}</td></tr>
              <tr><td>Amount</td><td>₹${app.amount}</td></tr>
              <tr><td>Status</td><td><span style="color:#F59E0B;font-weight:700">⏳ Pending Review</span></td></tr>
            </table>
          </div>
          <p style="color:#475569">We will review your application within 24 hours and notify you by email.</p>
        </div>
      </div>
    `,
  }),

  applicationApproved: (app) => ({
    subject: `✅ Pass Approved — ${app.id} | GSRTC E-Pass`,
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:auto">
        <div style="background:#10B981;padding:20px;text-align:center;border-radius:8px 8px 0 0">
          <h1 style="color:#fff;margin:0">✅ Pass Approved!</h1>
        </div>
        <div style="background:#f8fafc;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
          <h2 style="color:#0A1628">Congratulations, ${app.applicant_name}!</h2>
          <p style="color:#475569">Your GSRTC bus pass has been approved and is ready to download.</p>
          <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:20px 0">
            <table style="width:100%;font-size:14px;color:#475569">
              <tr><td>Pass ID</td><td style="color:#10B981;font-weight:700;font-family:monospace">${app.id}</td></tr>
              <tr><td>Route</td><td>${app.from_city} → ${app.to_city}</td></tr>
              <tr><td>Valid From</td><td>${new Date(app.valid_from).toLocaleDateString('en-IN')}</td></tr>
              <tr><td>Valid Until</td><td>${new Date(app.valid_until).toLocaleDateString('en-IN')}</td></tr>
            </table>
          </div>
          <p style="color:#475569">Login to the GSRTC E-Pass portal to download your digital pass.</p>
        </div>
      </div>
    `,
  }),

  applicationRejected: (app) => ({
    subject: `❌ Application Rejected — ${app.id} | GSRTC E-Pass`,
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:auto">
        <div style="background:#EF4444;padding:20px;text-align:center;border-radius:8px 8px 0 0">
          <h1 style="color:#fff;margin:0">❌ Application Rejected</h1>
        </div>
        <div style="background:#f8fafc;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
          <h2 style="color:#0A1628">Hi ${app.applicant_name},</h2>
          <p style="color:#475569">Unfortunately, your application <strong style="font-family:monospace">${app.id}</strong> has been rejected.</p>
          ${app.rejection_reason ? `
          <div style="background:#fff3f3;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:20px 0">
            <p style="margin:0;color:#dc2626;font-size:14px"><strong>Reason:</strong> ${app.rejection_reason}</p>
          </div>` : ''}
          <p style="color:#475569">You may submit a new application with corrected information.</p>
        </div>
      </div>
    `,
  }),
};

// ── SEND FUNCTION ────────────────────────────────────────────────────

const sendEmail = async (to, templateName, data) => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(`📧 [Email skipped — SMTP not configured] To: ${to}, Template: ${templateName}`);
    return { skipped: true };
  }
  try {
    const tpl      = templates[templateName](data);
    const info     = await getTransporter().sendMail({
      from:    `"GSRTC E-Pass" <${FROM}>`,
      to,
      subject: tpl.subject,
      html:    tpl.html,
    });
    console.log(`📧 Email sent to ${to} [${templateName}] — ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error('📧 Email send failed:', err.message);
    return { success: false, error: err.message };
  }
};

module.exports = { sendEmail };
