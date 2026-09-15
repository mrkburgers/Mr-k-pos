module.exports=function registerOwnerAccountsV2(app,io,db){
 db.exec(`
  CREATE TABLE IF NOT EXISTS owner_accounts (
   account_type TEXT PRIMARY KEY CHECK(account_type IN ('CASH','CARD','MOBILE MONEY')),
   opening_balance REAL NOT NULL DEFAULT 0,
   opening_balance_set INTEGER NOT NULL DEFAULT 0,
   created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
   updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS owner_account_transactions (
   id TEXT PRIMARY KEY,
   account_type TEXT NOT NULL,
   type TEXT NOT NULL CHECK(type IN ('IN','OUT')),
   amount REAL NOT NULL,
   description TEXT NOT NULL DEFAULT '',
   source TEXT NOT NULL DEFAULT 'MANUAL',
   reference TEXT NOT NULL DEFAULT '',
   created_at_ms INTEGER NOT NULL,
   created_by TEXT NOT NULL DEFAULT '',
   created_by_staff_id TEXT NOT NULL DEFAULT '',
   balance_after REAL,
   FOREIGN KEY(account_type) REFERENCES owner_accounts(account_type) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_owner_account_transactions_account
  ON owner_account_transactions(account_type,created_at_ms DESC);
 `);

 const insertAccount=db.prepare(`
  INSERT OR IGNORE INTO owner_accounts(account_type)
  VALUES(?)
 `);
 ['CASH','CARD','MOBILE MONEY'].forEach(type=>insertAccount.run(type));

 function number(value,fallback=0){
  const parsed=Number(value);
  return Number.isFinite(parsed)?parsed:fallback;