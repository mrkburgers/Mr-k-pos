const crypto=require("crypto");

function createCustomerAccountsDb(pool){
 async function init(){
  await pool.query(`
   CREATE TABLE IF NOT EXISTS customer_accounts(
    id UUID PRIMARY KEY,
    phone_e164 TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
   )
  `);

  await pool.query(`
   CREATE TABLE IF NOT EXISTS customer_addresses(
    id UUID PRIMARY KEY,
    customer_id UUID NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
    label TEXT NOT NULL DEFAULT '',
    address_text TEXT NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    delivery_zone_id TEXT,
    delivery_zone_name TEXT,
    delivery_fee_snapshot NUMERIC(12,2),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )
  `);

  await pool.query(`
   CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_addresses_one_default
   ON customer_addresses(customer_id)
   WHERE is_default=TRUE
  `);

  await pool.query(`
   CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer
   ON customer_addresses(customer_id,created_at DESC)
  `);

  await pool.query(`
   CREATE TABLE IF NOT EXISTS customer_otp_challenges(
    id UUID PRIMARY KEY,
    phone_e164 TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    code_salt TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'login',
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )
  `);

  await pool.query(`
   CREATE INDEX IF NOT EXISTS idx_customer_otp_phone_created
   ON customer_otp_challenges(phone_e164,created_at DESC)
  `);

  await pool.query(`
   CREATE TABLE IF NOT EXISTS customer_sessions(
    id UUID PRIMARY KEY,
    customer_id UUID NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )
  `);

  await pool.query(`
   CREATE INDEX IF NOT EXISTS idx_customer_sessions_customer
   ON customer_sessions(customer_id,created_at DESC)
  `);
 }

 function newId(){
  return crypto.randomUUID();
 }

 return {init,newId};
}

module.exports=createCustomerAccountsDb;
