const v2PreviousStockHistory=window.managerStockHistory;

window.managerStockHistory=async function managerStockHistory(selectedDate,selectedSupplierId){
 await v2PreviousStockHistory(selectedDate,selectedSupplierId);

 const panel=document.querySelector("#root .panel");
 if(!panel)return;

 const dateInput=panel.querySelector('input[type="date"]');
 const supplierSelect=document.getElementById("stockHistorySupplier");
 if(!dateInput)return;

 dateInput.removeAttribute("onchange");
 dateInput.onchange=null;

 [...panel.querySelectorAll("button")].forEach(button=>{
  if(button.textContent.trim().toUpperCase()==="ALL DATES"){
   button.remove();
  }
 });

 if(!document.getElementById("stockHistoryApplyDate")){
  const applyButton=document.createElement("button");
  applyButton.id="stockHistoryApplyDate";
  applyButton.className="primary";
  applyButton.style.margin="10px 0 20px 0";
  applyButton.textContent="APPLY DATE";
  applyButton.onclick=()=>{
   window.managerStockHistory(
    dateInput.value,
    supplierSelect?.value||""
   );
  };
  dateInput.insertAdjacentElement("afterend",applyButton);
 }
};
