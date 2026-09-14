// V2 menu administration bridge.
// IMPORTANT: the finalized POS interface in index.html is the source of truth.
// This file must never replace or redesign Owner Menu Management screens.

window.v2OwnerMenuUiRestored=true;

async function v2MenuJson(url,options={}){
 const response=await fetch(url,{
  ...options,
  headers:{
   "Content-Type":"application/json",
   ...(options.headers||{})
  }
 });
 let body={};
 try{body=await response.json();}catch{}
 if(!response.ok){
  const error=new Error(body.error||"Restaurant server request failed");
  error.status=response.status;
  error.body=body;
  throw error;
 }
 return body;
}

function v2IngredientSaveError(error){
 console.error("Ingredient backend save failed",error);
 alert(
  "Unable to save this ingredient to the restaurant server.\n\n"+
  (error?.message||"Please try again.")
 );
}

window.saveNewIngredient=async function saveNewIngredient(){
 const name=document.getElementById("newIngredientName").value.trim();
 const tracked=document.getElementById("newIngredientTracked").value==="true";
 const lowStockLevel=Number(document.getElementById("newIngredientLowStock").value||0);
 if(!name){alert("Please enter an ingredient name.");return;}
 const duplicate=menuIngredients.some(ingredient=>ingredient.name.toLowerCase()===name.toLowerCase());
 if(duplicate){alert("This ingredient already exists.");return;}
 if(!Number.isFinite(lowStockLevel)||lowStockLevel<0){alert("Low Stock Level must be zero or greater.");return;}
 const id="ingredient_"+Date.now()+"_"+Math.random().toString(36).slice(2,8);
 try{
  const created=await v2MenuJson("/api/menu/ingredients",{method:"POST",body:JSON.stringify({id,name,active:true,tracked,low_stock_level:lowStockLevel})});
  menuIngredients.push({id:created.id,name:created.name,tracked:Boolean(created.tracked),lowStockLevel:Number(created.low_stock_level||0),active:Boolean(created.active),unit:"unit"});
  saveMenuIngredients();
  syncTrackedIngredientsToInventory();
  saveInventory();
  if(typeof loadV2BackendMenu==="function")await loadV2BackendMenu(true);
  alert("Ingredient added successfully.");
  ownerIngredientList();
 }catch(error){v2IngredientSaveError(error);}
};

window.saveEditedIngredient=async function saveEditedIngredient(id){
 const ingredient=menuIngredients.find(item=>item.id===id);
 if(!ingredient){alert("Ingredient not found.");return;}
 const name=document.getElementById("editIngredientName").value.trim();
 const tracked=document.getElementById("editIngredientTracked").value==="true";
 const lowStockLevel=Number(document.getElementById("editIngredientLowStock").value||0);
 if(!name){alert("Please enter an ingredient name.");return;}
 const duplicate=menuIngredients.some(item=>item.id!==id&&item.name.toLowerCase()===name.toLowerCase());
 if(duplicate){alert("Another ingredient already uses this name.");return;}
 if(!Number.isFinite(lowStockLevel)||lowStockLevel<0){alert("Low Stock Level must be zero or greater.");return;}
 try{
  await v2MenuJson(`/api/menu/ingredients/${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify({name,active:Boolean(ingredient.active)})});
  await v2MenuJson(`/api/inventory/${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify({tracked,low_stock_level:lowStockLevel,unit:ingredient.unit||"unit"})});
  ingredient.name=name;
  ingredient.tracked=tracked;
  ingredient.lowStockLevel=lowStockLevel;
  saveMenuIngredients();
  syncTrackedIngredientsToInventory();
  saveInventory();
  if(typeof loadV2BackendMenu==="function")await loadV2BackendMenu(true);
  alert("Ingredient updated successfully.");
  ownerIngredientList();
 }catch(error){v2IngredientSaveError(error);}
};

