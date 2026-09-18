let v2StaffEmployeesReady=false;
let v2StaffEmployeesSaveQueue=Promise.resolve();

function v2StaffEmployeesSnapshot(){
 return Array.isArray(staffMembers)
  ?JSON.parse(JSON.stringify(staffMembers))
  :[];
}

function v2ApplyStaffEmployees(state){
 const rows=Array.isArray(state)?state:[];
 staffMembers=rows.map(employee=>({
  id:String(employee.id||""),
  name:String(employee.name||""),
  position:String(employee.position||""),
  salary:Number(employee.salary||0),
  startDate:String(employee.startDate||""),
  active:employee.active!==false,
  staffAccountId:employee.staffAccountId==null?null:Number(employee.staffAccountId),
  posStaffId:employee.posStaffId?String(employee.posStaffId):null,
  createdAt:employee.createdAt,
  updatedAt:employee.updatedAt
 }));
 localStorage.setItem("mrkStaffMembers",JSON.stringify(staffMembers));
}

async function v2InitializeStaffEmployees(){
 if(v2StaffEmployeesReady)return staffMembers;
 const response=await fetch("/api/staff-employees/import-if-empty",{
  method:"POST",
  headers:{"Content-Type":"application/json"},
  body:JSON.stringify({employees:v2StaffEmployeesSnapshot()})
 });
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(result.error||"Unable to initialize employee records.");
 v2ApplyStaffEmployees(result.state||[]);
 v2StaffEmployeesReady=true;
 return staffMembers;
}

async function v2FetchStaffEmployees(){
 const response=await fetch("/api/staff-employees",{cache:"no-store"});
 const result=await response.json().catch(()=>[]);
 if(!response.ok)throw new Error(result.error||"Unable to load employee records.");
 v2ApplyStaffEmployees(result);
 v2StaffEmployeesReady=true;
 return staffMembers;
}

async function v2PersistStaffEmployees(){
 const response=await fetch("/api/staff-employees/state",{
  method:"PUT",
  headers:{"Content-Type":"application/json"},
  body:JSON.stringify({employees:v2StaffEmployeesSnapshot()})
 });
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(result.error||"Unable to save employee records.");
 v2ApplyStaffEmployees(result);
 return staffMembers;
}

function v2QueueStaffEmployeesSave(){
 const snapshot=v2StaffEmployeesSnapshot();
 v2StaffEmployeesSaveQueue=v2StaffEmployeesSaveQueue
  .then(async()=>{
   const response=await fetch("/api/staff-employees/state",{
    method:"PUT",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({employees:snapshot})
   });
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(result.error||"Unable to save employee records.");
   v2ApplyStaffEmployees(result);
  })
  .catch(error=>{
   console.error("Employee record sync failed",error);
  });
 return v2StaffEmployeesSaveQueue;
}

saveStaffMembers=function saveStaffMembers(){
 localStorage.setItem("mrkStaffMembers",JSON.stringify(staffMembers));
 if(v2StaffEmployeesReady)v2QueueStaffEmployeesSave();
};

const v2OriginalOwnerHomeForEmployees=window.ownerHome;
if(typeof v2OriginalOwnerHomeForEmployees==="function"){
 window.ownerHome=async function ownerHome(){
  if(role==="owner"){
   try{
    await v2InitializeStaffEmployees();
   }catch(error){
    console.error("Employee initialization failed",error);
    alert(error.message||"Unable to initialize employee records.");
   }
  }
  return v2OriginalOwnerHomeForEmployees.apply(this,arguments);
 };
}

const v2OriginalOwnerSalariesAdvances=window.ownerSalariesAdvances;
if(typeof v2OriginalOwnerSalariesAdvances==="function"){
 window.ownerSalariesAdvances=async function ownerSalariesAdvances(){
  if(role==="owner"){
   try{
    if(!v2StaffEmployeesReady)await v2InitializeStaffEmployees();
    else await v2FetchStaffEmployees();
   }catch(error){
    alert(error.message||"Unable to load employee records.");
    return;
   }
  }
  return v2OriginalOwnerSalariesAdvances.apply(this,arguments);
 };
}

