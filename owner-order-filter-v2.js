/* Owner/manager order-history date filter controls */
(function(){
 function v2EnhanceOrderHistoryFilter(){
  const label=document.querySelector("#root .logo span");
  const labelText=String(label?.textContent||"").trim();
  if(!labelText.includes("ORDER HISTORY"))return;

  const input=document.querySelector('#root input[type="date"]');
  if(!input||document.getElementById("v2OwnerOrderHistoryActions"))return;

  input.removeAttribute("onchange");
  input.onchange=null;

  const isManager=labelText.includes("MANAGER");
  const actions=document.createElement("div");
  actions.id="v2OwnerOrderHistoryActions";
  actions.className="actions";
  actions.style.margin="10px 0 20px";
  actions.innerHTML=`
   <button class="primary" onclick="v2ApplyOrderHistoryDateFilter(${isManager?'true':'false'})">APPLY</button>
   <button class="secondary" onclick="v2ClearOrderHistoryDateFilter(${isManager?'true':'false'})">CLEAR / SHOW ALL</button>`;
  input.insertAdjacentElement("afterend",actions);
 }

 window.v2ApplyOrderHistoryDateFilter=function v2ApplyOrderHistoryDateFilter(isManager){
  const value=document.querySelector('#root input[type="date"]')?.value||"";
  if(isManager&&typeof managerOrderHistory==="function")return managerOrderHistory(value);
  if(typeof ownerOrderHistory==="function")return ownerOrderHistory(value);
 };

 window.v2ClearOrderHistoryDateFilter=function v2ClearOrderHistoryDateFilter(isManager){
  if(isManager&&typeof managerOrderHistory==="function")return managerOrderHistory("");
  if(typeof ownerOrderHistory==="function")return ownerOrderHistory("");
 };

 if(typeof ownerOrderHistory==="function"){
  const originalOwnerOrderHistory=ownerOrderHistory;
  window.ownerOrderHistory=function ownerOrderHistory(selectedDate){
   const result=originalOwnerOrderHistory(selectedDate);
   v2EnhanceOrderHistoryFilter();
   return result;
  };
 }

 if(typeof managerOrderHistory==="function"){
  const originalManagerOrderHistory=managerOrderHistory;
  window.managerOrderHistory=function managerOrderHistory(selectedDate){
   const result=originalManagerOrderHistory(selectedDate);
   v2EnhanceOrderHistoryFilter();
   return result;
  };
 }
})();