window.toggleIngredientActive=async function toggleIngredientActive(id){
 const ingredient=menuIngredients.find(item=>item.id===id);
 if(!ingredient){alert("Ingredient not found.");return;}
 const nextActive=!ingredient.active;
 try{
  await v2MenuJson(`/api/menu/ingredients/${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify({active:nextActive})});
  ingredient.active=nextActive;
  saveMenuIngredients();
  syncTrackedIngredientsToInventory();
  saveInventory();
  if(typeof loadV2BackendMenu==="function")await loadV2BackendMenu(true);
  ownerIngredientList();
 }catch(error){v2IngredientSaveError(error);}
};

window.deleteMenuIngredient=async function deleteMenuIngredient(id){
 const ingredient=menuIngredients.find(item=>item.id===id);
 if(!ingredient){alert("Ingredient not found.");return;}
 const confirmed=confirm(`Delete "${ingredient.name}" permanently?`);
 if(!confirmed)return;
 try{
  await v2MenuJson(`/api/menu/ingredients/${encodeURIComponent(id)}`,{method:"DELETE"});
  menuIngredients=menuIngredients.filter(item=>item.id!==id);
  saveMenuIngredients();
  syncTrackedIngredientsToInventory();
  saveInventory();
  if(typeof loadV2BackendMenu==="function")await loadV2BackendMenu(true);
  ownerIngredientList();
 }catch(error){v2IngredientSaveError(error);}
};

const v2MenuMultiSelectIds=new Set(["newMenuItemRemovableIngredients","newMenuItemAllowedExtras","editMenuItemRemovableIngredients","editMenuItemAllowedExtras"]);
document.addEventListener("mousedown",event=>{
 const select=event.target?.closest?.("select[multiple]");
 if(!select||!v2MenuMultiSelectIds.has(select.id))return;
 if(event.target.tagName!=="OPTION")return;
 event.preventDefault();
 const option=event.target;
 option.selected=!option.selected;
 select.focus();
 select.dispatchEvent(new Event("change",{bubbles:true}));
});

window.ownerIngredientList=function ownerIngredientList(){
 clearInterval(timerInterval);
 const rows=menuIngredients.map(ingredient=>`
  <div class="card">
   <h3>${esc(ingredient.name)}</h3>
   <p class="muted">Inventory: ${ingredient.tracked?"Tracked":"Not Tracked"}</p>
   <p class="muted">Status: ${ingredient.active?"Active":"Inactive"}</p>
   <button class="primary" onclick="ownerEditIngredient('${ingredient.id}')">EDIT</button>
   <button class="back" onclick="toggleIngredientActive('${ingredient.id}')">${ingredient.active?"DEACTIVATE":"ACTIVATE"}</button>
   <button class="back" onclick="deleteMenuIngredient('${ingredient.id}')">DELETE</button>
  </div>
 `).join("");
 document.getElementById("root").innerHTML=`
 <div class="app">
  <button class="back" onclick="ownerIngredients()">← BACK</button>
  <div class="logo">MR K BURGERS<span>OWNER — INGREDIENT LIST</span></div>
  <div class="panel">
   <span class="badge">📋 INGREDIENT LIST</span>
   <h1>Ingredients</h1>
   <div class="grid">${rows||`<div class="card"><p class="muted">No ingredients found.</p></div>`}</div>
  </div>
 </div>`;
};

function v2CategoryError(error){
 console.error("Category backend save failed",error);
 alert("Unable to save this category to the restaurant server.\n\n"+(error?.message||"Please try again."));
}
async function v2ReloadCategoryList(){
 if(typeof loadV2BackendMenu==="function")await loadV2BackendMenu(true);
 if(typeof ownerCategoryList==="function")ownerCategoryList();
}

const v2LegacySaveNewCategory=window.saveNewCategory;
if(typeof v2LegacySaveNewCategory==="function"){
 window.saveNewCategory=async function saveNewCategory(){
  const before=JSON.parse(JSON.stringify(menuCategoryData));
  const beforeIds=new Set(before.map(category=>category.id));
  v2LegacySaveNewCategory();
  const created=menuCategoryData.find(category=>!beforeIds.has(category.id));
  if(!created)return;
  try{
   await v2MenuJson("/api/menu/categories",{method:"POST",body:JSON.stringify({id:created.id,name:created.name,icon:created.icon||"🍽️",active:created.active!==false})});
   await v2ReloadCategoryList();
  }catch(error){
   menuCategoryData=before;
   saveMenuCategories();
   v2CategoryError(error);
   ownerCategoryList();
  }
 };
}

const v2LegacySaveEditedCategory=window.saveEditedCategory;
if(typeof v2LegacySaveEditedCategory==="function"){
 window.saveEditedCategory=async function saveEditedCategory(id){
  const index=menuCategoryData.findIndex(category=>category.id===id);
  if(index<0){alert("Category not found.");return;}
  const before=JSON.parse(JSON.stringify(menuCategoryData[index]));
  v2LegacySaveEditedCategory(id);
  const updated=menuCategoryData.find(category=>category.id===id);
  if(!updated)return;
  try{
   await v2MenuJson(`/api/menu/categories/${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify({name:updated.name,icon:updated.icon||"🍽️",active:updated.active!==false})});
   await v2ReloadCategoryList();
  }catch(error){
   const currentIndex=menuCategoryData.findIndex(category=>category.id===id);
   if(currentIndex>=0)menuCategoryData[currentIndex]=before;
   saveMenuCategories();
   v2CategoryError(error);
   ownerCategoryList();
  }
 };
}

