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

 async function getCustomerBySessionTokenHash(tokenHash){
  const result=await pool.query(`
   SELECT
    s.id AS session_id,
    s.expires_at,
    c.id,
    c.phone_e164,
    c.name,
    c.created_at,
    c.updated_at
   FROM customer_sessions s
   JOIN customer_accounts c ON c.id=s.customer_id
   WHERE s.token_hash=$1
     AND s.revoked_at IS NULL
     AND s.expires_at>NOW()
     AND c.deleted_at IS NULL
   LIMIT 1
  `,[tokenHash]);

  const row=result.rows[0];
  if(!row)return null;

  await pool.query(`
   UPDATE customer_sessions
   SET last_seen_at=NOW()
   WHERE id=$1
  `,[row.session_id]);

  return row;
 }

 async function updateCustomerName(customerId,name){
  const result=await pool.query(`
   UPDATE customer_accounts
   SET name=$2,updated_at=NOW()
   WHERE id=$1 AND deleted_at IS NULL
   RETURNING id,phone_e164,name,created_at,updated_at
  `,[customerId,name]);
  return result.rows[0]||null;
 }

 async function listAddresses(customerId){
  const result=await pool.query(`
   SELECT id,label,address_text,latitude,longitude,
          delivery_zone_id,delivery_zone_name,delivery_fee_snapshot,
          is_default,created_at,updated_at
   FROM customer_addresses
   WHERE customer_id=$1
   ORDER BY is_default DESC,created_at ASC
  `,[customerId]);
  return result.rows;
 }

 async function addAddress(customerId,address){
  const id=newId();
  const client=await pool.connect();
  try{
   await client.query("BEGIN");
   const countResult=await client.query(
    "SELECT COUNT(*)::int AS count FROM customer_addresses WHERE customer_id=$1",
    [customerId]
   );
   const makeDefault=Boolean(address.isDefault)||Number(countResult.rows[0]?.count||0)===0;
   if(makeDefault){
    await client.query(
     "UPDATE customer_addresses SET is_default=FALSE,updated_at=NOW() WHERE customer_id=$1",
     [customerId]
    );
   }
   const result=await client.query(`
    INSERT INTO customer_addresses(
     id,customer_id,label,address_text,latitude,longitude,is_default
    )
    VALUES($1,$2,$3,$4,$5,$6,$7)
    RETURNING id,label,address_text,latitude,longitude,
              delivery_zone_id,delivery_zone_name,delivery_fee_snapshot,
              is_default,created_at,updated_at
   `,[
    id,customerId,address.label,address.addressText,
    address.latitude,address.longitude,makeDefault
   ]);
   await client.query("COMMIT");
   return result.rows[0];
  }catch(error){
   await client.query("ROLLBACK");
   throw error;
  }finally{
   client.release();
  }
 }

 async function updateAddress(customerId,addressId,address){
  const client=await pool.connect();
  try{
   await client.query("BEGIN");
   if(address.isDefault===true){
    await client.query(
     "UPDATE customer_addresses SET is_default=FALSE,updated_at=NOW() WHERE customer_id=$1 AND id<>$2",
     [customerId,addressId]
    );
   }
   const result=await client.query(`
    UPDATE customer_addresses
    SET label=$3,
        address_text=$4,
        latitude=$5,
        longitude=$6,
        is_default=CASE WHEN $7::boolean THEN TRUE ELSE is_default END,
        updated_at=NOW()
    WHERE id=$2 AND customer_id=$1
    RETURNING id,label,address_text,latitude,longitude,
              delivery_zone_id,delivery_zone_name,delivery_fee_snapshot,
              is_default,created_at,updated_at
   `,[
    customerId,addressId,address.label,address.addressText,
    address.latitude,address.longitude,Boolean(address.isDefault)
   ]);
   await client.query("COMMIT");
   return result.rows[0]||null;
  }catch(error){
   await client.query("ROLLBACK");
   throw error;
  }finally{
   client.release();
  }
 }

 async function deleteAddress(customerId,addressId){
  const client=await pool.connect();
  try{
   await client.query("BEGIN");
   const deleted=await client.query(`
    DELETE FROM customer_addresses
    WHERE id=$2 AND customer_id=$1
    RETURNING id,is_default
   `,[customerId,addressId]);
   if(!deleted.rows[0]){
    await client.query("ROLLBACK");
    return false;
   }
   if(deleted.rows[0].is_default){
    await client.query(`
     UPDATE customer_addresses
     SET is_default=TRUE,updated_at=NOW()
     WHERE id=(
      SELECT id FROM customer_addresses
      WHERE customer_id=$1
      ORDER BY created_at ASC
      LIMIT 1
     )
    `,[customerId]);
   }
   await client.query("COMMIT");
   return true;
  }catch(error){
   await client.query("ROLLBACK");
   throw error;
  }finally{
   client.release();
  }
 }

 async function setDefaultAddress(customerId,addressId){
  const client=await pool.connect();
  try{
   await client.query("BEGIN");
   const exists=await client.query(
    "SELECT id FROM customer_addresses WHERE id=$2 AND customer_id=$1",
    [customerId,addressId]
   );
   if(!exists.rows[0]){
    await client.query("ROLLBACK");
    return null;
   }
   await client.query(
    "UPDATE customer_addresses SET is_default=FALSE,updated_at=NOW() WHERE customer_id=$1",
    [customerId]
   );
   const result=await client.query(`
    UPDATE customer_addresses
    SET is_default=TRUE,updated_at=NOW()
    WHERE id=$2 AND customer_id=$1
    RETURNING id,label,address_text,latitude,longitude,
              delivery_zone_id,delivery_zone_name,delivery_fee_snapshot,
              is_default,created_at,updated_at
   `,[customerId,addressId]);
   await client.query("COMMIT");
   return result.rows[0]||null;
  }catch(error){
   await client.query("ROLLBACK");
   throw error;
  }finally{
   client.release();
  }
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
  createSession,
  getCustomerBySessionTokenHash,
  updateCustomerName,
  listAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress
 };
}

module.exports=createCustomerAccountsDb;
