/* Cashier combo quantity control - no observer */
(function(){
 let comboQuantity=1;

 function attachQuantity(){
  const addButton=[...document.querySelectorAll("#root button")]
   .find(button=>String(button.textContent||"").trim()==="ADD COMBO TO ORDER");
  if(!addButton)return;

  let block=document.getElementById("v2ComboQtyBlock");
  if(!block){
   block=document.createElement("div");
   block.id="v2ComboQtyBlock";
   block.style.marginTop="22px";
   addButton.insertAdjacentElement("beforebegin",block);
  }

  block.innerHTML=`
   <h3>COMBO QUANTITY</h3>
   <div class="qty">
    <button type="button" id="v2ComboQtyMinus">−</button>
    <strong>${comboQuantity}</strong>
    <button type="button" id="v2ComboQtyPlus">+</button>
   </div>
   <p class="muted">This repeats the same combo configuration.</p>`;

  document.getElementById("v2ComboQtyMinus").onclick=()=>{
   comboQuantity=Math.max(1,comboQuantity-1);
   attachQuantity();
  };
  document.getElementById("v2ComboQtyPlus").onclick=()=>{
   comboQuantity+=1;
   attachQuantity();
  };
 }

 const originalOpen=window.v2OpenCashierCombo;
 if(typeof originalOpen==="function"){
  window.v2OpenCashierCombo=function(comboId){
   comboQuantity=1;
   const result=originalOpen(comboId);
   attachQuantity();
   return result;
  };
 }

 const originalRender=window.v2RenderCashierComboBuilder;
 if(typeof originalRender==="function"){
  window.v2RenderCashierComboBuilder=function(){
   const result=originalRender();
   attachQuantity();
   return result;
  };
 }

 const originalAdd=window.v2AddCashierComboToCart;
 if(typeof originalAdd==="function"){
  window.v2AddCashierComboToCart=function(){
   const before=cart.length;
   const qty=comboQuantity;
   const result=originalAdd();
   if(cart.length>before){
    const added=cart[cart.length-1];
    if(added?.comboId){
     added.qty=Math.max(1,Number(qty||1));
     if(typeof viewCart==="function")viewCart();
    }
   }
   return result;
  };
 }
})();
