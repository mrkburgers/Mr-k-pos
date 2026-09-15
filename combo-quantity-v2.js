/* Cashier combo quantity bridge */
(function(){
 const originalOpen=window.v2OpenCashierCombo;
 if(typeof originalOpen==="function"){
  window.v2OpenCashierCombo=function v2OpenCashierCombo(comboId){
   originalOpen(comboId);
   if(v2CashierComboDraft)v2CashierComboDraft.combo_qty=1;
   if(typeof v2RenderCashierComboBuilder==="function")v2RenderCashierComboBuilder();
  };
 }

 const originalRender=window.v2RenderCashierCombo