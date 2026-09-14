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

 if(!name){
  alert("Please enter an ingredient name.");
  return;
 }

 const duplicate=menuIngredients.some(
  ingredient=>ingredient.name.toLowerCase()===name.toLowerCase()
 );
 if(duplicate){
  alert("This ingredient already exists.");
  return;
 }
 if(!Number.isFinite(lowStockLevel)||lowStockLevel<0){
  alert("Low Stock Level must be zero or greater.");
  return;
 }

 const id="ingredient_"+Date.now()+"_"+Math.random().toString(36).slice(2,8);

 try{
  const created=await v2MenuJson("/api/menu/ingredients",{
   method:"POST",
   body:JSON.stringify({
    id,
    name,
    active:true,
    tracked,
    low_stock_level:lowStockLevel
   })
  });

  menuIngredients.push({
   id:created.id,
   name:created.name,
   tracked:Boolean(created.tracked),
   lowStockLevel:Number(created.low_stock_level||0),
   active:Boolean(created.active),
   unit:"unit"
  });
  saveMenuIngredients();
  syncTrackedIngredientsToInventory();
  saveInventory();
  if(typeof loadV2BackendMenu==="function")await loadV2BackendMenu(true);

  alert("Ingredient added successfully.");
  ownerIngredientList();
 }catch(error){
  v2IngredientSaveError(error);
 }
};

window.saveEditedIngredient=async function saveEditedIngredient(id){
 const ingredient=menuIngredients.find(item=>item.id===id);
 if(!ingredient){
  alert("Ingredient not found.");
  return;
 }

 const name=document.getElementById("editIngredientName").value.trim();
 const tracked=document.getElementById("editIngredientTracked").value==="true";
 const lowStockLevel=Number(document.getElementById("editIngredientLowStock").value||0);

 if(!name){
  alert("Please enter an ingredient name.");
  return;
 }
 const duplicate=menuIngredients.some(
  item=>item.id!==id && item.name.toLowerCase()===name.toLowerCase()
 );
 if(duplicate){
  alert("Another ingredient already uses this name.");
  return;
 }
 if(!Number.isFinite(lowStockLevel)||lowStockLevel<0){
  alert("Low Stock Level must be zero or greater.");
  return;
 }

 try{
  await v2MenuJson(`/api/menu/ingredients/${encodeURIComponent(id)}`,{
   method:"PATCH",
   body:JSON.stringify({name,active:Boolean(ingredient.active)})
  });
  await v2MenuJson(`/api/inventory/${encodeURIComponent(id)}`,{
   method:"PATCH",
   body:JSON.stringify({tracked,low_stock_level:lowStockLevel,unit:ingredient.unit||"unit"})
  });

  ingredient.name=name;
  ingredient.tracked=tracked;
  ingredient.lowStockLevel=lowStockLevel;
  saveMenuIngredients();
  syncTrackedIngredientsToInventory();
  saveInventory();
  if(typeof loadV2BackendMenu==="function")await loadV2BackendMenu(true);

  alert("Ingredient updated successfully.");
  ownerIngredientList();
 }catch(error){
  v2IngredientSaveError(error);
 }
};

window.toggleIngredientActive=async function toggleIngredientActive(id){
 const ingredient=menuIngredients.find(item=>item.id===id);
 if(!ingredient){
  alert("Ingredient not found.");
  return;
 }

 const nextActive=!ingredient.active;
 try{
  await v2MenuJson(`/api/menu/ingredients/${encodeURIComponent(id)}`,{
   method:"PATCH",
   body:JSON.stringify({active:nextActive})
  });
  ingredient.active=nextActive;
  saveMenuIngredients();
  syncTrackedIngredientsToInventory();
  saveInventory();
  if(typeof loadV2BackendMenu==="function")await loadV2BackendMenu(true);
  ownerIngredientList();
 }catch(error){
  v2IngredientSaveError(error);
 }
};

