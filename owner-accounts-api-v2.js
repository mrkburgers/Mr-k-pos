const createSecurityAuthV2=require("./security-auth-v2");

module.exports=function registerOwnerAccountsV2(app,io,db){
 const ownerOnly=createSecurityAuthV2().requireRole("owner");

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
 }

 function authoritativeRows(type){
  const account=db.prepare(`
   SELECT opening_balance
   FROM owner_accounts WHERE account_type=?
  `).get(type);
  const rows=db.prepare(`
   SELECT id,type,amount,description,source,reference,created_at_ms,
          created_by,created_by_staff_id
   FROM owner_account_transactions
   WHERE account_type=?
   ORDER BY created_at_ms ASC,id ASC
  `).all(type);
  let running=number(account?.opening_balance);
  const mapped=rows.map(row=>{
   running+=row.type==='IN'?number(row.amount):-number(row.amount);
   return {...row,balance_after:running};
  });
  return {rows:mapped,balance:running};
 }

 function accountState(type){
  const account=db.prepare(`
   SELECT account_type,opening_balance,opening_balance_set
   FROM owner_accounts WHERE account_type=?
  `).get(type);
  const authoritative=authoritativeRows(type);
  return {
   balance:authoritative.balance,
   transactions:[...authoritative.rows].reverse().map(row=>({
    id:row.id,
    type:row.type,
    amount:number(row.amount),
    description:row.description||'',
    source:row.source||'MANUAL',
    reference:row.reference||'',
    createdAt:Number(row.created_at_ms),
    createdBy:row.created_by||'',
    createdByStaffId:row.created_by_staff_id||'',
    balanceAfter:number(row.balance_after)
   })),
   openingBalanceSet:Boolean(account?.opening_balance_set)
  };
 }

 function fullState(){
  return {
   cash:accountState('CASH'),
   card:accountState('CARD'),
   mobileMoney:accountState('MOBILE MONEY')
  };
 }

 function signedTotal(transactions){
  return transactions.reduce((sum,transaction)=>{
   const amount=number(transaction?.amount);
   return sum+(transaction?.type==='OUT'?-amount:amount);
  },0);
 }

 function referenceDay(transaction){
  const createdAt=Number(transaction?.createdAt);
  if(!Number.isFinite(createdAt))return 'unknown-day';
  const date=new Date(createdAt);
  if(Number.isNaN(date.getTime()))return 'unknown-day';
  return date.toISOString().slice(0,10);
 }

 function dedupeTransactions(transactions){
  const seenIds=new Set();
  const seenReferences=new Set();
  return transactions.filter(transaction=>{
   const id=String(transaction?.id||'').trim();
   if(id&&seenIds.has(id))return false;
   if(id)seenIds.add(id);

   const source=String(transaction?.source||'MANUAL');
   const reference=String(transaction?.reference||'').trim();
   if(reference){
    const key=`${source}\u0000${reference}\u0000${referenceDay(transaction)}`;
    if(seenReferences.has(key))return false;
    seenReferences.add(key);
   }
   return true;
  });
 }

 function replaceAccount(type,state,{setOpeningOffset=false}={}){
  const transactions=dedupeTransactions(Array.isArray(state?.transactions)?state.transactions:[]);
  if(setOpeningOffset){
   const desiredBalance=number(state?.balance);
   const openingOffset=desiredBalance-signedTotal(transactions);
   db.prepare(`
    UPDATE owner_accounts
    SET opening_balance=?,opening_balance_set=?,updated_at=CURRENT_TIMESTAMP
    WHERE account_type=?
   `).run(
    openingOffset,
    state?.openingBalanceSet===true?1:0,
    type
   );
  }else{
   db.prepare(`
    UPDATE owner_accounts
    SET opening_balance_set=?,updated_at=CURRENT_TIMESTAMP
    WHERE account_type=?
   `).run(state?.openingBalanceSet===true?1:0,type);
  }

  db.prepare('DELETE FROM owner_account_transactions WHERE account_type=?').run(type);
  const insert=db.prepare(`
   INSERT INTO owner_account_transactions(
    id,account_type,type,amount,description,source,reference,created_at_ms,
    created_by,created_by_staff_id,balance_after
   ) VALUES(?,?,?,?,?,?,?,?,?,?,NULL)
  `);
  transactions.forEach((transaction,index)=>{
   const amount=number(transaction?.amount);
   if(amount<=0)return;
   const movementType=transaction?.type==='OUT'?'OUT':'IN';
   const createdAt=Number(transaction?.createdAt);
   const id=String(transaction?.id||`${type.toLowerCase().replace(/\s+/g,'-')}-${createdAt||Date.now()}-${index}`);
   insert.run(
    id,type,movementType,amount,
    String(transaction?.description||''),
    String(transaction?.source||'MANUAL'),
    String(transaction?.reference||''),
    Number.isFinite(createdAt)?createdAt:Date.now()+index,
    String(transaction?.createdBy||''),
    String(transaction?.createdByStaffId||'')
   );
  });
 }

 function backendIsEmpty(){
  const count=db.prepare('SELECT COUNT(*) AS count FROM owner_account_transactions').get().count;
  const flagged=db.prepare('SELECT COUNT(*) AS count FROM owner_accounts WHERE opening_balance_set=1 OR opening_balance<>0').get().count;
  return Number(count)===0&&Number(flagged)===0;
 }

 app.get('/api/owner-accounts',ownerOnly,(req,res)=>{
  res.json(fullState());
 });

 app.post('/api/owner-accounts/import-if-empty',ownerOnly,(req,res)=>{
  if(!backendIsEmpty()){
   return res.json({imported:false,state:fullState()});
  }
  const payload=req.body||{};
  db.transaction(()=>{
   replaceAccount('CASH',payload.cash||{}, {setOpeningOffset:true});
   replaceAccount('CARD',payload.card||{}, {setOpeningOffset:true});
   replaceAccount('MOBILE MONEY',payload.mobileMoney||{}, {setOpeningOffset:true});
  })();
  io.emit('owner-accounts-changed',{});
  res.json({imported:true,state:fullState()});
 });

 app.put('/api/owner-accounts/state',ownerOnly,(req,res)=>{
  const payload=req.body||{};
  db.transaction(()=>{
   replaceAccount('CASH',payload.cash||{});
   replaceAccount('CARD',payload.card||{});
   replaceAccount('MOBILE MONEY',payload.mobileMoney||{});
  })();
  io.emit('owner-accounts-changed',{});
  res.json(fullState());
 });
};
