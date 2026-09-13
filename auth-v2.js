window.login=function login(){

 const u=document
  .getElementById("user")
  .value.trim();

 const p=document
  .getElementById("pin")
  .value.trim();

 const ownerStaffId=String(ownerAccount?.staffId ?? "").trim();
 const ownerPin=String(ownerAccount?.pin ?? "").trim();

 if(
  u.toLowerCase()===ownerStaffId.toLowerCase() &&
  p===ownerPin
 ){

  loggedIn=true;
  role="owner";
  currentStaffName=ownerAccount.name;
  currentStaffId=ownerStaffId;

  getActiveShift();
  getShiftHistory();
  showStorageIntegrityWarning();
  ownerHome();
  return;
 }

 const staff=staffAccounts.find(s=>{
  const staffId=String(s?.staffId ?? "").trim();
  const pin=String(s?.pin ?? "").trim();

  return (
   staffId.toLowerCase()===u.toLowerCase() &&
   pin===p
  );
 });

 if(!staff){
  alert("Invalid Staff ID or PIN.");
  return;
 }

 if(!staff.active){
  alert("This staff account is inactive.");
  return;
 }

 loggedIn=true;
 role=staff.role;
 currentStaffName=staff.name;
 currentStaffId=String(staff.staffId ?? "").trim();

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
};