window.deleteMenuIngredient=async function deleteMenuIngredient(id){
 const ingredient=menuIngredients.find(item=>item.id===id);
 if(!ingredient){
  alert("Ingredient not found.");
  return;
 }

 const confirmed=confirm(`Delete "${ingredient.name}" permanently?`);
 if(!confirmed)return;

 try{
  await v2MenuJson(`/api/menu/ingredients/${encodeURIComponent(id)}`,{
   method:"DELETE"
  });
  menuIngredients=menuIngredients.filter(item=>item.id!==id);
  saveMenuIngredients();
  syncTrackedIngredientsToInventory();
  saveInventory();
  if(typeof loadV2BackendMenu==="function")await loadV2BackendMenu(true);
  ownerIngredientList();
 }catch(error){
  v2IngredientSaveError(error);
 }
};

const v2MenuMultiSelectIds=new Set([
 "newMenuItemRemovableIngredients",
 "newMenuItemAllowedExtras",
 "editMenuItemRemovableIngredients",
 "editMenuItemAllowedExtras"
]);

document.addEventListener("mousedown",event=>{
 const select=event.target?.closest?.("select[multiple]");
 if(!select || !v2MenuMultiSelectIds.has(select.id))return;
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
   <div class="grid">
    ${rows || `<div class="card"><p class="muted">No ingredients found.</p></div>`}
   </div>
  </div>
 </div>`;
};

window.addEventListener("load",()=>{
 const originalDeliveryHistory=window.managerDeliveryHistory;
 if(typeof originalDeliveryHistory==="function"){
  window.managerDeliveryHistory=async function managerDeliveryHistory(){
   await originalDeliveryHistory();
   const panel=document.querySelector("#root .panel");
   if(!panel)return;
   const description=[...panel.querySelectorAll("p.muted")].find(p=>p.textContent.includes("View received supplier deliveries"));
   if(!description)return;

   const deliveries=[...(Array.isArray(inventoryDeliveries)?inventoryDeliveries:[])].sort(
    (a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0)
   );
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
    </select>
   `;
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
     if(!empty){
      empty=document.createElement("p");
      empty.id="deliveryHistoryNoResults";
      empty.className="muted";
      empty.textContent="No deliveries match the selected filters.";
      panel.appendChild(empty);
     }
    }else if(empty){
     empty.remove();
    }
   };
   dateInput.onchange=applyFilters;
   supplierSelect.onchange=applyFilters;
  };
 }

 const inventoryStockHistory=window.managerStockHistory;
 if(typeof inventoryStockHistory==="function"){
  window.managerStockHistory=async function managerStockHistory(selectedDate){
   await inventoryStockHistory(selectedDate,"");
   const panel=document.querySelector("#root .panel");
   if(!panel)return;

   const supplierSelect=document.getElementById("stockHistorySupplier");
   if(supplierSelect){
    const supplierLabel=[...panel.querySelectorAll("label")].find(label=>label.textContent.trim().toUpperCase()==="SUPPLIER");
    supplierLabel?.remove();
    supplierSelect.remove();
   }

   const dateInput=panel.querySelector('input[type="date"]');
   if(!dateInput)return;
   dateInput.removeAttribute("onchange");
   dateInput.onchange=null;

   [...panel.querySelectorAll("button")].forEach(button=>{
    if(button.textContent.trim().toUpperCase()==="ALL DATES")button.remove();
   });

   let applyButton=document.getElementById("stockHistoryApplyDate");
   if(!applyButton){
    applyButton=document.createElement("button");
    applyButton.id="stockHistoryApplyDate";
    applyButton.className="primary";
    applyButton.style.margin="10px 0 20px 0";
    applyButton.textContent="APPLY DATE";
    dateInput.insertAdjacentElement("afterend",applyButton);
   }
   applyButton.onclick=()=>window.managerStockHistory(dateInput.value);
  };
 }
});
