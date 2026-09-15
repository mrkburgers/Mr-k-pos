let v2ComboAdminState=null;

async function v2LoadComboAdminState(force=false){
 if(v2ComboAdminState&&!force)return v2ComboAdminState;
 const response=await fetch("/api/combos/state",{cache:"no-store"});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error||"Unable to load combo settings");
 v2ComboAdminState=data;
 const categoryById=new Map((data.categories||[]).map(category=>[category.id,category]));
 const itemById=new Map((data.items||[]).map(item=>[item.id,item]));
 if(Array.isArray(menuCategoryData)){
  menuCategoryData.forEach(category=>{
   const row=categoryById.get(category.id);
   category.categoryType=row?.category_type||"item";
  });
 }
 if(Array.isArray(ownerMenuData)){
  ownerMenuData.forEach(item=>{
   const row=itemById.get(item.id);
   item.showOnMenu=row?Boolean(row.show_on_menu):true;
  });
 }
 return data;
}

function v2ComboSelectStyle(){
 return "width:100%;padding:14px;border-radius:10px;border:1px solid #444;background:#0d0d0d;color:white;margin-bottom:10px";
}

function v2ComboInsertAfter(target,id,label,html){
 if(!target||document.getElementById(id))return;
 const holder=document.createElement("div");
 holder.id=id;
 holder.innerHTML=`<label>${label}</label>${html}`;
 target.insertAdjacentElement("afterend",holder);
}

const v2OriginalOwnerAddCategory=window.ownerAddCategory;
if(typeof v2OriginalOwnerAddCategory==="function"){
 window.ownerAddCategory=function ownerAddCategory(){
  v2OriginalOwnerAddCategory();
  v2ComboInsertAfter(
   document.getElementById("newCategoryIcon"),
   "v2CategoryTypeField",
   "CATEGORY TYPE",
   `<select id="newCategoryType" style="${v2ComboSelectStyle()}"><option value="item">Normal Menu Category</option><option value="combo">Combo Category</option></select><p class="muted">Combo categories contain combo products built from existing menu items.</p>`
  );
 };
}

