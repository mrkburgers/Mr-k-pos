let v2OwnerAccountsSaveQueue=Promise.resolve();
let v2OwnerAccountsReady=false;

function v2OwnerAccountsSnapshot(){
 return {
  cash:JSON.parse(JSON.stringify(ownerCashAccount||{balance:0,transactions:[]})),
  card:JSON.parse(JSON.stringify(ownerCardAccount||{balance:0,transactions:[],openingBalanceSet:false})),
  mobileMoney:JSON.parse(JSON.stringify(ownerMobileMoneyAccount||{balance:0,transactions:[],openingBalanceSet:false}))
 };
}

function v2ApplyOwnerAccounts(state){
 if(!state||typeof state!=="object")return;
 ownerCashAccount=state.cash&&typeof state.cash==="object"
  ?state.cash
  :{balance:0,transactions:[]};
 ownerCardAccount=state.card&&typeof state.card==="object"
  ?state.card
  :{balance:0,transactions:[],openingBalanceSet:false};
 ownerMobileMoneyAccount=state.mobileMoney&&typeof state.mobileMoney==="object"
  ?state.mobileMoney
  :{balance:0,transactions:[],openingBalanceSet:false};

 localStorage.setItem("mrkOwnerCashAccount",JSON.stringify(ownerCashAccount));
 localStorage.setItem("mrkOwnerCardAccount",JSON.stringify(ownerCardAccount));
 localStorage.setItem("mrkOwnerMobileMoneyAccount",JSON.stringify(ownerMobileMoneyAccount));
}

async function v2FetchOwnerAccounts(){
 const response=await fetch("/api/owner-accounts",{cache:"no-store"});
 if(!response.ok)throw new Error("Unable to load owner accounts");
 const state=await response.json();
 v2ApplyOwnerAccounts(state);
 return state;
}

async function v2InitializeOwnerAccounts(){
 if(v2OwnerAccountsReady)return;
 const localState=v2OwnerAccountsSnapshot();
 const response=await fetch("/api/owner-accounts/import-if-empty",{
  method:"POST",
  headers:{"Content-Type":"application/json"},
  body:JSON.stringify(localState)
 });
 if(!response.ok)throw new Error("Unable to initialize owner accounts");
 const result=await response.json();
 v2ApplyOwnerAccounts(result.state||{});
 v2OwnerAccountsReady=true;
}

function v2QueueOwnerAccountsSave(){
 const snapshot=v2OwnerAccountsSnapshot();
 v2OwnerAccountsSaveQueue=v2OwnerAccountsSaveQueue
  .then(async()=>{
   const response=await fetch("/api/owner-accounts/state",{
    method:"PUT",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(snapshot)
   });
   if(!response.ok)throw new Error("Unable to save owner accounts");
   const state=await response.json();
   v2ApplyOwnerAccounts(state);
  })
  .catch(error=>{
   console.error("Owner account sync failed",error);
  });
 return v2OwnerAccountsSaveQueue;
}

saveOwnerCashAccount=function saveOwnerCashAccount(){
 localStorage.setItem("mrkOwnerCashAccount",JSON.stringify(ownerCashAccount));
 if(v2OwnerAccountsReady)v2QueueOwnerAccountsSave();
};

saveOwnerCardAccount=function saveOwnerCardAccount(){
 localStorage.setItem("mrkOwnerCardAccount",JSON.stringify(ownerCardAccount));
 if(v2OwnerAccountsReady)v2QueueOwnerAccountsSave();
};

saveOwnerMobileMoneyAccount=function saveOwnerMobileMoneyAccount(){
 localStorage.setItem("mrkOwnerMobileMoneyAccount",JSON.stringify(ownerMobileMoneyAccount));
 if(v2OwnerAccountsReady)v2QueueOwnerAccountsSave();
};

function v2CashRangeBoundary(value,endOfRange=false){
 if(!value)return null;
 const parts=String(value).split("-").map(Number);
 if(parts.length!==3||parts.some(part=>!Number.isFinite(part)))return null;
 const [year,month,day]=parts;
 return endOfRange
  ?new Date(year,month-1,day+1).getTime()
  :new Date(year,month-1,day).getTime();
}