const v2EmployeeOriginalStaffManagement=window.ownerStaffManagement;
if(typeof v2EmployeeOriginalStaffManagement==="function"){
 window.ownerStaffManagement=function ownerStaffManagement(){
  const result=v2EmployeeOriginalStaffManagement.apply(this,arguments);
  if(role==="owner"){
   const grid=document.querySelector("#root .panel .grid");
   if(grid&&!document.getElementById("v2EmployeeRecordsCard")){
    const card=document.createElement("div");
    card.id="v2EmployeeRecordsCard";
    card.className="card";
    card.style.cursor="pointer";
    card.onclick=()=>v2EmployeeManagement();
    card.innerHTML=`
     <div class="category-icon">🧾</div>
     <h3>EMPLOYEE RECORDS</h3>
     <p class="muted">Position, salary, start date and POS link</p>`;
    grid.appendChild(card);
   }
  }
  return result;
 };
}

function v2EmployeeLinkedAccountLabel(employee){
 if(employee?.posStaffId)return employee.posStaffId;
 return "No POS account";
}

window.v2EmployeeManagement=async function v2EmployeeManagement(){
 if(role!=="owner"){
  alert("Only the owner can manage employee records.");
  return;
 }
 try{
  if(!v2StaffEmployeesReady)await v2InitializeStaffEmployees();
  else await v2FetchStaffEmployees();
  clearInterval(timerInterval);
  const employeeCard=employee=>`
   <div class="card">
    <div class="category-icon">👤</div>
    <h3>${esc(employee.name)}</h3>
    <p class="muted">${esc(employee.position||"No position")}</p>
    <p>Salary: <strong>${Number(employee.salary||0).toLocaleString()} CFA</strong></p>
    <p class="muted">Start: ${esc(employee.startDate||"—")}</p>
    <p class="muted">POS: ${esc(v2EmployeeLinkedAccountLabel(employee))}</p>
    <p class="muted">${employee.active!==false?"ACTIVE":"INACTIVE"}</p>
    <button class="primary" onclick="v2EmployeeEditPage('${esc(employee.id)}')">EDIT</button>
    <button class="secondary" onclick="v2ToggleEmployeeActive('${esc(employee.id)}')">${employee.active!==false?"DEACTIVATE":"ACTIVATE"}</button>
   </div>`;
  const activeEmployees=staffMembers.filter(employee=>employee.active!==false);
  const inactiveEmployees=staffMembers.filter(employee=>employee.active===false);
  const activeCards=activeEmployees.map(employeeCard).join("");
  const inactiveCards=inactiveEmployees.map(employeeCard).join("");
  document.getElementById("root").innerHTML=`
  <div class="app">
   <button class="back" onclick="ownerStaffManagement()">← BACK</button>
   <div class="logo">MR K BURGERS<span>OWNER — EMPLOYEE RECORDS</span></div>
   <div class="panel">
    <span class="badge">🧾 EMPLOYEE RECORDS</span>
    <h1>Employees</h1>
    <p class="muted">Employee profiles are stored on the restaurant server. POS login accounts are managed separately.</p>
    <button class="primary" style="margin-bottom:20px" onclick="v2EmployeeAddPage()">+ ADD EMPLOYEE</button>

    <h2 style="margin:10px 0 14px">ACTIVE EMPLOYEES</h2>
    <div class="grid">${activeCards||'<p class="muted">No active employees.</p>'}</div>

    <div style="margin:32px 0 20px;border-top:1px solid #3b3b3b"></div>

    <h2 style="margin:0 0 14px">INACTIVE EMPLOYEES</h2>
    <div class="grid">${inactiveCards||'<p class="muted">No inactive employees.</p>'}</div>
   </div>
  </div>`;
 }catch(error){
  alert(error.message||"Unable to load employee records.");
 }
};

async function v2EmployeeAccountOptions(currentEmployeeId=""){
 const accounts=typeof v2LoadStaffAdminAccounts==="function"
  ?await v2LoadStaffAdminAccounts()
  :[];
 const used=new Set(
  staffMembers
   .filter(employee=>String(employee.id)!==String(currentEmployeeId)&&employee.staffAccountId!=null)
   .map(employee=>Number(employee.staffAccountId))
 );
 return accounts.filter(account=>account.role!=="owner"&&!used.has(Number(account.id)));
}