const v2LegacyToggleCategoryActive=window.toggleCategoryActive;
if(typeof v2LegacyToggleCategoryActive==="function"){
 window.toggleCategoryActive=async function toggleCategoryActive(id){
  const index=menuCategoryData.findIndex(category=>category.id===id);
  if(index<0){alert("Category not found.");return;}
  const before=JSON.parse(JSON.stringify(menuCategoryData[index]));
  v2LegacyToggleCategoryActive(id);
  const updated=menuCategoryData.find(category=>category.id===id);
  if(!updated)return;
  try{
   await v2MenuJson(`/api/menu/categories/${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify({name:updated.name,icon:updated.icon||"🍽️",active:updated.active!==false})});
   await v2ReloadCategoryList();
  }catch(error){
   const currentIndex=menuCategoryData.findIndex(category=>category.id===id);
   if(currentIndex>=0)menuCategoryData[currentIndex]=before;
   saveMenuCategories();
   v2CategoryError(error);
   ownerCategoryList();
  }
 };
}

function v2MovementDate(value){
 if(!value)return null;
 const text=String(value);
 const date=new Date(text.includes("T")?text:text.replace(" ","T")+"Z");
 return Number.isNaN(date.getTime())?null:date;
}

window.addEventListener("load",()=>{
 const originalDeliveryHistory=window.managerDeliveryHistory;
 if(typeof originalDeliveryHistory==="function"){
  window.managerDeliveryHistory=async function managerDeliveryHistory(){
   await originalDeliveryHistory();
   const panel=document.querySelector("#root .panel");
   if(!panel)return;
   const description=[...panel.querySelectorAll("p.muted")].find(p=>p.textContent.includes("View received supplier deliveries"));
   if(!description)return;
   const deliveries=[...(Array.isArray(inventoryDeliveries)?inventoryDeliveries:[])].sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));
   const cards=[...panel.querySelectorAll(".order-card")];
   cards.forEach((card,index)=>{
    const delivery=deliveries[index];
    if(!delivery)return;
    const d=new Date(delivery.createdAt);
    card.dataset.deliveryDate=Number.isNaN(d.getTime())?"":`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    card.dataset.deliverySupplier=String(delivery.supplier||"");
   });
   const supplierNames=[...new Set(deliveries.map(d=>String(d.supplier||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
   const filters=document.createElement("div");
   filters.style.margin="15px 0 20px";
   filters.innerHTML=`
    <label>DATE</label>
    <input id="deliveryHistoryDate" type="date" style="margin-bottom:10px">
    <label>SUPPLIER</label>
    <select id="deliveryHistorySupplier" style="width:100%;padding:14px;border-radius:10px;border:1px solid #444;background:#0d0d0d;color:white;margin-bottom:10px">
     <option value="">All suppliers</option>
     ${supplierNames.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join("")}
    </select>`;
   description.insertAdjacentElement("afterend",filters);
   const dateInput=document.getElementById("deliveryHistoryDate");
   const supplierSelect=document.getElementById("deliveryHistorySupplier");
   const applyFilters=()=>{
    const selectedDate=dateInput.value;
    const selectedSupplier=supplierSelect.value;
    let visible=0;
    cards.forEach(card=>{
     const matchDate=!selectedDate||card.dataset.deliveryDate===selectedDate;
     const matchSupplier=!selectedSupplier||card.dataset.deliverySupplier===selectedSupplier;
     const show=matchDate&&matchSupplier;
     card.style.display=show?"":"none";
     if(show)visible++;
    });
    let empty=document.getElementById("deliveryHistoryNoResults");
    if(!visible){
     if(!empty){empty=document.createElement("p");empty.id="deliveryHistoryNoResults";empty.className="muted";empty.textContent="No deliveries match the selected filters.";panel.appendChild(empty);}
    }else if(empty){empty.remove();}
   };
   dateInput.onchange=applyFilters;
   supplierSelect.onchange=applyFilters;
  };
 }

 window.managerStockHistory=async function managerStockHistory(selectedDate){
  clearInterval(timerInterval);
  const now=new Date();
  const today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  const dateValue=selectedDate===undefined?today:selectedDate;
  try{
   const response=await fetch("/api/inventory/movements",{cache:"no-store"});
   if(!response.ok)throw new Error("Unable to load stock history");
   const rows=await response.json();
   const movements=(Array.isArray(rows)?rows:[])
    .map(row=>({...row,_date:v2MovementDate(row.created_at)}))
    .filter(row=>{
     if(!row._date)return false;
     const movementDate=`${row._date.getFullYear()}-${String(row._date.getMonth()+1).padStart(2,"0")}-${String(row._date.getDate()).padStart(2,"0")}`;
     return !dateValue||movementDate===dateValue;
    });

   document.getElementById("root").innerHTML=`
   <div class="app">
    <button class="back" onclick="inventoryHome()">← BACK</button>
    <div class="logo">MR K BURGERS<span>${role==="owner"?"OWNER":"MANAGER"} — STOCK HISTORY</span></div>
    <div class="panel">
     <span class="badge">📜 STOCK HISTORY</span>
     <h1>Inventory Movements</h1>
     <p class="muted">View inventory activity for a selected date.</p>
     <label>DATE</label>
     <input id="stockHistoryDate" class="input" type="date" value="${dateValue}">
     <button id="stockHistoryApplyDate" class="primary" style="margin:10px 0 20px 0" onclick="managerStockHistory(document.getElementById('stockHistoryDate').value)">APPLY DATE</button>
     <div style="margin-top:20px">
      ${movements.length?movements.map(m=>`
       <div class="order-card">
        <div class="order-top">
         <div>
          <h3>${esc(m.ingredient_name||m.ingredient_id||"Inventory Item")}</h3>
          <span class="muted">${esc(m.movement_type||"MOVEMENT")}</span>
         </div>
         <div style="text-align:right">
          <div class="order-number">${Number(m.quantity)>0?"+":""}${Number(m.quantity||0)}</div>
          <span class="muted">${m._date.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>
         </div>
        </div>
        <div class="muted" style="margin-top:8px">Stock: ${Number(m.stock_before||0)} → ${Number(m.stock_after||0)}</div>
        ${m.note?`<div class="muted" style="margin-top:8px">Note: ${esc(m.note)}</div>`:""}
        <div class="muted" style="margin-top:8px">Made by: ${esc(m.created_by||"SYSTEM")}</div>
       </div>`).join(""):`<p class="muted" style="margin-top:20px">No stock movements match the selected filters.</p>`}
     </div>
    </div>
   </div>`;
  }catch(error){
   console.error("Stock history load failed",error);
   alert("Unable to load stock history from the restaurant server.");
  }
 };
});

let v2EditingSupplierId=null;

async function v2ReloadSuppliers(){
 const rows=await v2MenuJson("/api/suppliers",{cache:"no-store"});
 suppliers=Array.isArray(rows)?rows:[];
 localStorage.setItem("mrkSuppliers",JSON.stringify(suppliers));
}

function v2SupplierError(error){
 console.error("Supplier backend action failed",error);
 alert(error?.message||"Unable to save supplier.");
}

window.ownerSuppliers=async function ownerSuppliers(){
 clearInterval(timerInterval);
 if(role!=="owner")return ownerInventory();
 try{await v2ReloadSuppliers();}catch(error){v2SupplierError(error);return;}
 const editing=suppliers.find(supplier=>String(supplier.id)===String(v2EditingSupplierId));
 document.getElementById("root").innerHTML=`
 <div class="app">
  <button class="back" onclick="ownerInventory()">← BACK</button>
  <div class="logo">MR K BURGERS<span>OWNER — SUPPLIERS</span></div>
  <div class="panel">
   <span class="badge">🏢 SUPPLIERS</span>
   <h1>Supplier Management</h1>
   <p class="muted">Create and manage approved suppliers.</p>

   ${editing?`
    <div class="order-card" style="margin-bottom:24px">
     <h3>Edit Supplier</h3>
     <label>SUPPLIER NAME</label>
     <input id="editSupplierName" class="input" type="text" value="${esc(editing.name)}">
     <label>PHONE NUMBER</label>
     <input id="editSupplierPhone" class="input" type="tel" value="${esc(editing.phone||"")}">
     <button class="primary" style="margin-top:16px" onclick="ownerSaveSupplierEdit()">SAVE CHANGES</button>
     <button class="back" onclick="ownerCancelSupplierEdit()">CANCEL</button>
    </div>`:`
    <label>SUPPLIER NAME</label>
    <input id="supplierName" class="input" type="text" placeholder="Enter supplier name">
    <label>PHONE NUMBER</label>
    <input id="supplierPhone" class="input" type="tel" placeholder="Enter supplier phone number">
    <button class="primary" style="margin-top:16px" onclick="ownerAddSupplier()">ADD SUPPLIER</button>`}

   <div style="margin-top:24px">
    ${suppliers.length?suppliers.map(supplier=>`
     <div class="order-card">
      <div class="order-top">
       <div>
        <h3>${esc(supplier.name)}</h3>
        <div class="muted">📞 ${esc(supplier.phone||"No phone number")}</div>
        <div class="muted">${supplier.active===false?"Inactive":"Active"}</div>
       </div>
      </div>
      <div style="margin-top:12px">
       <button class="secondary" onclick="ownerEditSupplier(${Number(supplier.id)})">EDIT</button>
       <button class="secondary" onclick="ownerToggleSupplier(${Number(supplier.id)})">${supplier.active===false?"ACTIVATE":"DEACTIVATE"}</button>
       <button class="secondary" onclick="ownerDeleteSupplier(${Number(supplier.id)})">DELETE</button>
      </div>
     </div>`).join(""):`<p class="muted">No suppliers created yet.</p>`}
   </div>
  </div>
 </div>`;
};

window.ownerAddSupplier=async function ownerAddSupplier(){
 if(role!=="owner")return;
 const name=document.getElementById("supplierName")?.value.trim()||"";
 const phone=document.getElementById("supplierPhone")?.value.trim()||"";
 if(!name){alert("Please enter a supplier name.");return;}
 try{
  await v2MenuJson("/api/suppliers",{method:"POST",body:JSON.stringify({id:Date.now(),name,phone})});
  v2EditingSupplierId=null;
  await ownerSuppliers();
 }catch(error){v2SupplierError(error);}
};

window.ownerEditSupplier=function ownerEditSupplier(id){
 if(role!=="owner")return;
 v2EditingSupplierId=Number(id);
 ownerSuppliers();
};

window.ownerCancelSupplierEdit=function ownerCancelSupplierEdit(){
 v2EditingSupplierId=null;
 ownerSuppliers();
};

window.ownerSaveSupplierEdit=async function ownerSaveSupplierEdit(){
 if(role!=="owner"||v2EditingSupplierId===null)return;
 const supplier=suppliers.find(item=>String(item.id)===String(v2EditingSupplierId));
 if(!supplier){alert("Supplier not found.");return;}
 const name=document.getElementById("editSupplierName")?.value.trim()||"";
 const phone=document.getElementById("editSupplierPhone")?.value.trim()||"";
 if(!name){alert("Supplier name cannot be empty.");return;}
 try{
  await v2MenuJson(`/api/suppliers/${encodeURIComponent(v2EditingSupplierId)}`,{method:"PATCH",body:JSON.stringify({name,phone,active:supplier.active!==false})});
  v2EditingSupplierId=null;
  await ownerSuppliers();
 }catch(error){v2SupplierError(error);}
};

window.ownerToggleSupplier=async function ownerToggleSupplier(id){
 if(role!=="owner")return;
 const supplier=suppliers.find(item=>String(item.id)===String(id));
 if(!supplier)return;
 try{
  await v2MenuJson(`/api/suppliers/${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify({name:supplier.name,phone:supplier.phone||"",active:supplier.active===false})});
  v2EditingSupplierId=null;
  await ownerSuppliers();
 }catch(error){v2SupplierError(error);}
};

window.ownerDeleteSupplier=async function ownerDeleteSupplier(id){
 if(role!=="owner")return;
 const supplier=suppliers.find(item=>String(item.id)===String(id));
 if(!supplier)return;
 if(!confirm(`Delete supplier "${supplier.name}"?`))return;
 try{
  await v2MenuJson(`/api/suppliers/${encodeURIComponent(id)}`,{method:"DELETE"});
  v2EditingSupplierId=null;
  await ownerSuppliers();
 }catch(error){v2SupplierError(error);}
};
