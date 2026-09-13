window.v2EditMenuItem=async function v2EditMenuItem(id){
 await loadV2BackendMenu(true);
 const item=id?ownerMenuData.find(i=>i.id===id):null;
 const selectedIngredients=new Set(item?.ingredientIds||[]);
 const removable=new Set(item?.removableIngredientIds||[]);
 const selectedExtras=new Set(item?.allowedExtraIds||[]);
 const quantities=item?.ingredientQuantities||{};
 const extraCandidates=ownerMenuData.filter(i=>i.category==="extraToppings" && i.id!==id);

 document.getElementById("root").innerHTML=`
 <div class="app">
  <button class="back" onclick="v2OwnerMenuItems()">← BACK</button>
  <div class="logo">MR K BURGERS<span>${item?'EDIT':'ADD'} MENU ITEM</span></div>
  <div class="panel"><div class="form">
   <label>Name</label><input id="v2ItemName" value="${esc(item?.name||'')}">
   <label>Category</label><select id="v2ItemCategory">
    ${menuCategoryData.map(c=>`<option value="${c.id}" ${item?.category===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}
   </select>
   <label>Price (CFA)</label><input id="v2ItemPrice" type="number" min="0" value="${Number(item?.price||0)}">
   <label><input id="v2ItemActive" type="checkbox" ${item?.active!==false?'checked':''}> Active</label>
   <h3>Ingredients</h3>
   <p class="muted">Choose the ingredients used by one unit of this menu item and set the quantity used.</p>
   ${menuIngredients.map(ing=>`
    <div class="ingredient-row">
     <input class="v2-ing" type="checkbox" value="${ing.id}" ${selectedIngredients.has(ing.id)?'checked':''}>
     <label style="flex:1">${esc(ing.name)}</label>
     <label style="flex:0 0 auto">Qty
      <input class="v2-ing-qty" data-id="${ing.id}" type="number" min="0.01" step="0.01" value="${Number(quantities[ing.id]??1)}" style="width:85px">
     </label>
     <label style="flex:0 0 auto"><input class="v2-rem" data-id="${ing.id}" type="checkbox" ${removable.has(ing.id)?'checked':''}> Removable</label>
    </div>`).join('')}
   <h3>Allowed Extras</h3>
   ${extraCandidates.map(extra=>`<div class="ingredient-row"><input class="v2-extra" type="checkbox" value="${extra.id}" ${selectedExtras.has(extra.id)?'checked':''}><label>${esc(extra.name)} — ${Number(extra.price||0).toLocaleString()} CFA</label></div>`).join('')||'<p class="muted">No extra items available.</p>'}
   <button class="primary" onclick="v2SaveMenuItem('${id||''}')">SAVE</button>
  </div></div>
 </div>`;
};

window.v2SaveMenuItem=async function v2SaveMenuItem(id){
 const name=document.getElementById('v2ItemName').value.trim();
 const category_id=document.getElementById('v2ItemCategory').value;
 const price=Number(document.getElementById('v2ItemPrice').value);
 const active=document.getElementById('v2ItemActive').checked;
 const ingredient_ids=[...document.querySelectorAll('.v2-ing:checked')].map(el=>el.value);
 const ingredient_quantities={};

 for(const ingredientId of ingredient_ids){
  const input=document.querySelector(`.v2-ing-qty[data-id="${ingredientId}"]`);
  const quantity=Number(input?.value);
  if(!Number.isFinite(quantity)||quantity<=0){
   return alert('Every selected ingredient must have a quantity greater than 0.');
  }
  ingredient_quantities[ingredientId]=quantity;
 }

 const removable_ingredient_ids=[...document.querySelectorAll('.v2-rem:checked')]
  .map(el=>el.dataset.id)
  .filter(x=>ingredient_ids.includes(x));
 const extra_ids=[...document.querySelectorAll('.v2-extra:checked')].map(el=>el.value);

 if(!name || !Number.isFinite(price) || price<0){
  return alert('Enter a valid name and price.');
 }

 try{
  await v2MenuRequest(id?`/api/menu/items/${encodeURIComponent(id)}`:'/api/menu/items',{
   method:id?'PATCH':'POST',
   body:JSON.stringify({
    name,
    category_id,
    price,
    active,
    ingredient_ids,
    ingredient_quantities,
    removable_ingredient_ids,
    extra_ids
   })
  });
  v2OwnerMenuItems();
 }catch(error){
  alert(error.message);
 }
};