window.v2EmployeeAddPage=async function v2EmployeeAddPage(){
 try{
  const accounts=await v2EmployeeAccountOptions();
  const options=accounts.map(account=>`<option value="${Number(account.id)}">${esc(account.name)} — ${esc(account.staff_id)} (${esc(String(account.role).toUpperCase())})</option>`).join("");
  document.getElementById("root").innerHTML=`
  <div class="app">
   <button class="back" onclick="v2EmployeeManagement()">← BACK</button>
   <div class="logo">MR K BURGERS<span>OWNER — ADD EMPLOYEE</span></div>
   <div class="panel">
    <span class="badge">➕ EMPLOYEE RECORD</span>
    <h1>Create Employee</h1>
    <div class="info-row"><span>Name</span><input id="v2EmployeeName" type="text"></div>
    <div class="info-row"><span>Position</span><input id="v2EmployeePosition" type="text"></div>
    <div class="info-row"><span>Monthly Salary</span><input id="v2EmployeeSalary" type="number" min="0"></div>
    <div class="info-row"><span>Start Date</span><input id="v2EmployeeStartDate" type="date"></div>
    <div class="info-row"><span>POS Account</span><select id="v2EmployeeAccountId"><option value="">No POS access / no link</option>${options}</select></div>
    <button class="primary" style="margin-top:20px;width:100%" onclick="v2CreateEmployeeRecord()">CREATE EMPLOYEE</button>
   </div>
  </div>`;
 }catch(error){
  alert(error.message||"Unable to open employee form.");
 }
};

