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

 async function countRecentOtpRequests(phoneE164,minutes=10){
  const result=await pool.query(`
   SELECT COUNT(*)::int AS count
   FROM customer_otp_challenges
   WHERE phone_e164=$1
     AND created_at > NOW() - ($2::text || ' minutes')::interval
  `,[phoneE164,String(minutes)]);
  return Number(result.rows[0]?.count||0);
 }

 async function createOtpChallenge({phoneE164,codeHash,codeSalt,expiresAt,maxAttempts=5}){
  const id=newId();
  await pool.query(`
   INSERT INTO customer_otp_challenges(
    id,phone_e164,code_hash,code_salt,expires_at,max_attempts
   )
   VALUES($1,$2,$3,$4,$5,$6)
  `,[id,phoneE164,codeHash,codeSalt,expiresAt,maxAttempts]);
  return {id,phoneE164,expiresAt,maxAttempts};
 }

 async function getOtpChallenge(id,phoneE164){
  const result=await pool.query(`
   SELECT id,phone_e164,code_hash,code_salt,expires_at,attempts,max_attempts,consumed_at
   FROM customer_otp_challenges
   WHERE id=$1 AND phone_e164=$2
   LIMIT 1
  `,[id,phoneE164]);
  return result.rows[0]||null;
 }

 async function incrementOtpAttempts(id){
  await pool.query(`
   UPDATE customer_otp_challenges
   SET attempts=attempts+1
   WHERE id=$1
  `,[id]);
 }

 async function consumeOtpChallenge(id){
  await pool.query(`
   UPDATE customer_otp_challenges
   SET consumed_at=NOW()
   WHERE id=$1 AND consumed_at IS NULL
  `,[id]);
 }

 async function getOrCreateCustomer(phoneE164){
  const result=await pool.query(`
   INSERT INTO customer_accounts(id,phone_e164)
   VALUES($1,$2)
   ON CONFLICT(phone_e164)
   DO UPDATE SET updated_at=NOW(),deleted_at=NULL
   RETURNING id,phone_e164,name,created_at,updated_at
  `,[newId(),phoneE164]);
  return result.rows[0];
 }

 async function createSession(customerId,{tokenHash,expiresAt}){
  const id=newId();
  await pool.query(`
   INSERT INTO customer_sessions(id,customer_id,token_hash,expires_at)
   VALUES($1,$2,$3,$4)
  `,[id,customerId,tokenHash,expiresAt]);
  return {id,expiresAt};
 }

 return {
  init,
  newId,
  countRecentOtpRequests,
  createOtpChallenge,
  getOtpChallenge,
  incrementOtpAttempts,
  consumeOtpChallenge,
  getOrCreateCustomer,
  createSession
 };
}

module.exports=createCustomerAccountsDb;
