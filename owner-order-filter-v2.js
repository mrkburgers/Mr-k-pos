/* Owner/manager order-history date filter controls */
(function(){
 function enhanceOwnerOrderHistoryFilter(){
  const label=document.querySelector("#root .logo span");
  if(!label||!String(label.textContent||"").includes("ORDER HISTORY"))return;
  const input=document.querySelector('#root input[type="date"]');
  if(!input||document.getElementById("v2OwnerOrderHistoryActions"))return;

  input.remove