window.ownerCashHistoryPage=function ownerCashHistoryPage(fromDate="",toDate=""){
 if(role!=="owner"){
  alert("Only the owner can view the cash account.");
  ownerHome();
  return;
 }

 const transactions=Array.isArray(ownerCashAccount.transactions)
  ?ownerCashAccount.transactions
  :[];
 const fromMs=v2CashRangeBoundary(fromDate,false);
 const toExclusiveMs=v2CashRangeBoundary(toDate,true);

 if(fromDate&&toDate&&fromMs!==null&&toExclusiveMs!==null&&fromMs>=toExclusiveMs){
  alert("The FROM date must be earlier than or the same as the TO date.");
  return;
 }

 const filtered=transactions.filter(transaction=>{
  const createdAt=Number(transaction.createdAt);
  if(!Number.isFinite(createdAt))return false;
  if(fromMs!==null&&createdAt<fromMs)return false;
  if(toExclusiveMs!==null&&createdAt>=toExclusiveMs)return false;
  return true;
 });

 const rows=filtered.map(t=>{
  const time=new Date(t.createdAt).toLocaleString();
  const sign=t.type==="IN"?"+":"-";
  const typeLabel=t.source==="TRANSFER"
   ?"TRANSFER → CASH"
   :t.type==="IN"
    ?"CASH IN"
    :"CASH OUT";
  return `
   <div class="summary" style="margin-bottom:12px">
    <div class="info-row">
     <span>${time}</span>
     <strong>${sign}${Number(t.amount||0).toLocaleString()} CFA</strong>
    </div>
    <div class="info-row">
     <span>Type</span>
     <strong>${typeLabel}</strong>
    </div>
    <div class="info-row">
     <span>Description</span>
     <strong>${t.description||"-"}</strong>
    </div>
    <div class="info-row">
     <span>Source</span>
     <strong>${t.source||"-"}</strong>
    </div>
    ${t.reference?`
    <div class="info-row">
     <span>Reference</span>
     <strong>${t.reference}</strong>
    </div>`:""}
    <div class="info-row">
     <span>Actor</span>
     <strong>${t.createdBy||"-"}</strong>
    </div>
    <div class="info-row">
     <span>Balance After</span>
     <strong>${Number(t.balanceAfter||0).toLocaleString()} CFA</strong>
    </div>
   </div>`;
 }).join("");

 clearInterval(timerInterval);
 document.getElementById("root").innerHTML=`
 <div class="app">
  <button class="back" onclick="ownerCashAccountPage()">← BACK</button>
  <div class="logo">
   MR K BURGERS
   <span>OWNER — CASH HISTORY</span>
  </div>
  <div class="panel">
   <span class="badge">📋 TRANSACTION HISTORY</span>
   <h1>Cash Account History</h1>
   <div class="summary" style="margin-bottom:20px">
    <div class="info-row">
     <span>Current Balance</span>
     <strong>${Number(ownerCashAccount.balance||0).toLocaleString()} CFA</strong>
    </div>
   </div>
   <div class="form" style="margin-bottom:20px;max-width:none">
    <label>FROM</label>
    <input id="ownerCashHistoryFrom" type="date" value="${fromDate}">
    <label>TO</label>
    <input id="ownerCashHistoryTo" type="date" value="${toDate}">
    <div class="actions" style="margin-top:0">
     <button class="primary" onclick="ownerCashHistoryPage(document.getElementById('ownerCashHistoryFrom').value,document.getElementById('ownerCashHistoryTo').value)">APPLY</button>
     <button class="secondary" onclick="ownerCashHistoryPage('','')">CLEAR / SHOW ALL</button>
    </div>
   </div>
   ${rows||`<p class="muted">${fromDate||toDate?"No cash account transactions match the selected date range.":"No cash account transactions yet."}</p>`}
  </div>
 </div>`;
};

if(typeof socket!=="undefined"&&socket){
 socket.on("owner-accounts-changed",()=>{
  if(v2OwnerAccountsReady){
   v2FetchOwnerAccounts().catch(error=>console.error("Owner account refresh failed",error));
  }
 });
}

let v2StaffPinAccounts=[];

