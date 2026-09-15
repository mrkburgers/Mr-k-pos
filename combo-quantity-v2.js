/* Cashier combo quantity control */
(function(){
 let comboQuantity=1;

 function isComboBuilderVisible(){
  const addButton=[...document.querySelectorAll("#root button")]
   .find(button=>String(button.textContent||"").trim()==="ADD COMBO TO ORDER");
  return addButton||null;
 }

 function renderQuantityControl(){
  const addButton=isComboBuilderVisible();
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
    <strong id="v2ComboQtyValue">${comboQuantity}</strong>
    <button type="button" id="v2ComboQtyPlus">+</button>
   </div>
   <p class="muted">This repeats the same combo configuration.</p>`;
  document.getElementById("v2ComboQtyMinus").onclick=function(event){
   event.preventDefault();
   event.stopPropagation();
   comboQuantity=Math.max(1,comboQuantity-1);
   renderQuantityControl();
  };
  document.getElementById("v2ComboQtyPlus").onclick=function(event){
   event.preventDefault();
   event.stopPropagation();
   comboQuantity+=1;
   renderQuantityControl();
  };
 }

 const originalOpen=window.v2OpenCashierCombo;
 if(typeof originalOpen==="function"){
  window.v2OpenCashierCombo=function v2OpenCashierCombo(comboId){
   comboQuantity=1;
   const result=originalOpen(comboId);
   queueMicrotask(renderQuantityControl);
   return result;
  };
 }

 const originalRender=window.v2RenderCashierComboBuilder;
 if(typeof originalRender==="function"){
  window.v2RenderCashierComboBuilder=function v2RenderCashierComboBuilder(){
   const result=originalRender();
   queueMicrotask(renderQuantityControl);
   return result;
  };
 }

 const originalAdd=window.v2AddCashierComboToCart;
 if(typeof originalAdd==="function"){
  window.v2AddCashierComboToCart=function v2AddCashierComboToCart(){
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

 const observer=new MutationObserver(()=>{
  if(isComboBuilderVisible())renderQuantityControl();
 });
 const root=document.getElementById("root");
 if(root)observer.observe(root,{childList:true,subtree:true});
})();
