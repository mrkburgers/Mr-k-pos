// V2 menu-item backend bridge.
// The finalized recipe/menu-item editor in index.html remains the UI source of truth.
// This file only mirrors its existing actions to SQLite.

window.v2RecipeUiRestored=true;

function v2CloneMenuData(value){
 return JSON.parse(JSON.stringify(value));
}

function v2MenuItemPayload(item){
 return {
  name:String(item?.name||"").trim(),
  category_id:String(item?.category||"").trim(),
  price:Number(item?.price||0),
  active:item?.active!==false,
  ingredient_ids:Array.isArray(item?.ingredientIds)?[...item.ingredientIds]:[],
  ingredient_quantities:{...(item?.ingredientQuantities||{})},
  removable_ingredient_ids:Array.isArray(item?.removableIngredientIds)?[...item.removableIngredientIds]:[],
  extra_ids:Array.isArray(item?.allowedExtraIds)?[...item.allowedExtraIds]:[]
 };
}

function v2MenuItemSaveError(error){
 console.error("Menu item backend save failed",error);
 alert(
  "Unable to save this menu item to the restaurant server.\n\n"+
  (error?.message||"Please try again.")
 );
}

async function v2ReloadOwnerMenuList(){
 if(typeof loadV2BackendMenu==="function"){
  await loadV2BackendMenu(true);
 }
 if(typeof ownerMenuItemList==="function"){
  ownerMenuItemList();
 }
}

const v2LegacySaveNewMenuItem=window.saveNewMenuItem;
if(typeof v2LegacySaveNewMenuItem==="function"){
 window.saveNewMenuItem=async function saveNewMenuItem(){
  const before=v2CloneMenuData(ownerMenuData);
  const beforeIds=new Set(before.map(item=>item.id));

  v2LegacySaveNewMenuItem();

  const created=ownerMenuData.find(item=>!beforeIds.has(item.id));
  if(!created)return;

  try{
   await v2MenuJson("/api/menu/items",{
    method:"POST",
    body:JSON.stringify(v2MenuItemPayload(created))
   });
   await v2ReloadOwnerMenuList();
  }catch(error){
   ownerMenuData=before;
   saveOwnerMenuData();
   v2MenuItemSaveError(error);
   ownerMenuItemList();
  }
 };
}

const v2LegacySaveEditedMenuItem=window.saveEditedMenuItem;
if(typeof v2LegacySaveEditedMenuItem==="function"){
 window.saveEditedMenuItem=async function saveEditedMenuItem(id){
  const index=ownerMenuData.findIndex(item=>item.id===id);
  if(index<0){
   alert("Menu item not found.");
   return;
  }

  const before=v2CloneMenuData(ownerMenuData[index]);
  v2LegacySaveEditedMenuItem(id);

  const updated=ownerMenuData.find(item=>item.id===id);
  if(!updated)return;

  try{
   await v2MenuJson(`/api/menu/items/${encodeURIComponent(id)}`,{
    method:"PATCH",
    body:JSON.stringify(v2MenuItemPayload(updated))
   });
   await v2ReloadOwnerMenuList();
  }catch(error){
   const currentIndex=ownerMenuData.findIndex(item=>item.id===id);
   if(currentIndex>=0)ownerMenuData[currentIndex]=before;
   saveOwnerMenuData();
   v2MenuItemSaveError(error);
   ownerMenuItemList();
  }
 };
}

const v2LegacyToggleMenuItemActive=window.toggleMenuItemActive;
if(typeof v2LegacyToggleMenuItemActive==="function"){
 window.toggleMenuItemActive=async function toggleMenuItemActive(id){
  const index=ownerMenuData.findIndex(item=>item.id===id);
  if(index<0){
   alert("Menu item not found.");
   return;
  }

  const before=v2CloneMenuData(ownerMenuData[index]);
  v2LegacyToggleMenuItemActive(id);

  const updated=ownerMenuData.find(item=>item.id===id);
  if(!updated)return;

  try{
   await v2MenuJson(`/api/menu/items/${encodeURIComponent(id)}`,{
    method:"PATCH",
    body:JSON.stringify(v2MenuItemPayload(updated))
   });
   await v2ReloadOwnerMenuList();
  }catch(error){
   const currentIndex=ownerMenuData.findIndex(item=>item.id===id);
   if(currentIndex>=0)ownerMenuData[currentIndex]=before;
   saveOwnerMenuData();
   v2MenuItemSaveError(error);
   ownerMenuItemList();
  }
 };
}

const v2LegacyDeleteOwnerMenuItem=window.deleteOwnerMenuItem;
if(typeof v2LegacyDeleteOwnerMenuItem==="function"){
 window.deleteOwnerMenuItem=async function deleteOwnerMenuItem(id){
  const item=ownerMenuData.find(entry=>entry.id===id);
  if(!item){
   alert("Menu item not found.");
   return;
  }

  const before=v2CloneMenuData(ownerMenuData);
  v2LegacyDeleteOwnerMenuItem(id);

  const stillExists=ownerMenuData.some(entry=>entry.id===id);
  if(stillExists)return;

  try{
   await v2MenuJson(`/api/menu/items/${encodeURIComponent(id)}`,{
    method:"DELETE"
   });
   await v2ReloadOwnerMenuList();
  }catch(error){
   ownerMenuData=before;
   saveOwnerMenuData();
   v2MenuItemSaveError(error);
   ownerMenuItemList();
  }
 };
}