async function v2LoadStaffPinAccounts(){
 const response=await fetch("/api/staff",{cache:"no-store"});
 if(!response.ok)throw new Error("Unable to load staff accounts.");
 v2StaffPinAccounts=await response.json();
 return v2StaffPinAccounts;
}

window.v2StaffPinManagement=async function v2StaffPinManagement(){
 if(role!=="owner"){
  alert("Only the owner can manage staff PINs.");
  return;
 }
 try{
  const accounts=await v2LoadStaffPinAccounts();
  clearInterval(timerInterval);
  document.getElementById("root").innerHTML=`
  <div class="app">
   <button class="back" onclick="ownerStaffManagement()">← BACK</button>
   <div class="logo">MR K BURGERS<span>OWNER — PIN MANAGEMENT</span></div>
   <div class="panel">
    <span class="badge">🔐 STAFF PIN SECURITY</span>
    <h1>PIN Management</h1>
    <p class="muted">Owner and Manager use exactly 8 numeric digits. Cashier and Kitchen use exactly 4 numeric digits.</p>
    <div class="grid">
     ${accounts.map(account=>`
      <div class="card">
       <div class="category-icon">${account.role==="owner"?"👑":account.role==="manager"?"🧑‍💼":account.role==="cashier"?"💵":"🍳"}</div>
       <h3>${esc(account.name)}</h3>
       <p class="muted">${esc(account.staff_id)} — ${esc(String(account.role).toUpperCase())}</p>
       <p class="muted">Required PIN: ${account.role==="owner"||account.role==="manager"?"8 digits":"4 digits"}</p>
       <button class="primary" onclick="v2ChangeStaffPinPage(${Number(account.id)})">CHANGE PIN</button>
      </div>
     `).join("")}
    </div>
   </div>
  </div>`;
 }catch(error){
  alert(error.message||"Unable to load staff accounts.");
 }
};

window.v2ChangeStaffPinPage=async function v2ChangeStaffPinPage(accountId){
 if(role!=="owner"){
  alert("Only the owner can manage staff PINs.");
  return;
 }
 try{
  if(!v2StaffPinAccounts.length)await v2LoadStaffPinAccounts();
  const account=v2StaffPinAccounts.find(item=>Number(item.id)===Number(accountId));
  if(!account){
   alert("Staff account not found.");
   return;
  }
  const requiredLength=account.role==="owner"||account.role==="manager"?8:4;
  document.getElementById("root").innerHTML=`
  <div class="app">
   <button class="back" onclick="v2StaffPinManagement()">← BACK</button>
   <div class="logo">MR K BURGERS<span>OWNER — CHANGE PIN</span></div>
   <div class="panel">
    <span class="badge">🔐 CHANGE STAFF PIN</span>
    <h1>${esc(account.name)}</h1>
    <p class="muted">${esc(account.staff_id)} — ${esc(String(account.role).toUpperCase())}</p>
    <div class="system-note">This account requires exactly ${requiredLength} numeric digits.</div>
    <div class="form" style="margin-top:20px">
     <label>New PIN</label>
     <input id="v2NewStaffPin" type="password" inputmode="numeric" autocomplete="new-password" maxlength="${requiredLength}" placeholder="${requiredLength}-digit PIN">
     <label>Confirm New PIN</label>
     <input id="v2ConfirmStaffPin" type="password" inputmode="numeric" autocomplete="new-password" maxlength="${requiredLength}" placeholder="Repeat ${requiredLength}-digit PIN">
     <button class="primary" onclick="v2SaveStaffPin(${Number(account.id)})">SAVE NEW PIN</button>
    </div>
   </div>
  </div>`;
 }catch(error){
  alert(error.message||"Unable to open PIN management.");
 }
};

