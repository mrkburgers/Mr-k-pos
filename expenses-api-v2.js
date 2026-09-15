module.exports=function registerExpensesV2(app,io,db){
 db.exec(`
  CREATE TABLE IF NOT EXISTS expense_categories (
   id TEXT PRIMARY KEY,
   name TEXT NOT NULL,
   active INTEGER NOT NULL DEFAULT 1,
   created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
   updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS expenses (
   id TEXT PRIMARY KEY,
   category_id TEXT,
   category_name TEXT NOT NULL DEFAULT '',
   amount REAL NOT NULL,
   note TEXT NOT NULL DEFAULT '',
   reference TEXT NOT NULL DEFAULT '',
   payment_method TEXT NOT NULL DEFAULT 'CASH',
   created_at_ms INTEGER NOT NULL,
   created_by TEXT NOT NULL DEFAULT '',
   created_by_staff_id TEXT NOT NULL DEFAULT '',
   created_by_role TEXT NOT NULL DEFAULT '',
   source TEXT NOT NULL DEFAULT 'MANUAL',
   account_reference TEXT NOT NULL DEFAULT '',
   FOREIGN KEY(category_id) REFERENCES expense_categories(id)
  );

  CREATE INDEX IF NOT EXISTS idx_expenses_created_at
  ON expenses(created_at_ms DESC);
 `);

 function number(value,fallback=0){
  const parsed=Number(value);
  return Number.isFinite(parsed)?parsed:fallback;
 }

 function state(){
  const categories=db.prepare(`
   SELECT id,name,active
   FROM expense_categories
   ORDER BY name COLLATE NOCASE ASC
  `).all().map(row=>({
   id:row.id,
   name:row.name,
   active:Boolean(row.active)
  }));

  const expenses=db.prepare(`
   SELECT * FROM expenses
   ORDER BY created_at_ms DESC,id DESC
  `).all().map(row=>({
   id:row.id,
   categoryId:row.category_id,
   categoryName:row.category_name,
   amount:number(row.amount),
   note:row.note||'',
   reference:row.reference||'',
   paymentMethod:row.payment_method||'CASH',
   createdAt:Number(row.created_at_ms),
   createdBy:row.created_by||'',
   createdByStaffId:row.created_by_staff_id||'',
   createdByRole:row.created_by_role||'',
   source:row.source||'MANUAL',
   accountReference:row.account_reference||''
  }));

  return {categories,expenses};
 }

 function replaceState(payload){
  const categories=Array.isArray(payload?.categories)?payload.categories:[];
  const expenses=Array.isArray(payload?.expenses)?payload.expenses:[];

  db.prepare('DELETE FROM expenses').run();
  db.prepare('DELETE FROM expense_categories').run();

  const insertCategory=db.prepare(`
   INSERT INTO expense_categories(id,name,active)
   VALUES(?,?,?)
  `);
  categories.forEach((category,index)=>{
   const id=String(category?.id||`expense-category-${index+1}`);
   const name=String(category?.name||'').trim();
   if(!name)return;
   insertCategory.run(id,name,category?.active===false?0:1);
  });

  const insertExpense=db.prepare(`
   INSERT INTO expenses(
    id,category_id,category_name,amount,note,reference,payment_method,
    created_at_ms,created_by,created_by_staff_id,created_by_role,source,account_reference
   ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  expenses.forEach((expense,index)=>{
   const amount=number(expense?.amount);
   if(amount<=0)return;
   const createdAt=Number(expense?.createdAt);
   const id=String(expense?.id||`expense-${createdAt||Date.now()}-${index}`);
   const categoryId=expense?.categoryId?String(expense.categoryId):null;
   insertExpense.run(
    id,
    categoryId,
    String(expense?.categoryName||''),
    amount,
    String(expense?.note||''),
    String(expense?.reference||''),
    String(expense?.paymentMethod||'CASH'),
    Number.isFinite(createdAt)?createdAt:Date.now()+index,
    String(expense?.createdBy||''),
    String(expense?.createdByStaffId||''),
    String(expense?.createdByRole||''),
    String(expense?.source||'MANUAL'),
    String(expense?.accountReference||expense?.id||'')
   );
  });
 }

 const save=db.transaction(replaceState);

 app.get('/api/expenses/state',(req,res)=>{
  res.json(state());
 });

 app.post('/api/expenses/import-if-empty',(req,res)=>{
  const existing=db.prepare('SELECT COUNT(*) AS count FROM expenses').get().count;
  const categoriesExisting=db.prepare('SELECT COUNT(*) AS count FROM expense_categories').get().count;
  if(Number(existing)>0||Number(categoriesExisting)>0){
   return res.json({imported:false,state:state()});
  }
  save(req.body||{});
  io.emit('expenses-changed',{});
  res.json({imported:true,state:state()});
 });

 app.put('/api/expenses/state',(req,res)=>{
  save(req.body||{});
  io.emit('expenses-changed',{});
  res.json(state());
 });
};
