/* Cashier combo quantity control */
(function(){
 let comboQuantity=1;

 function renderQuantityControl(){
  const addButton=[...document.querySelectorAll("#root button")]
   .find(button=>String(button.textContent||"").trim()==="ADD COMBO TO ORDER");
  if(!addButton)return;

  let block=document.getElementById("v2ComboQtyBlock");
  if(!block){
   block=document.createElement("div");
   block.id="v2Combo