let v2BackendStaff=[];

async function loadV2BackendStaff(){
 try{
  const response=await fetch("/api/staff");
  if(!response.ok){
   throw new Error("Unable to load staff accounts");
  }
  v2BackendStaff=await response.json();
 }catch(error){
  v2BackendStaff=[];
 }
}

window.loginScreen=async function loginScreen(){
 await loadV2BackendStaff();

 const activeAccounts=v2BackendStaff.filter(account=>account.active);

 document.getElementById("root").innerHTML=`
 <div class="login">
  <div class="loginbox">
   <div class="logo">MR K BURGERS<span>POS SYSTEM</span></div>

   <div class="form" style="margin-top:30px">
    <label>Staff ID</label>
    <input id="user" placeholder="Staff ID">

    <label>PIN</label>
    <input id="pin" type="password" placeholder="PIN">

    <button class="primary" onclick="login()">LOGIN</button>
   </div>

   <p class="muted" style="margin-top:20px">
    ${
     activeAccounts.length
     ?activeAccounts.map(account=>
       `${esc(account.name)}: ${esc(account.staff_id)}`
      ).join("<br>")
     :"Unable to load staff accounts from the restaurant server."
    }
   </p>
  </div>
 </div>`;
};

window.login=async function login(){
 const u=document
  .getElementById("user")
  .value.trim();

 const p=document
  .getElementById("pin")
  .value.trim();

 if(!u || !p){
  alert("Enter Staff ID and PIN.");
  return;
 }

 try{
  const response=await fetch("/api/login",{
   method:"POST",
   headers:{
    "Content-Type":"application/json"
   },
   body:JSON.stringify({
    staff_id:u,
    pin:p
   })
  });

  const result=await response.json();

  if(!response.ok){
   alert(result.error || "Invalid Staff ID or PIN.");
   return;
  }

  loggedIn=true;
  role=result.role;
  currentStaffName=result.name;
  currentStaffId=result.staff_id;

  if(role==="owner"){
   getActiveShift();
   getShiftHistory();
   showStorageIntegrityWarning();
   ownerHome();
   return;
  }

  if(role==="manager"){
   managerHome();
   return;
  }

  if(role==="kitchen"){
   kitchenHome();
   return;
  }

  if(role==="cashier"){
   home();
   return;
  }

  alert("Invalid staff role.");

 }catch(error){
  alert("Unable to connect to the restaurant server.");
 }
};

if(!loggedIn){
 loginScreen();
}
