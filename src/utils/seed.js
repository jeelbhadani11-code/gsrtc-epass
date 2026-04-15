require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query, pool } = require('../config/db');

const seed = async () => {
  console.log('🌱 Seeding database...');

  try {
    // ── PASS TYPES ────────────────────────────────────────────
    const passTypes = [
      { name: 'Student Concession',  description: 'For enrolled students with valid ID',       base_amount: 150 },
      { name: 'Employee Monthly',    description: 'Monthly pass for working professionals',     base_amount: 200 },
      { name: 'Senior Citizen',      description: '50% concession for citizens aged 60+',       base_amount: 100 },
      { name: 'General Monthly',     description: 'Standard monthly bus pass',                  base_amount: 200 },
      { name: 'Physically Disabled', description: 'Special concession for differently-abled',   base_amount: 50  },
      { name: 'Freedom Fighter',     description: 'Complimentary pass for freedom fighters',     base_amount: 0   },
    ];

    for (const pt of passTypes) {
      await query(`
        INSERT INTO pass_types (name, description, base_amount)
        VALUES ($1, $2, $3)
        ON CONFLICT (name) DO NOTHING
      `, [pt.name, pt.description, pt.base_amount]);
    }
    console.log('  ✔ Pass types seeded');

    // ── VALIDITY OPTIONS ──────────────────────────────────────
    const validityOptions = [
      { label: '1 Month',   months: 1,  multiplier: 1.00 },
      { label: '3 Months',  months: 3,  multiplier: 2.75 },
      { label: '6 Months',  months: 6,  multiplier: 5.00 },
      { label: 'Annual',    months: 12, multiplier: 9.00 },
    ];

    for (const vo of validityOptions) {
      await query(`
        INSERT INTO validity_options (label, months, multiplier)
        VALUES ($1, $2, $3)
        ON CONFLICT (label) DO NOTHING
      `, [vo.label, vo.months, vo.multiplier]);
    }
    console.log('  ✔ Validity options seeded');

    // ── ADMIN USER ────────────────────────────────────────────
    const adminPassword = process.env.ADMIN_PASSWORD || 'gsrtc@2025';
    const adminHash = await bcrypt.hash(adminPassword, 12);

    await query(`
      INSERT INTO admins (username, email, password_hash, full_name, role)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (username) DO NOTHING
    `, [
      process.env.ADMIN_USERNAME || 'admin',
      process.env.ADMIN_EMAIL    || 'admin@gsrtc.gujarat.gov.in',
      adminHash,
      'GSRTC System Administrator',
      'superadmin',
    ]);
    console.log('  ✔ Admin user seeded');

    // ── DEMO USERS ────────────────────────────────────────────
    const demoUsers = [
      { name: 'Rahul Sharma', mobile: '9876543210', email: 'rahul@example.com', aadhaar: '123456789012', password: 'rahul123' },
      { name: 'Priya Patel',  mobile: '9812345678', email: 'priya@example.com', aadhaar: '234567890123', password: 'priya123' },
      { name: 'Kiran Modi',   mobile: '9988776655', email: 'kiran@example.com', aadhaar: '345678901234', password: 'kiran123' },
    ];

    const userIds = {};
    for (const u of demoUsers) {
      const hash = await bcrypt.hash(u.password, 10);
      const res = await query(`
        INSERT INTO users (name, mobile, email, aadhaar, password_hash)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (mobile) DO UPDATE SET name = EXCLUDED.name
        RETURNING id
      `, [u.name, u.mobile, u.email, u.aadhaar, hash]);
      userIds[u.mobile] = res.rows[0].id;
    }
    console.log('  ✔ Demo users seeded');

    // ── DEMO APPLICATIONS ─────────────────────────────────────
    const now = Date.now();
    const demoApps = [
      {
        id: 'GP-2025-08432', userId: userIds['9876543210'],
        name: 'Rahul Sharma', type: 'Student Concession', mobile: '9876543210',
        email: 'rahul@example.com', college: 'Silver Oak University',
        from: 'Ahmedabad', to: 'Gandhinagar', validity: '1 Month', amount: 150,
        status: 'Pending', submittedAt: new Date(now - 86400000 * 2),
      },
      {
        id: 'GP-2025-08431', userId: userIds['9812345678'],
        name: 'Priya Patel', type: 'Employee Monthly', mobile: '9812345678',
        email: 'priya@example.com', college: 'GSRTC',
        from: 'Surat', to: 'Vadodara', validity: '1 Month', amount: 200,
        status: 'Approved', submittedAt: new Date(now - 86400000 * 4),
      },
      {
        id: 'GP-2025-08430', userId: userIds['9988776655'],
        name: 'Kiran Modi', type: 'Senior Citizen', mobile: '9988776655',
        email: 'kiran@example.com', college: null,
        from: 'Rajkot', to: 'Ahmedabad', validity: '3 Months', amount: 275,
        status: 'Pending', submittedAt: new Date(now - 86400000 * 5),
      },
      {
        id: 'GP-2025-08429', userId: userIds['9876543210'],
        name: 'Rahul Sharma', type: 'Student Concession', mobile: '9876543210',
        email: 'rahul@example.com', college: 'GTU',
        from: 'Vadodara', to: 'Ahmedabad', validity: '1 Month', amount: 150,
        status: 'Rejected', submittedAt: new Date(now - 86400000 * 6),
      },
    ];

    for (const app of demoApps) {
      const validFrom  = app.status === 'Approved' ? new Date(app.submittedAt) : null;
      const validUntil = app.status === 'Approved'
        ? new Date(new Date(app.submittedAt).setMonth(new Date(app.submittedAt).getMonth() + 1))
        : null;

      await query(`
        INSERT INTO applications
          (id, user_id, applicant_name, pass_type, mobile, email, college_org,
           from_city, to_city, validity, amount, status, submitted_at, valid_from, valid_until)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        ON CONFLICT (id) DO NOTHING
      `, [
        app.id, app.userId, app.name, app.type, app.mobile, app.email,
        app.college, app.from, app.to, app.validity, app.amount,
        app.status, app.submittedAt, validFrom, validUntil,
      ]);
    }
    console.log('  ✔ Demo applications seeded');

    console.log('\n✅ Seeding complete!');
    console.log(`\n  Admin credentials:`);
    console.log(`    Username : ${process.env.ADMIN_USERNAME || 'admin'}`);
    console.log(`    Password : ${adminPassword}\n`);

  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    throw err;
  } finally {
    await pool.end();
  }
};

seed();