window.v2CreateEmployeeRecord=async function v2CreateEmployeeRecord(){
 const name=String(document.getElementById("v2EmployeeName")?.value||"").trim();
 const position=String(document.getElementById("v2EmployeePosition")?.value||"").trim();
 const salary=Number(document.getElementById("v2EmployeeSalary")?.value);
 const startDate=String(document.getElementById("v2EmployeeStartDate")?.value||"").trim();
 const accountValue=String(document.getElementById("v2EmployeeAccountId")?.value||"").trim();
 if(!name||!position||!startDate||!Number.isFinite(salary)||salary<0){
  alert("Please complete all employee fields with a valid salary.");
  return;
 }
 const account=accountValue
  ?v2StaffAdminAccounts.find(item=>Number(item.id)===Number(accountValue))
  :null;
 const id=typeof createStaffMemberId==="function"
  ?createStaffMemberId()
  :`employee_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
 staffMembers.push({
  id,
  name,
  position,
  salary,
  startDate,
  active:true,
  staffAccountId:account?Number(account.id):null,
  posStaffId:account?String(account.staff_id):null
 });
 try{
  await v2PersistStaffEmployees();
  alert("Employee created successfully.");
  await v2EmployeeManagement();
 }catch(error){
  staffMembers=staffMembers.filter(employee=>employee.id!==id);
  alert(error.message||"Unable to create employee.");
 }
};

window.v2EmployeeEditPage=async function v2EmployeeEditPage(employeeId){
 const employee=staffMembers.find(item=>String(item.id)===String(employeeId));
 if(!employee){
  alert("Employee not found.");
  return;
 }
 try{
  const accounts=await v2EmployeeAccountOptions(employee.id);
  const options=accounts.map(account=>`<option value="${Number(account.id)}" ${Number(account.id)===Number(employee.staffAccountId)?"selected":""}>${esc(account.name)} — ${esc(account.staff_id)} (${esc(String(account.role).toUpperCase())})</option>`).join("");
  document.getElementById("root").innerHTML=`
  <div class="app">
   <button class="back" onclick="v2EmployeeManagement()">← BACK</button>
   <div class="logo">MR K BURGERS<span>OWNER — EDIT EMPLOYEE</span></div>
   <div class="panel">
    <span class="badge">✏️ EMPLOYEE RECORD</span>
    <h1>${esc(employee.name)}</h1>
    <div class="info-row"><span>Name</span><input id="v2EmployeeName" type="text" value="${esc(employee.name)}"></div>
    <div class="info-row"><span>Position</span><input id="v2EmployeePosition" type="text" value="${esc(employee.position||"")}"></div>
    <div class="info-row"><span>Monthly Salary</span><input id="v2EmployeeSalary" type="number" min="0" value="${Number(employee.salary||0)}"></div>
    <div class="info-row"><span>Start Date</span><input id="v2EmployeeStartDate" type="date" value="${esc(employee.startDate||"")}"></div>
    <div class="info-row"><span>POS Account</span><select id="v2EmployeeAccountId"><option value="">No POS access / no link</option>${options}</select></div>
    <div class="info-row"><span>Status</span><strong>${employee.active!==false?"ACTIVE":"INACTIVE"}</strong></div>
    <button class="primary" style="margin-top:20px;width:100%" onclick="v2SaveEmployeeRecord('${esc(employee.id)}')">SAVE CHANGES</button>
   </div>
  </div>`;
 }catch(error){
  alert(error.message||"Unable to open employee record.");
 }
};

window.v2SaveEmployeeRecord=async function v2SaveEmployeeRecord(employeeId){
 const employee=staffMembers.find(item=>String(item.id)===String(employeeId));
 if(!employee)return;
 const previous=JSON.parse(JSON.stringify(employee));
 const name=String(document.getElementById("v2EmployeeName")?.value||"").trim();
 const position=String(document.getElementById("v2EmployeePosition")?.value||"").trim();
 const salary=Number(document.getElementById("v2EmployeeSalary")?.value);
 const startDate=String(document.getElementById("v2EmployeeStartDate")?.value||"").trim();
 const accountValue=String(document.getElementById("v2EmployeeAccountId")?.value||"").trim();
 if(!name||!position||!startDate||!Number.isFinite(salary)||salary<0){
  alert("Please complete all employee fields with a valid salary.");
  return;
 }
 const account=accountValue
  ?v2StaffAdminAccounts.find(item=>Number(item.id)===Number(accountValue))
  :null;
 employee.name=name;
 employee.position=position;
 employee.salary=salary;
 employee.startDate=startDate;
 employee.staffAccountId=account?Number(account.id):null;
 employee.posStaffId=account?String(account.staff_id):null;
 try{
  await v2PersistStaffEmployees();
  alert("Employee updated successfully.");
  await v2EmployeeManagement();
 }catch(error){
  Object.assign(employee,previous);
  alert(error.message||"Unable to update employee.");
 }
};

window.v2ToggleEmployeeActive=async function v2ToggleEmployeeActive(employeeId){
 const employee=staffMembers.find(item=>String(item.id)===String(employeeId));
 if(!employee)return;
 const previous=employee.active!==false;
 employee.active=!previous;
 try{
  await v2PersistStaffEmployees();
  await v2EmployeeManagement();
 }catch(error){
  employee.active=previous;
  alert(error.message||"Unable to update employee status.");
 }
};


function v2PayrollHistoryDate(value){
 const text=String(value||"").trim();
 if(!text)return "—";
 if(/^\d{4}-\d{2}-\d{2}$/.test(text)){
  const parts=text.split("-").map(Number);
  const date=new Date(parts[0],parts[1]-1,parts[2]);
  return Number.isNaN(date.getTime())?text:date.toLocaleDateString();
 }
 const date=new Date(text);
 return Number.isNaN(date.getTime())?text:date.toLocaleDateString();
}

function v2PayrollHistoryTimestamp(value){
 const text=String(value||"").trim();
 if(!text)return 0;
 if(/^\d{4}-\d{2}-\d{2}$/.test(text)){
  const parts=text.split("-").map(Number);
  return new Date(parts[0],parts[1]-1,parts[2]).getTime();
 }
 const date=new Date(text);
 return Number.isNaN(date.getTime())?0:date.getTime();
}

function v2PayrollHistoryTypeLabel(type){
 const labels={
  ADVANCE:"ADVANCE",
  SALARY_PAYMENT:"SALARY PAYMENT",
  BONUS:"BONUS",
  OVERTIME:"OVERTIME",
  DEDUCTION:"DEDUCTION",
  ADVANCE_RECOVERY:"ADVANCE RECOVERY"
 };
 return labels[type]||String(type||"").replaceAll("_"," ");
}

function v2PayrollEmployeeHistoryEvents(employeeId){
 const advances=(Array.isArray(staffAdvances)?staffAdvances:[])
  .filter(item=>String(item.employeeId)===String(employeeId))
  .map(item=>({
   id:item.id,
   type:"ADVANCE",
   amount:Number(item.amount||0),
   date:item.date||item.createdAt||"",
   createdAt:item.createdAt||"",
   note:item.note||"",
   detail:item.status?String(item.status).replaceAll("_"," "):""
  }));

 const transactions=(Array.isArray(payrollTransactions)?payrollTransactions:[])
  .filter(item=>String(item.employeeId)===String(employeeId))
  .map(item=>{
   const period=(Array.isArray(salaryPeriods)?salaryPeriods:[])
    .find(period=>String(period.id)===String(item.periodId||""));
   return {
    id:item.id,
    type:item.type||"PAYROLL",
    amount:Number(item.amount||0),
    date:item.date||item.createdAt||"",
    createdAt:item.createdAt||"",
    note:item.note||"",
    detail:period?.month?("Salary period: "+period.month):""
   };
  });

 return [...advances,...transactions].sort((a,b)=>
  v2PayrollHistoryTimestamp(b.date||b.createdAt)-
  v2PayrollHistoryTimestamp(a.date||a.createdAt)
 );
}

window.v2PayrollHistoryPage=function v2PayrollHistoryPage(employeeId=""){
 if(role!=="owner"){
  alert("Only the owner can view payroll history.");
  return;
 }
 clearInterval(timerInterval);

 const employees=Array.isArray(staffMembers)?staffMembers:[];
 const selected=employees.find(employee=>String(employee.id)===String(employeeId));
 const options=employees.map(employee=>\`
  <option value="\${esc(employee.id)}" \${selected&&String(selected.id)===String(employee.id)?"selected":""}>
   \${esc(employee.name)}\${employee.active===false?" — INACTIVE":""}
  </option>\`
 ).join("");

 const events=selected?v2PayrollEmployeeHistoryEvents(selected.id):[];
 const rows=events.map(event=>\`
  <div class="summary" style="margin-bottom:12px">
   <div class="info-row">
    <span>Date</span>
    <strong>\${esc(v2PayrollHistoryDate(event.date||event.createdAt))}</strong>
   </div>
   <div class="info-row">
    <span>Type</span>
    <strong>\${esc(v2PayrollHistoryTypeLabel(event.type))}</strong>
   </div>
   <div class="info-row">
    <span>Amount</span>
    <strong>\${Number(event.amount||0).toLocaleString()} CFA</strong>
   </div>
   \${event.detail?\`
    <div class="info-row">
     <span>Reference</span>
     <strong>\${esc(event.detail)}</strong>
    </div>\`:""}
   \${event.note?\`
    <div class="info-row">
     <span>Note</span>
     <strong>\${esc(event.note)}</strong>
    </div>\`:""}
  </div>\`
 ).join("");

 document.getElementById("root").innerHTML=\`
 <div class="app">
  <button class="back" onclick="ownerSalariesAdvances()">← BACK</button>
  <div class="logo">MR K BURGERS<span>OWNER — SALARY / ADVANCE HISTORY</span></div>
  <div class="panel">
   <span class="badge">📋 PAYROLL HISTORY</span>
   <h1>Salary & Advance History</h1>
   <p class="muted">Choose an employee to view salary payments, advances, adjustments and advance recoveries.</p>
   <div class="form" style="margin:20px 0;max-width:none">
    <label>Employee</label>
    <select id="v2PayrollHistoryEmployee" onchange="v2PayrollHistoryPage(this.value)">
     <option value="">Select employee</option>
     \${options}
    </select>
   </div>
   \${selected?\`
    <h2>\${esc(selected.name)}</h2>
    <p class="muted">\${esc(selected.position||"No position")}</p>
    \${rows||'<p class="muted">No salary or advance history for this employee yet.</p>'}
   \`:'<p class="muted">Select an employee above to view history.</p>'}
  </div>
 </div>\`;
};

const v2OriginalSalariesAdvancesForHistory=window.ownerSalariesAdvances;
if(typeof v2OriginalSalariesAdvancesForHistory==="function"){
 window.ownerSalariesAdvances=async function ownerSalariesAdvances(){
  const result=await v2OriginalSalariesAdvancesForHistory.apply(this,arguments);
  if(role==="owner"){
   const panel=document.querySelector("#root .panel");
   if(panel&&!document.getElementById("v2PayrollHistoryButton")){
    const button=document.createElement("button");
    button.id="v2PayrollHistoryButton";
    button.className="secondary";
    button.style.marginBottom="20px";
    button.textContent="📋 SALARY / ADVANCE HISTORY";
    button.onclick=()=>v2PayrollHistoryPage();
    const grid=panel.querySelector(".grid");
    if(grid)panel.insertBefore(button,grid);
    else panel.appendChild(button);
   }
  }
  return result;
 };
}
