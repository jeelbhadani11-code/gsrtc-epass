require('dotenv').config();
const { query, pool } = require('../config/db');

const migrate = async () => {
  console.log('🔄 Running migrations...');

  try {
    // ── EXTENSIONS ────────────────────────────────────────────
    await query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
    await query(`CREATE EXTENSION IF NOT EXISTS "pg_trgm";`);

    // ── USERS TABLE ───────────────────────────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name          VARCHAR(120) NOT NULL,
        mobile        VARCHAR(10) UNIQUE NOT NULL,
        email         VARCHAR(255) UNIQUE,
        aadhaar       VARCHAR(12),
        password_hash VARCHAR(255) NOT NULL,
        photo_url     VARCHAR(500),
        is_active     BOOLEAN DEFAULT TRUE,
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // ── ADMINS TABLE ──────────────────────────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS admins (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        username      VARCHAR(60) UNIQUE NOT NULL,
        email         VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name     VARCHAR(120),
        role          VARCHAR(30) DEFAULT 'officer',
        is_active     BOOLEAN DEFAULT TRUE,
        last_login    TIMESTAMPTZ,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // ── PASS TYPES TABLE ──────────────────────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS pass_types (
        id            SERIAL PRIMARY KEY,
        name          VARCHAR(100) UNIQUE NOT NULL,
        description   TEXT,
        base_amount   NUMERIC(10,2) NOT NULL DEFAULT 0,
        is_active     BOOLEAN DEFAULT TRUE,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // ── VALIDITY OPTIONS TABLE ────────────────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS validity_options (
        id            SERIAL PRIMARY KEY,
        label         VARCHAR(50) UNIQUE NOT NULL,
        months        INTEGER NOT NULL,
        multiplier    NUMERIC(4,2) DEFAULT 1.00,
        is_active     BOOLEAN DEFAULT TRUE
      );
    `);

    // ── APPLICATIONS TABLE ────────────────────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS applications (
        id              VARCHAR(30) PRIMARY KEY,
        user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        applicant_name  VARCHAR(120) NOT NULL,
        pass_type       VARCHAR(100) NOT NULL,
        mobile          VARCHAR(10) NOT NULL,
        email           VARCHAR(255),
        college_org     VARCHAR(200),
        from_city       VARCHAR(100) NOT NULL,
        to_city         VARCHAR(100) NOT NULL,
        validity        VARCHAR(50) NOT NULL,
        amount          NUMERIC(10,2) NOT NULL DEFAULT 0,
        status          VARCHAR(20) NOT NULL DEFAULT 'Pending'
                          CHECK (status IN ('Pending','Approved','Rejected')),
        rejection_reason TEXT,
        reviewed_by     UUID REFERENCES admins(id),
        reviewed_at     TIMESTAMPTZ,
        pass_issued_at  TIMESTAMPTZ,
        valid_from      DATE,
        valid_until     DATE,
        document_url    VARCHAR(500),
        photo_url       VARCHAR(500),
        payment_status  VARCHAR(20) DEFAULT 'Unpaid' CHECK (payment_status IN ('Unpaid', 'Paid', 'Failed')),
        payment_txn_id  VARCHAR(100),
        submitted_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Ensure columns exist if table was already created
    await query(`
      ALTER TABLE applications 
      ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'Unpaid' CHECK (payment_status IN ('Unpaid', 'Paid', 'Failed')),
      ADD COLUMN IF NOT EXISTS payment_txn_id VARCHAR(100);
    `);

    // ── REFRESH TOKENS TABLE ─────────────────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
        admin_id    UUID REFERENCES admins(id) ON DELETE CASCADE,
        token       VARCHAR(512) UNIQUE NOT NULL,
        expires_at  TIMESTAMPTZ NOT NULL,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT one_of_user_or_admin CHECK (
          (user_id IS NOT NULL)::int + (admin_id IS NOT NULL)::int = 1
        )
      );
    `);

    // ── AUDIT LOGS TABLE ──────────────────────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        actor_type  VARCHAR(10) NOT NULL CHECK (actor_type IN ('user','admin')),
        actor_id    UUID NOT NULL,
        action      VARCHAR(100) NOT NULL,
        target_type VARCHAR(50),
        target_id   VARCHAR(100),
        meta        JSONB,
        ip_address  INET,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // ── INDEXES ───────────────────────────────────────────────
    await query(`CREATE INDEX IF NOT EXISTS idx_apps_user_id   ON applications(user_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_apps_status    ON applications(status);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_apps_submitted ON applications(submitted_at DESC);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_users_mobile   ON users(mobile);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_audit_actor    ON audit_logs(actor_id, created_at DESC);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_refresh_token  ON refresh_tokens(token);`);

    // ── AUTO UPDATE updated_at TRIGGER ───────────────────────
    await query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
      $$ language 'plpgsql';
    `);

    for (const tbl of ['users', 'applications']) {
      await query(`
        DROP TRIGGER IF EXISTS set_updated_at ON ${tbl};
        CREATE TRIGGER set_updated_at
          BEFORE UPDATE ON ${tbl}
          FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
      `);
    }

    console.log('✅ Migrations complete!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    throw err;
  } finally {
    await pool.end();
  }
};

migrate();
