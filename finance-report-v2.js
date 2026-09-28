function v2MoneyDate(value){
 return String(value||"");
}

function v2MoneyFormat(value){
 return Number(value||0).toLocaleString()+" CFA";
}

function v2MoneyDefaultDates(){
 const now=new Date();
 const year=now.getFullYear();
 const month=String(now.getMonth()+1).padStart(2,"0");
 const day=String(now.getDate()).padStart(2,"0");
 return {
  from:`${year}-${month}-01`,
  to:`${year}-${month}-${day}`
 };
}

window.ownerMoneyReport=function ownerMoneyReport(){
 if(role!=="owner"){
  alert("Only the owner can access the Money Report.");
  return;
 }
 clearInterval(timerInterval);
 const defaults=v2MoneyDefaultDates();
 document.getElementById("root").innerHTML=`
 <div class="app">
  <button class="back" onclick="ownerReports()">← BACK</button>
  <div class="logo">MR K BURGERS<span>OWNER — MONEY REPORT</span></div>
  <div class="panel">
   <span class="badge">💰 MONEY REPORT</span>
   <h1>Sales minus Expenses</h1>
   <p class="muted">Choose any From and To dates. Salary costs belong to their salary month. Staff advances are shown separately and are not counted twice as expenses.</p>
   <div class="info-row">
    <span>From</span>
    <input type="date" id="v2MoneyFrom" value="${defaults.from}">
   </div>
   <div class="info-row">
    <span>To</span>
    <input type="date" id="v2MoneyTo" value="${defaults.to}">
   </div>
   <button class="primary" style="margin-top:20px;width:100%" onclick="v2RunMoneyReport()">VIEW MONEY REPORT</button>
   <div id="v2MoneyResults"></div>
  </div>
 </div>`;
};

