const createSecurityAuthV2=require("./security-auth-v2");

module.exports=function registerFinanceReportV2(app,db){
 const ownerOnly=createSecurityAuthV2().requireRole("owner");

 function parsePayload(value){
  try{
   const parsed=JSON.parse(String(value||"{}"));
   return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed:{};
  }catch{
   return {};
  }
 }

 function validDate(value){
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value||""));
 }

 function number(value){
  const parsed=Number(value);
  return Number.isFinite(parsed)?parsed:0;
 }

 function daysInMonth(month){
  const [year,mon]=String(month).split("-").map(Number);
  if(!year||!mon)return 0;
  return new Date(year,mon,0).getDate();
 }

 function overlapDays(month,from,to){
  if(!/^\d{4}-\d{2}$/.test(String(month||"")))return 0;
  const start=`${month}-01`;
  const totalDays=daysInMonth(month);
  if(!totalDays)return 0;
  const end=`${month}-${String(totalDays).padStart(2,"0")}`;
  const overlapStart=from>start?from:start;
  const overlapEnd=to<end?to:end;
  if(overlapStart>overlapEnd)return 0;
  const startMs=new Date(overlapStart+"T00:00:00Z").getTime();
  const endMs=new Date(overlapEnd+"T00:00:00Z").getTime();
  return Math.floor((endMs-startMs)/86400000)+1;
 }

 function salaryPeriodCost(period,transactions,from,to){
  const month=String(period.month||"");
  const monthDays=daysInMonth(month);
  const selectedDays=overlapDays(month,from,to);
  if(!monthDays||!selectedDays)return 0;

  const periodTransactions=transactions.filter(transaction=>
   String(transaction.periodId||"")===String(period.id||"")
  );
  const totalByType=type=>periodTransactions
   .filter(transaction=>String(transaction.type||"")===type)
   .reduce((sum,transaction)=>sum+number(transaction.amount),0);

  const monthlyCost=
   number(period.baseSalary)+
   totalByType("BONUS")+
   totalByType("OVERTIME")-
   totalByType("DEDUCTION");

  return monthlyCost*(selectedDays/monthDays);
 }

 app.get("/api/finance-report",ownerOnly,(req,res)=>{
  const from=String(req.query.from||"");
  const to=String(req.query.to||"");

  if(!validDate(from)||!validDate(to)||from>to){
   return res.status(400).json({error:"Valid From and To dates are required."});
  }

  const salesRows=db.prepare(`
   SELECT
    COALESCE(payment_method,'UNKNOWN') AS payment_method,
    COUNT(*) AS order_count,
    COALESCE(SUM(total_amount),0) AS total
   FROM orders
   WHERE status='COMPLETED'
     AND payment_status='PAID'
     AND date(COALESCE(completed_at,updated_at),'localtime') BETWEEN ? AND ?
   GROUP BY COALESCE(payment_method,'UNKNOWN')
  `).all(from,to);

  const salesByMethod={};
  let totalSales=0;
  let totalOrders=0;
  salesRows.forEach(row=>{
   const method=String(row.payment_method||"UNKNOWN").toUpperCase();
   const total=number(row.total);
   const count=number(row.order_count);
   salesByMethod[method]=total;
   totalSales+=total;
   totalOrders+=count;
  });

  const manualCategoryRows=db.prepare(`
   SELECT
    CASE WHEN TRIM(category_name)='' THEN 'Other' ELSE category_name END AS category_name,
    COALESCE(SUM(amount),0) AS total
   FROM expenses
   WHERE COALESCE(category_id,'')<>'payroll'
     AND date(created_at_ms/1000,'unixepoch','localtime') BETWEEN ? AND ?
   GROUP BY CASE WHEN TRIM(category_name)='' THEN 'Other' ELSE category_name END
   ORDER BY total DESC
  `).all(from,to);

  const manualCategories=manualCategoryRows.map(row=>({
   name:String(row.category_name||"Other"),
   total:number(row.total)
  }));
  const manualExpenses=manualCategories.reduce((sum,row)=>sum+row.total,0);

  const salaryPeriods=db.prepare("SELECT payload_json FROM salary_periods ORDER BY rowid ASC")
   .all().map(row=>parsePayload(row.payload_json));
  const payrollTransactions=db.prepare("SELECT payload_json FROM payroll_transactions ORDER BY rowid ASC")
   .all().map(row=>parsePayload(row.payload_json));
  const finalSettlements=db.prepare("SELECT payload_json FROM final_settlements ORDER BY rowid ASC")
   .all().map(row=>parsePayload(row.payload_json));
  const staffAdvances=db.prepare("SELECT payload_json FROM staff_advances ORDER BY rowid ASC")
   .all().map(row=>parsePayload(row.payload_json));

  const salaryAccrual=salaryPeriods.reduce(
   (sum,period)=>sum+salaryPeriodCost(period,payrollTransactions,from,to),
   0
  );

  const settlementAdjustments=finalSettlements
   .filter(settlement=>String(settlement.status||"")==="FINALIZED")
   .filter(settlement=>{
    const date=String(settlement.finalizedAt||settlement.createdAt||"").slice(0,10);
    return date>=from&&date<=to;
   })
   .reduce((sum,settlement)=>
    sum+
    number(settlement.bonus)+
    number(settlement.overtime)-
    number(settlement.deduction),
   0);

  const payrollExpenses=salaryAccrual+settlementAdjustments;

  const advancesPaid=staffAdvances
   .filter(advance=>{
    const date=String(advance.date||advance.createdAt||"").slice(0,10);
    return date>=from&&date<=to;
   })
   .reduce((sum,advance)=>sum+number(advance.amount),0);

  const totalExpenses=manualExpenses+payrollExpenses;
  const operatingResult=totalSales-totalExpenses;
  const expenseRatio=totalSales>0?(totalExpenses/totalSales)*100:0;

  res.json({
   from,
   to,
   sales:{
    total:Math.round(totalSales),
    orders:Math.round(totalOrders),
    byMethod:Object.fromEntries(
     Object.entries(salesByMethod).map(([key,value])=>[key,Math.round(value)])
    )
   },
   expenses:{
    manual:Math.round(manualExpenses),
    manualCategories:manualCategories.map(row=>({
     name:row.name,
     total:Math.round(row.total)
    })),
    payroll:Math.round(payrollExpenses),
    salaryAccrual:Math.round(salaryAccrual),
    settlementAdjustments:Math.round(settlementAdjustments),
    advancesPaid:Math.round(advancesPaid),
    total:Math.round(totalExpenses)
   },
   operatingResult:Math.round(operatingResult),
   expenseRatio:Number(expenseRatio.toFixed(1)),
   notes:{
    payroll:"Monthly payroll is accrued across its salary month. Staff advances are shown for cash-flow information but are not added again to expenses."
   }
  });
 });
};
