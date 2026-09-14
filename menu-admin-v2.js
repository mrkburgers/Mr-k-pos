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