window.v2RunMoneyReport=async function v2RunMoneyReport(){
 if(role!=="owner")return;
 const from=v2MoneyDate(document.getElementById("v2MoneyFrom")?.value);
 const to=v2MoneyDate(document.getElementById("v2MoneyTo")?.value);
 const results=document.getElementById("v2MoneyResults");

 if(!from||!to){
  alert("Please choose a From date and To date.");
  return;
 }
 if(from>to){
  alert("From date cannot be after To date.");
  return;
 }

 try{
  results.innerHTML='<p class="muted" style="margin-top:20px">Loading report...</p>';
  const response=await fetch(
   `/api/finance-report?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
   {cache:"no-store"}
  );
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||"Unable to load Money Report.");

  const methodRows=Object.entries(data.sales?.byMethod||{})
   .sort((a,b)=>Number(b[1])-Number(a[1]))
   .map(([method,total])=>`
    <div class="info-row">
     <span>${esc(method)}</span>
     <strong>${v2MoneyFormat(total)}</strong>
    </div>`)
   .join("");

  const categoryRows=(data.expenses?.manualCategories||[])
   .map(category=>`
    <div class="info-row">
     <span>${esc(category.name)}</span>
     <strong>${v2MoneyFormat(category.total)}</strong>
    </div>`)
   .join("");

  const resultLabel=Number(data.operatingResult||0)>=0
   ?"OPERATING RESULT"
   :"OPERATING LOSS";

  results.innerHTML=`
   <div class="system-note" style="margin-top:22px">
    Selected Period: <strong>${esc(from)} → ${esc(to)}</strong>
   </div>

   <h2 style="margin-top:26px">Sales</h2>
   ${methodRows||'<p class="muted">No paid completed sales in this period.</p>'}
   <div class="info-row">
    <span>Total Orders</span>
    <strong>${Number(data.sales?.orders||0).toLocaleString()}</strong>
   </div>
   <div class="info-row">
    <span><strong>TOTAL SALES</strong></span>
    <strong>${v2MoneyFormat(data.sales?.total)}</strong>
   </div>

   <h2 style="margin-top:26px">Manual Expenses</h2>
   ${categoryRows||'<p class="muted">No manual expenses in this period.</p>'}
   <div class="info-row">
    <span>Manual Expenses Total</span>
    <strong>${v2MoneyFormat(data.expenses?.manual)}</strong>
   </div>

   <h2 style="margin-top:26px">Payroll Expenses</h2>
   <div class="info-row">
    <span>Salary Cost</span>
    <strong>${v2MoneyFormat(data.expenses?.salaryAccrual)}</strong>
   </div>
   <div class="info-row">
    <span>Final Settlement Adjustments</span>
    <strong>${v2MoneyFormat(data.expenses?.settlementAdjustments)}</strong>
   </div>
   <div class="info-row">
    <span><strong>PAYROLL TOTAL</strong></span>
    <strong>${v2MoneyFormat(data.expenses?.payroll)}</strong>
   </div>
   <div class="system-note">
    Staff advances paid in this period: <strong>${v2MoneyFormat(data.expenses?.advancesPaid)}</strong><br>
    Advances are cash-flow information and are not added again to salary expense.
   </div>

   <div class="summary" style="margin-top:28px">
    <div class="info-row">
     <span>TOTAL SALES</span>
     <strong>${v2MoneyFormat(data.sales?.total)}</strong>
    </div>
    <div class="info-row">
     <span>TOTAL EXPENSES</span>
     <strong>${v2MoneyFormat(data.expenses?.total)}</strong>
    </div>
    <div class="info-row">
     <span><strong>${resultLabel}</strong></span>
     <strong>${v2MoneyFormat(data.operatingResult)}</strong>
    </div>
    <div class="info-row">
     <span>Expense Ratio</span>
     <strong>${Number(data.expenseRatio||0).toFixed(1)}%</strong>
    </div>
   </div>
   <p class="muted" style="margin-top:16px">
    Operating Result = completed paid sales minus manual expenses and payroll costs. It is not a full accounting net-profit statement.
   </p>`;
 }catch(error){
  console.error("Money Report failed",error);
  results.innerHTML="";
  alert(error.message||"Unable to load Money Report.");
 }
};

const v2MoneyLegacyOwnerReports=typeof ownerReports==="function"?ownerReports:null;
if(v2MoneyLegacyOwnerReports){
 ownerReports=async function ownerReports(){
  const result=await v2MoneyLegacyOwnerReports.apply(this,arguments);
  if(role!=="owner")return result;
  const grid=document.querySelector("#root .panel .grid");
  if(grid&&!document.getElementById("v2MoneyReportCard")){
   const card=document.createElement("div");
   card.id="v2MoneyReportCard";
   card.className="card";
   card.style.cursor="pointer";
   card.onclick=()=>ownerMoneyReport();
   card.innerHTML=`
    <div class="category-icon">💰</div>
    <h3>MONEY REPORT</h3>
    <p class="muted">Sales minus all operating expenses between two dates</p>`;
   grid.appendChild(card);
  }
  return result;
 };
}

function v2FinanceRangeToDates(period,value){
 const range=getReportPeriodRange(period,value);
 const toLocalDate=timestamp=>{
  const date=new Date(timestamp);
  return [
   date.getFullYear(),
   String(date.getMonth()+1).padStart(2,"0"),
   String(date.getDate()).padStart(2,"0")
  ].join("-");
 };
 const endInclusive=new Date(range.end-1);
 return {
  from:toLocalDate(range.start),
  to:[
   endInclusive.getFullYear(),
   String(endInclusive.getMonth()+1).padStart(2,"0"),
   String(endInclusive.getDate()).padStart(2,"0")
  ].join("-")
 };
}

const v2FinanceLegacyExpenseReports=typeof expenseReportsPage==="function"?expenseReportsPage:null;
if(v2FinanceLegacyExpenseReports){
 expenseReportsPage=async function expenseReportsPage(period="month",value=""){
  const result=await v2FinanceLegacyExpenseReports(period,value);
  if(role!=="owner")return result;

  try{
   const dates=v2FinanceRangeToDates(period,value);
   const response=await fetch(
    `/api/finance-report?from=${encodeURIComponent(dates.from)}&to=${encodeURIComponent(dates.to)}`,
    {cache:"no-store"}
   );
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Unable to load payroll expenses.");

   const panel=document.querySelector("#root .panel");
   if(!panel)return result;

   const existing=document.getElementById("v2PayrollExpenseReport");
   if(existing)existing.remove();

   const totalRow=[...panel.querySelectorAll(".info-row")].find(row=>
    String(row.querySelector("span")?.textContent||"").trim()==="Total Expenses"
   );
   if(totalRow){
    const strong=totalRow.querySelector("strong");
    if(strong)strong.textContent=v2MoneyFormat(data.expenses?.total);
   }

   const section=document.createElement("div");
   section.id="v2PayrollExpenseReport";
   section.innerHTML=`
    <h2 style="margin-top:25px">Payroll Expenses</h2>
    <div class="info-row">
     <span>Salary Cost</span>
     <strong>${v2MoneyFormat(data.expenses?.salaryAccrual)}</strong>
    </div>
    <div class="info-row">
     <span>Final Settlement Adjustments</span>
     <strong>${v2MoneyFormat(data.expenses?.settlementAdjustments)}</strong>
    </div>
    <div class="info-row">
     <span><strong>Payroll Total</strong></span>
     <strong>${v2MoneyFormat(data.expenses?.payroll)}</strong>
    </div>
    <div class="system-note">
     Staff advances: ${v2MoneyFormat(data.expenses?.advancesPaid)} — shown for information only, not counted again as expense.
    </div>`;
   panel.appendChild(section);
  }catch(error){
   console.error("Unable to add payroll to expense report",error);
  }
  return result;
 };
}