const v2OriginalSaveNewCategory=window.saveNewCategory;
if(typeof v2OriginalSaveNewCategory==="function"){
 window.saveNewCategory=async function saveNewCategory(){
  const type=document.getElementById("newCategoryType")?.value||"item";
  if(type!=="combo")return v2OriginalSaveNewCategory();
  const name=document.getElementById("newCategoryName")?.value.trim()||"";
  const icon=document.getElementById("newCategoryIcon")?.value.trim()||"🍱";
  if(!name){alert("Please enter a category name.");return;}
  try{
   const response=await fetch("/api/combos/categories",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({name,icon,active:true})
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Unable to create combo category");
   if(typeof loadV2BackendMenu==="function")await loadV2BackendMenu(true);
   await v2LoadComboAdminState(true);
   alert("Combo category added successfully.");
   if(typeof ownerCategoryList==="function")ownerCategoryList();
  }catch(error){
   alert(error.message||"Unable to create combo category.");
  }
 };
}

const v2OriginalOwnerEditCategory=window.ownerEditCategory;
if(typeof v2OriginalOwnerEditCategory==="function"){
 window.ownerEditCategory=async function ownerEditCategory(id){
  try{await v2LoadComboAdminState();}catch{}
  v2OriginalOwnerEditCategory(id);
  const category=menuCategoryData.find(entry=>entry.id===id);
  if(category?.categoryType==="combo"){
   const panel=document.querySelector("#root .panel");
   if(panel){
    const note=document.createElement("div");
    note.className="system-note";
    note.textContent="Combo Category — editable like any other category.";
    panel.insertBefore(note,panel.firstChild?.nextSibling||null);
   }
  }
 };
}

function v2InjectShowOnMenu(value){
 const anchor=document.getElementById("newMenuItemName")||document.getElementById("editMenuItemName");
 v2ComboInsertAfter(
  anchor,
  "v2ShowOnMenuField",
  "SHOW ON MENU",
  `<select id="v2ShowOnMenu" style="${v2ComboSelectStyle()}"><option value="true" ${value!==false?"selected":""}>Yes — sell as standalone item</option><option value="false" ${value===false?"selected":""}>No — hidden / combo-only item</option></select><p class="muted">Hidden active items can still be used and customized inside combos.</p>`
 );
}

const v2OriginalOwnerAddMenuItem=window.ownerAddMenuItem;
if(typeof v2OriginalOwnerAddMenuItem==="function"){
 window.ownerAddMenuItem=function ownerAddMenuItem(){
  v2OriginalOwnerAddMenuItem();
  v2InjectShowOnMenu(true);
 };
}

const v2OriginalOwnerEditMenuItem=window.ownerEditMenuItem;
if(typeof v2OriginalOwnerEditMenuItem==="function"){
 window.ownerEditMenuItem=async function ownerEditMenuItem(id){
  try{await v2LoadComboAdminState();}catch{}
  v2OriginalOwnerEditMenuItem(id);
  const item=ownerMenuData.find(entry=>entry.id===id);
  v2InjectShowOnMenu(item?.showOnMenu!==false);
 };
}

const v2OriginalSaveNewMenuItem=window.saveNewMenuItem;
if(typeof v2OriginalSaveNewMenuItem==="function"){
 window.saveNewMenuItem=async function saveNewMenuItem(){
  const name=document.getElementById("newMenuItemName")?.value.trim()||"";
  const showOnMenu=document.getElementById("v2ShowOnMenu")?.value!=="false";
  await v2OriginalSaveNewMenuItem();
  const item=ownerMenuData.find(entry=>entry.name===name);
  if(!item)return;
  try{
   const response=await fetch(`/api/menu/items/${encodeURIComponent(item.id)}/visibility`,{
    method:"PATCH",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({show_on_menu:showOnMenu})
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Unable to save menu visibility");
   item.showOnMenu=showOnMenu;
   await v2LoadComboAdminState(true);
   if(typeof ownerMenuItemList==="function")ownerMenuItemList();
  }catch(error){
   alert(error.message||"Menu item was saved, but its menu visibility could not be updated.");
  }
 };
}

const v2OriginalSaveEditedMenuItem=window.saveEditedMenuItem;
if(typeof v2OriginalSaveEditedMenuItem==="function"){
 window.saveEditedMenuItem=async function saveEditedMenuItem(id){
  const showOnMenu=document.getElementById("v2ShowOnMenu")?.value!=="false";
  await v2OriginalSaveEditedMenuItem(id);
  const item=ownerMenuData.find(entry=>entry.id===id);
  if(!item)return;
  try{
   const response=await fetch(`/api/menu/items/${encodeURIComponent(id)}/visibility`,{
    method:"PATCH",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({show_on_menu:showOnMenu})
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Unable to save menu visibility");
   item.showOnMenu=showOnMenu;
   await v2LoadComboAdminState(true);
   if(typeof ownerMenuItemList==="function")ownerMenuItemList();
  }catch(error){
   alert(error.message||"Menu item was saved, but its menu visibility could not be updated.");
  }
 };
}

const v2OriginalOpenCategory=window.openCategory;
if(typeof v2OriginalOpenCategory==="function"){
 window.openCategory=async function openCategory(categoryId){
  const result=await v2OriginalOpenCategory(categoryId);
  try{
   const state=await v2LoadComboAdminState(true);
   const hiddenNames=new Set((state.items||[]).filter(item=>item.active&&!item.show_on_menu).map(item=>item.name));
   document.querySelectorAll("#root .card").forEach(card=>{
    const name=card.querySelector("h3")?.textContent.trim();
    if(name&&hiddenNames.has(name))card.remove();
   });
  }catch(error){console.error("Unable to apply menu visibility",error);}
  return result;
 };
}

v2LoadComboAdminState().catch(error=>console.error("Combo admin state load failed",error));
