async function v2MenuRequest(url,options={}){
 const response=await fetch(url,{
  ...options,
  headers:{"Content-Type":"application/json",...(options.headers||{})}
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok){
  throw new Error(data.error||"Menu update failed");
 }
 v2BackendMenuReady=null;
 await loadV2BackendMenu(true);
 return data;
}

window.ownerMenuManagement=async function ownerMenuManagement(){
 if(role!=="owner"){
  alert("Only the owner can manage the menu.");
  return ownerHome();
 }
 try{await loadV2BackendMenu(true);}catch(error){
  return alert("Unable to load Menu Management from the restaurant server.");
 }
 document.getElementById("root").innerHTML=`
 <div class="app">
  <button class="back" onclick="ownerHome()">← BACK</button>
  <div class="logo">MR K BURGERS<span>OWNER — MENU MANAGEMENT</span></div>
  <div class="panel">
   <div class="grid">
    <div class="card clickable" onclick="v2OwnerMenuItems()">
     <div class="category-icon">🍔</div><h3>MENU ITEMS</h3>
     <p class="muted">Prices, availability, ingredients and extras</p>
    </div>
    <div class="card clickable" onclick="v2OwnerCategories()">
     <div class="category-icon">📂</div><h3>CATEGORIES</h3>
     <p class="muted">Names, icons and availability</p>
    </div>
    <div class="card clickable" onclick="v2OwnerIngredients()">
     <div class="category-icon">🥬</div><h3>INGREDIENTS</h3>
     <p class="muted">Names and availability</p>
    </div>
   </div>
  </div>
 </div>`;
};

window.v2OwnerMenuItems=async function v2OwnerMenuItems(){
 await loadV2BackendMenu(true);
 const categoryName=id=>menuCategoryData.find(c=>c.id===id)?.name||id;
 document.getElementById("root").innerHTML=`
 <div class="app">
  <button class="back" onclick="ownerMenuManagement()">← BACK</button>
  <div class="logo">MR K BURGERS<span>OWNER — MENU ITEMS</span></div>
  <div class="panel">
   <button class="primary" onclick="v2EditMenuItem('')">+ ADD MENU ITEM</button>
   ${ownerMenuData.map(item=>`
    <div class="order-card clickable" onclick="v2EditMenuItem('${item.id}')">
     <div class="order-top"><div><div class="order-number">${esc(item.name)}</div><div class="muted">${esc(categoryName(item.category))}</div></div>
      <span class="status ${item.active?'ready':''}">${item.active?'ACTIVE':'INACTIVE'}</span>
     </div>
     <div class="info-row"><span>Price</span><strong>${Number(item.price||0).toLocaleString()} CFA</strong></div>
    </div>`).join("")}
  </div>
 </div>`;
};

window.v2EditMenuItem=async function v2EditMenuItem(id){
 await loadV2BackendMenu(true);
 const item=id?ownerMenuData.find(i=>i.id===id):null;
 const selectedIngredients=new Set(item?.ingredientIds||[]);
 const removable=new Set(item?.removableIngredientIds||[]);
 const selectedExtras=new Set(item?.allowedExtraIds||[]);
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
   ${menuIngredients.map(ing=>`<div class="ingredient-row"><input class="v2-ing" type="checkbox" value="${ing.id}" ${selectedIngredients.has(ing.id)?'checked':''}><label>${esc(ing.name)}</label><label style="flex:0 0 auto"><input class="v2-rem" data-id="${ing.id}" type="checkbox" ${removable.has(ing.id)?'checked':''}> Removable</label></div>`).join('')}
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
 const removable_ingredient_ids=[...document.querySelectorAll('.v2-rem:checked')].map(el=>el.dataset.id).filter(x=>ingredient_ids.includes(x));
 const extra_ids=[...document.querySelectorAll('.v2-extra:checked')].map(el=>el.value);
 if(!name || !Number.isFinite(price) || price<0)return alert('Enter a valid name and price.');
 try{
  await v2MenuRequest(id?`/api/menu/items/${encodeURIComponent(id)}`:'/api/menu/items',{
   method:id?'PATCH':'POST',
   body:JSON.stringify({name,category_id,price,active,ingredient_ids,removable_ingredient_ids,extra_ids})
  });
  v2OwnerMenuItems();
 }catch(error){alert(error.message);}
};

window.v2OwnerCategories=async function v2OwnerCategories(){
 await loadV2BackendMenu(true);
 document.getElementById("root").innerHTML=`
 <div class="app"><button class="back" onclick="ownerMenuManagement()">← BACK</button>
  <div class="logo">MR K BURGERS<span>OWNER — CATEGORIES</span></div>
  <div class="panel">
   ${menuCategoryData.map(c=>`<div class="summary"><div class="form">
    <label>Name</label><input id="cat-name-${c.id}" value="${esc(c.name)}">
    <label>Icon</label><input id="cat-icon-${c.id}" maxlength="4" value="${esc(c.icon||'🍽️')}">
    <label><input id="cat-active-${c.id}" type="checkbox" ${c.active?'checked':''}> Active</label>
    <button class="primary" onclick="v2SaveCategory('${c.id}')">SAVE ${esc(c.name)}</button>
   </div></div>`).join('')}
  </div>
 </div>`;
};

window.v2SaveCategory=async function v2SaveCategory(id){
 try{
  await v2MenuRequest(`/api/menu/categories/${encodeURIComponent(id)}`,{
   method:'PATCH',body:JSON.stringify({
    name:document.getElementById(`cat-name-${id}`).value.trim(),
    icon:document.getElementById(`cat-icon-${id}`).value.trim()||'🍽️',
    active:document.getElementById(`cat-active-${id}`).checked
   })
  });
  v2OwnerCategories();
 }catch(error){alert(error.message);}
};

window.v2OwnerIngredients=async function v2OwnerIngredients(){
 await loadV2BackendMenu(true);
 document.getElementById("root").innerHTML=`
 <div class="app"><button class="back" onclick="ownerMenuManagement()">← BACK</button>
  <div class="logo">MR K BURGERS<span>OWNER — INGREDIENTS</span></div>
  <div class="panel">
   <div class="form"><input id="v2NewIngredient" placeholder="New ingredient name"><button class="primary" onclick="v2AddIngredient()">+ ADD INGREDIENT</button></div>
   ${menuIngredients.map(i=>`<div class="summary"><div class="form">
    <input id="ing-name-${i.id}" value="${esc(i.name)}">
    <label><input id="ing-active-${i.id}" type="checkbox" ${i.active?'checked':''}> Active</label>
    <button class="primary" onclick="v2SaveIngredient('${i.id}')">SAVE</button>
   </div></div>`).join('')}
  </div>
 </div>`;
};

window.v2AddIngredient=async function v2AddIngredient(){
 const name=document.getElementById('v2NewIngredient').value.trim();
 if(!name)return;
 try{await v2MenuRequest('/api/menu/ingredients',{method:'POST',body:JSON.stringify({name})});v2OwnerIngredients();}catch(error){alert(error.message);}
};

window.v2SaveIngredient=async function v2SaveIngredient(id){
 try{
  await v2MenuRequest(`/api/menu/ingredients/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({
   name:document.getElementById(`ing-name-${id}`).value.trim(),
   active:document.getElementById(`ing-active-${id}`).checked
  })});
  v2OwnerIngredients();
 }catch(error){alert(error.message);}
};

let v2InventoryCache=null;

async function loadV2Inventory(force=false){
 if(v2InventoryCache && !force)return v2InventoryCache;
 const response=await fetch('/api/inventory',{cache:'no-store'});
 if(!response.ok)throw new Error('Unable to load inventory');
 v2InventoryCache=await response.json();
 return v2InventoryCache;
}

function v2InventoryCard(item,canEdit){
 return `
  <div class="order-card">
   <div class="order-top">
    <div>
     <div class="order-number">${esc(item.name)}</div>
     <div class="muted">${item.tracked?'Tracked':'Not tracked'} · ${esc(item.unit||'unit')}</div>
    </div>
    <span class="status ${item.low_stock?'':'ready'}">${item.low_stock?'LOW STOCK':'OK'}</span>
   </div>
   <div class="info-row"><span>Stock</span><strong>${Number(item.stock||0).toLocaleString()}</strong></div>
   <div class="info-row"><span>Low-stock level</span><strong>${Number(item.low_stock_level||0).toLocaleString()}</strong></div>
   ${canEdit?`
   <div class="form" style="margin-top:14px">
    <label><input id="inv-track-${item.id}" type="checkbox" ${item.tracked?'checked':''}> Track in inventory</label>
    <label>Unit</label><input id="inv-unit-${item.id}" value="${esc(item.unit||'unit')}">
    <label>Low-stock level</label><input id="inv-low-${item.id}" type="number" min="0" step="0.01" value="${Number(item.low_stock_level||0)}">
    <button class="secondary" onclick="v2SaveInventorySettings('${item.id}')">SAVE SETTINGS</button>
    <label>Stock adjustment</label><input id="inv-adjust-${item.id}" type="number" step="0.01" placeholder="Example: 10 or -2">
    <input id="inv-note-${item.id}" placeholder="Reason / note">
    <button class="primary" onclick="v2AdjustInventory('${item.id}')">APPLY STOCK ADJUSTMENT</button>
   </div>`:''}
  </div>`;
}

async function v2RenderInventory(title,backFn,canEdit){
 try{
  const data=await loadV2Inventory(true);
  document.getElementById('root').innerHTML=`
   <div class="app">
    <button class="back" onclick="${backFn}()">← BACK</button>
    <div class="logo">MR K BURGERS<span>${title}</span></div>
    <div class="panel">
     <div class="system-note">Tracked ingredients are deducted automatically when a paid cashier order is saved.</div>
     ${(data.items||[]).map(item=>v2InventoryCard(item,canEdit)).join('')||'<p class="muted">No inventory ingredients.</p>'}
    </div>
   </div>`;
 }catch(error){
  alert('Unable to load inventory from the restaurant server.');
 }
}

window.ownerInventory=function ownerInventory(){
 return v2RenderInventory('OWNER — INVENTORY','ownerHome',true);
};

window.managerInventory=function managerInventory(){
 return v2RenderInventory('MANAGER — INVENTORY','managerHome',true);
};

window.v2SaveInventorySettings=async function v2SaveInventorySettings(id){
 const tracked=document.getElementById(`inv-track-${id}`).checked;
 const unit=document.getElementById(`inv-unit-${id}`).value.trim()||'unit';
 const low_stock_level=Number(document.getElementById(`inv-low-${id}`).value||0);
 try{
  const response=await fetch(`/api/inventory/${encodeURIComponent(id)}`,{
   method:'PATCH',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({tracked,unit,low_stock_level})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'Unable to save inventory settings');
  v2InventoryCache=null;
  if(role==='owner')ownerInventory();else managerInventory();
 }catch(error){alert(error.message);}
};

window.v2AdjustInventory=async function v2AdjustInventory(id){
 const quantity=Number(document.getElementById(`inv-adjust-${id}`).value);
 const note=document.getElementById(`inv-note-${id}`).value.trim();
 if(!Number.isFinite(quantity)||quantity===0)return alert('Enter a non-zero stock adjustment.');
 try{
  const response=await fetch(`/api/inventory/${encodeURIComponent(id)}/adjust`,{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({quantity,movement_type:quantity>0?'DELIVERY':'ADJUSTMENT',note,created_by:currentStaffName||currentStaffId||role})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'Unable to adjust stock');
  v2InventoryCache=null;
  if(role==='owner')ownerInventory();else managerInventory();
 }catch(error){alert(error.message);}
};

if(typeof socket!=='undefined' && socket?.on){
 socket.on('inventory-changed',()=>{
  v2InventoryCache=null;
  const text=document.getElementById('root')?.innerText||'';
  if(text.includes('INVENTORY')){
   if(role==='owner')ownerInventory();
   else if(role==='manager')managerInventory();
  }
 });
}