window.v2SaveStaffPin=async function v2SaveStaffPin(accountId){
 if(role!=="owner"){
  alert("Only the owner can manage staff PINs.");
  return;
 }
 const account=v2StaffPinAccounts.find(item=>Number(item.id)===Number(accountId));
 if(!account){
  alert("Staff account not found.");
  return;
 }
 const requiredLength=account.role==="owner"||account.role==="manager"?8:4;
 const pin=String(document.getElementById("v2NewStaffPin")?.value||"").trim();
 const confirmPin=String(document.getElementById("v2ConfirmStaffPin")?.value||"").trim();
 const pattern=new RegExp(`^\\d{${requiredLength}}$`);
 if(!pattern.test(pin)){
  alert(`PIN must be exactly ${requiredLength} numeric digits.`);
  return;
 }
 if(pin!==confirmPin){
  alert("The two PIN entries do not match.");
  return;
 }
 if(!confirm(`Change the PIN for ${account.name}?`))return;
 try{
  const response=await fetch(`/api/staff/${Number(account.id)}/pin`,{
   method:"PATCH",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({pin})
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||"Unable to change PIN.");
  alert("PIN changed successfully.");
  await v2StaffPinManagement();
 }catch(error){
  alert(error.message||"Unable to change PIN.");
 }
};

const v2OriginalOwnerStaffManagement=window.ownerStaffManagement;
if(typeof v2OriginalOwnerStaffManagement==="function"){
 window.ownerStaffManagement=function ownerStaffManagement(){
  const result=v2OriginalOwnerStaffManagement.apply(this,arguments);
  if(role==="owner"){
   const grid=document.querySelector("#root .panel .grid");
   if(grid&&!document.getElementById("v2PinManagementCard")){
    const card=document.createElement("div");
    card.id="v2PinManagementCard";
    card.className="card";
    card.style.cursor="pointer";
    card.onclick=()=>v2StaffPinManagement();
    card.innerHTML=`
     <div class="category-icon">🔐</div>
     <h3>PIN MANAGEMENT</h3>
     <p class="muted">Securely change POS account PINs</p>`;
    grid.appendChild(card);
   }
  }
  return result;
 };
}

let v2StaffAdminAccounts=[];

async function v2LoadStaffAdminAccounts(){
 const response=await fetch("/api/staff-admin",{cache:"no-store"});
 const result=await response.json().catch(()=>[]);
 if(!response.ok)throw new Error(result.error||"Unable to load staff accounts.");
 v2StaffAdminAccounts=Array.isArray(result)?result:[];
 return v2StaffAdminAccounts;
}

window.ownerEditAccount=async function ownerEditAccount(){
 if(role!=="owner")return;
 try{
  const accounts=await v2LoadStaffAdminAccounts();
  const account=accounts.find(item=>item.role==="owner");
  if(!account)throw new Error("Owner account not found.");
  clearInterval(timerInterval);
  document.getElementById("root").innerHTML=`
  <div class="app">
   <button class="back" onclick="ownerStaffManagement()">← BACK</button>
   <div class="logo">MR K BURGERS<span>OWNER — ACCOUNT</span></div>
   <div class="panel">
    <span class="badge">👑 OWNER ACCOUNT</span>
    <h1>${esc(account.name)}</h1>
    <div class="info-row"><span>Name</span><input id="v2OwnerName" value="${esc(account.name)}"></div>
    <div class="info-row"><span>Staff ID</span><input id="v2OwnerStaffId" value="${esc(account.staff_id)}"></div>
    <div class="info-row"><span>Role</span><strong>OWNER</strong></div>
    <button class="primary" style="margin-top:20px;width:100%" onclick="v2SaveOwnerAccountDetails(${Number(account.id)})">SAVE CHANGES</button>
    <button class="secondary" style="margin-top:12px;width:100%" onclick="v2ChangeStaffPinPage(${Number(account.id)})">CHANGE 8-DIGIT PIN</button>
   </div>
  </div>`;
 }catch(error){
  alert(error.message||"Unable to load Owner account.");
 }
};

window.v2SaveOwnerAccountDetails=async function v2SaveOwnerAccountDetails(accountId){
 const name=String(document.getElementById("v2OwnerName")?.value||"").trim();
 const staffId=String(document.getElementById("v2OwnerStaffId")?.value||"").trim();
 if(!name||!staffId){
  alert("Name and Staff ID are required.");
  return;
 }
 try{
  const response=await fetch(`/api/staff-admin/${Number(accountId)}`,{
   method:"PATCH",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({name,staff_id:staffId})
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||"Unable to update Owner account.");
  currentStaffName=result.name;
  currentStaffId=result.staff_id;
  if(typeof ownerAccount==="object"&&ownerAccount){
   ownerAccount.name=result.name;
   ownerAccount.staffId=result.staff_id;
   localStorage.setItem("mrkOwnerAccount",JSON.stringify(ownerAccount));
  }
  alert("Owner account updated successfully.");
  await ownerEditAccount();
 }catch(error){
  alert(error.message||"Unable to update Owner account.");
 }
};

window.ownerStaffList=async function ownerStaffList(){
 if(role!=="owner")return;
 try{
  const accounts=await v2LoadStaffAdminAccounts();
  const rows=accounts.filter(account=>account.role!=="owner").map(account=>`
   <div class="card">
    <div class="category-icon">${account.role==="manager"?"🧑‍💼":account.role==="cashier"?"💵":"🍳"}</div>
    <h3>${esc(account.name)}</h3>
    <p class="muted">${esc(account.staff_id)} — ${esc(String(account.role).toUpperCase())}</p>
    <p class="muted">${account.active?"ACTIVE":"INACTIVE"}</p>
    <button class="primary" onclick="v2StaffAdminEditPage(${Number(account.id)})">EDIT</button>
    <button class="secondary" onclick="v2ChangeStaffPinPage(${Number(account.id)})">CHANGE PIN</button>
    <button class="secondary" onclick="v2ToggleStaffAdminActive(${Number(account.id)},${account.active?"false":"true"})">${account.active?"DEACTIVATE":"ACTIVATE"}</button>
   </div>`).join("");
  clearInterval(timerInterval);
  document.getElementById("root").innerHTML=`
  <div class="app">
   <button class="back" onclick="ownerStaffManagement()">← BACK</button>
   <div class="logo">MR K BURGERS<span>OWNER — STAFF LIST</span></div>
   <div class="panel">
    <span class="badge">👥 POS STAFF ACCOUNTS</span>
    <h1>Staff Accounts</h1>
    <p class="muted">These are the real POS login accounts stored on the restaurant server.</p>
    <div class="grid">${rows||'<p class="muted">No staff accounts found.</p>'}</div>
   </div>
  </div>`;
 }catch(error){
  alert(error.message||"Unable to load staff accounts.");
 }
};

window.v2StaffAdminEditPage=async function v2StaffAdminEditPage(accountId){
 try{
  if(!v2StaffAdminAccounts.length)await v2LoadStaffAdminAccounts();
  const account=v2StaffAdminAccounts.find(item=>Number(item.id)===Number(accountId));
  if(!account||account.role==="owner")return;
  document.getElementById("root").innerHTML=`
  <div class="app">
   <button class="back" onclick="ownerStaffList()">← BACK</button>
   <div class="logo">MR K BURGERS<span>OWNER — EDIT STAFF ACCOUNT</span></div>
   <div class="panel">
    <span class="badge">✏️ EDIT POS ACCOUNT</span>
    <h1>${esc(account.name)}</h1>
    <div class="info-row"><span>Name</span><input id="v2EditStaffName" value="${esc(account.name)}"></div>
    <div class="info-row"><span>Staff ID</span><input id="v2EditStaffId" value="${esc(account.staff_id)}"></div>
    <div class="info-row"><span>Role</span><select id="v2EditStaffRole">
     <option value="manager" ${account.role==="manager"?"selected":""}>Manager</option>
     <option value="cashier" ${account.role==="cashier"?"selected":""}>Cashier</option>
     <option value="kitchen" ${account.role==="kitchen"?"selected":""}>Kitchen</option>
    </select></div>
    <button class="primary" style="margin-top:20px;width:100%" onclick="v2SaveStaffAdminAccount(${Number(account.id)})">SAVE CHANGES</button>
    <button class="secondary" style="margin-top:12px;width:100%" onclick="v2ChangeStaffPinPage(${Number(account.id)})">CHANGE PIN</button>
   </div>
  </div>`;
 }catch(error){
  alert(error.message||"Unable to open staff account.");
 }
};

window.v2SaveStaffAdminAccount=async function v2SaveStaffAdminAccount(accountId){
 const name=String(document.getElementById("v2EditStaffName")?.value||"").trim();
 const staffId=String(document.getElementById("v2EditStaffId")?.value||"").trim();
 const staffRole=String(document.getElementById("v2EditStaffRole")?.value||"").trim();
 if(!name||!staffId||!staffRole){
  alert("Please complete all account fields.");
  return;
 }
 try{
  const response=await fetch(`/api/staff-admin/${Number(accountId)}`,{
   method:"PATCH",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({name,staff_id:staffId,role:staffRole})
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||"Unable to update staff account.");
  alert("Staff account updated successfully.");
  await ownerStaffList();
 }catch(error){
  alert(error.message||"Unable to update staff account.");
 }
};

window.v2ToggleStaffAdminActive=async function v2ToggleStaffAdminActive(accountId,active){
 if(!confirm(`${active?"Activate":"Deactivate"} this POS account?`))return;
 try{
  const response=await fetch(`/api/staff-admin/${Number(accountId)}/active`,{
   method:"PATCH",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({active:Boolean(active)})
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||"Unable to update account status.");
  await ownerStaffList();
 }catch(error){
  alert(error.message||"Unable to update account status.");
 }
};

window.ownerAddStaff=function ownerAddStaff(){
 if(role!=="owner")return;
 clearInterval(timerInterval);
 document.getElementById("root").innerHTML=`
 <div class="app">
  <button class="back" onclick="ownerStaffManagement()">← BACK</button>
  <div class="logo">MR K BURGERS<span>OWNER — ADD STAFF ACCOUNT</span></div>
  <div class="panel">
   <span class="badge">➕ NEW POS ACCOUNT</span>
   <h1>Create Staff Account</h1>
   <p class="muted">Employee salary/profile information will be connected in Staff Backend Phase 2.</p>
   <div class="info-row"><span>Name</span><input id="v2NewAdminStaffName" placeholder="Staff name"></div>
   <div class="info-row"><span>Staff ID</span><input id="v2NewAdminStaffId" placeholder="Staff ID"></div>
   <div class="info-row"><span>Role</span><select id="v2NewAdminStaffRole" onchange="v2RefreshNewStaffPinHint()">
    <option value="">Select role</option>
    <option value="manager">Manager</option>
    <option value="cashier">Cashier</option>
    <option value="kitchen">Kitchen</option>
   </select></div>
   <div class="info-row"><span>PIN</span><input id="v2NewAdminStaffPin" type="password" inputmode="numeric" autocomplete="new-password" placeholder="Select role first"></div>
   <div id="v2NewStaffPinHint" class="system-note">Manager uses 8 digits. Cashier and Kitchen use 4 digits.</div>
   <button class="primary" style="margin-top:20px;width:100%" onclick="v2CreateStaffAdminAccount()">CREATE STAFF ACCOUNT</button>
  </div>
 </div>`;
};

window.v2RefreshNewStaffPinHint=function v2RefreshNewStaffPinHint(){
 const selected=String(document.getElementById("v2NewAdminStaffRole")?.value||"");
 const input=document.getElementById("v2NewAdminStaffPin");
 const length=selected==="manager"?8:(selected==="cashier"||selected==="kitchen"?4:0);
 if(input){
  input.maxLength=length||8;
  input.value="";
  input.placeholder=length?`${length}-digit PIN`:"Select role first";
 }
};

window.v2CreateStaffAdminAccount=async function v2CreateStaffAdminAccount(){
 const name=String(document.getElementById("v2NewAdminStaffName")?.value||"").trim();
 const staffId=String(document.getElementById("v2NewAdminStaffId")?.value||"").trim();
 const staffRole=String(document.getElementById("v2NewAdminStaffRole")?.value||"").trim();
 const pin=String(document.getElementById("v2NewAdminStaffPin")?.value||"").trim();
 const length=staffRole==="manager"?8:4;
 if(!name||!staffId||!["manager","cashier","kitchen"].includes(staffRole)){
  alert("Please complete all staff account fields.");
  return;
 }
 if(!new RegExp(`^\\d{${length}}$`).test(pin)){
  alert(`PIN must be exactly ${length} numeric digits.`);
  return;
 }
 try{
  const response=await fetch("/api/staff-admin",{
   method:"POST",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({name,staff_id:staffId,role:staffRole,pin})
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||"Unable to create staff account.");
  alert("Staff account created successfully.");
  await ownerStaffList();
 }catch(error){
  alert(error.message||"Unable to create staff account.");
 }
};
