let v2BackendMenuReady=null;

function v2ApplyBackendMenu(data){
 if(!data || !Array.isArray(data.categories) || !Array.isArray(data.items)){
  throw new Error("Invalid backend menu payload");
 }

 menuCategoryData=data.categories.map(category=>({
  id:category.id,
  name:category.name,
  icon:category.icon||"🍽️",
  active:Boolean(category.active)
 }));

 menuIngredients=(data.ingredients||[]).map(ingredient=>({
  id:ingredient.id,
  name:ingredient.name,
  active:Boolean(ingredient.active),
  tracked:Boolean(ingredient.tracked),
  lowStockLevel:Number(ingredient.low_stock_level||0),
  unit:ingredient.unit||"unit"
 }));

 ownerMenuData=data.items.map(item=>({
  id:item.id,
  name:item.name,
  category:item.category_id,
  price:Number(item.price||0),
  ingredientIds:(item.ingredients||[]).map(ingredient=>ingredient.id),
  ingredientQuantities:Object.fromEntries(
   (item.ingredients||[]).map(ingredient=>[
    ingredient.id,
    Number(ingredient.quantity||1)
   ])
  ),
  removableIngredientIds:(item.ingredients||[])
   .filter(ingredient=>ingredient.removable)
   .map(ingredient=>ingredient.id),
  allowedExtraIds:(item.extras||[]).map(extra=>extra.id),
  active:Boolean(item.active),
  createdAt:item.created_at||Date.now()
 }));
}

async function loadV2BackendMenu(force=false){
 if(v2BackendMenuReady && !force){
  return v2BackendMenuReady;
 }

 v2BackendMenuReady=(async()=>{
  const response=await fetch("/api/menu-v2",{cache:"no-store"});
  if(!response.ok){
   throw new Error("Unable to load backend menu");
  }
  const data=await response.json();
  v2ApplyBackendMenu(data);
  return data;
 })();

 try{
  return await v2BackendMenuReady;
 }catch(error){
  v2BackendMenuReady=null;
  throw error;
 }
}

loadV2BackendMenu().catch(error=>{
 console.error("Backend menu load failed",error);
});

const legacyV2MenuCategories=window.menuCategories;
window.menuCategories=async function menuCategories(){
 try{
  await loadV2BackendMenu();
 }catch(error){
  alert("Unable to load the menu from the restaurant server.");
  return;
 }
 return legacyV2MenuCategories();
};

const legacyV2OpenCategory=window.openCategory;
window.openCategory=async function openCategory(categoryId){
 try{
  await loadV2BackendMenu();
 }catch(error){
  alert("Unable to load this category from the restaurant server.");
  return;
 }
 return legacyV2OpenCategory(categoryId);
};

const legacyV2OwnerMenuManagement=window.ownerMenuManagement;
if(typeof legacyV2OwnerMenuManagement==="function"){
 window.ownerMenuManagement=async function ownerMenuManagement(){
  try{
   await loadV2BackendMenu();
  }catch(error){
   alert("Unable to load Menu Management from the restaurant server.");
   return;
  }
  return legacyV2OwnerMenuManagement();
 };
}

const legacyV2BurgerCustomize=window.burgerCustomize;
window.burgerCustomize=function burgerCustomize(name){
 const item=ownerMenuData.find(menuItem=>menuItem.name===name);
 if(!item || item.category!=="burgers"){
  return legacyV2BurgerCustomize(name);
 }

 const ingredientNames=(item.ingredientIds||[])
  .map(id=>menuIngredients.find(ingredient=>ingredient.id===id)?.name)
  .filter(Boolean);

 const removableNames=(item.removableIngredientIds||[])
  .map(id=>menuIngredients.find(ingredient=>ingredient.id===id)?.name)
  .filter(Boolean);

 const extraNames=(item.allowedExtraIds||[])
  .map(id=>ownerMenuData.find(menuItem=>menuItem.id===id)?.name)
  .filter(Boolean);

 currentCustomizeItem=name;
 resetExtras(extraNames);
 resetIngredients();

 document.getElementById("root").innerHTML=`
 <div class="app">
  <button class="back" onclick="openCategory('${currentCategory}')">← BACK</button>
  <div class="logo">MR K BURGERS<span>CUSTOMIZE</span></div>
  <div class="panel">
   <h2>${esc(name)}</h2>
   <h3>Ingredients</h3>
   <p class="muted">Uncheck any ingredient the customer does not want.</p>
   ${ingredientRows(ingredientNames,removableNames)}
   <h3>Extras</h3>
   ${extraRows(extraNames)}
   <h3>PRODUCT QUANTITY</h3>
   ${qtyHtml()}
   <button class="primary" style="margin-top:20px;width:100%" onclick='addCustomizedItem(${JSON.stringify(name)})'>ADD TO ORDER</button>
  </div>
 </div>`;
};

async function v2HandleLiveMenuChange(){
 try{
  await loadV2BackendMenu(true);

  const root=document.getElementById("root");
  if(!root)return;

  const screenText=root.innerText||"";

  if(screenText.includes("CUSTOMIZE")){
   return;
  }

  if(role==="cashier"){
   if(currentCategory && menuCategoryData.some(category=>category.id===currentCategory)){
    legacyV2OpenCategory(currentCategory);
    return;
   }

   if(screenText.includes("MENU")){
    legacyV2MenuCategories();
   }
  }
 }catch(error){
  console.error("Live menu refresh failed",error);
 }
}

if(typeof socket!=="undefined" && socket?.on){
 socket.on("menu-changed",v2HandleLiveMenuChange);
}

/* Combo owner UI bridge: category-order components + flexible choice groups. */
window.addEventListener("load",()=>{
 let v2ChoiceDraft=[];

 function categoryRankMap(){
  const map=new Map();
  (Array.isArray(v2ComboAdminState?.categories)?v2ComboAdminState.categories:[]).forEach((category,index)=>{
   map.set(category.id,Number(category.sort_order??index));
  });
  return map;
 }

 function sortedActiveItems(){
  const rank=categoryRankMap();
  const stateItems=new Map((v2ComboAdminState?.items||[]).map(item=>[item.id,item]));
  return (ownerMenuData||[])
   .filter(item=>item.active!==false)
   .sort((a,b)=>{
    const stateA=stateItems.get(a.id)||{};
    const stateB=stateItems.get(b.id)||{};
    const categoryDiff=(rank.get(a.category)??999999)-(rank.get(b.category)??999999);
    if(categoryDiff)return categoryDiff;
    const itemDiff=Number(stateA.sort_order??999999)-Number(stateB.sort_order??999999);
    if(itemDiff)return itemDiff;
    return String(a.name).localeCompare(String(b.name));
   });
 }

 window.v2ComboComponentRows=function v2ComboComponentRows(selected=[]){
  const selectedMap=new Map((selected||[]).map(component=>[component.menu_item_id,Number(component.quantity||1)]));
  const categoryNames=new Map(menuCategoryData.map(category=>[category.id,category.name]));
  return sortedActiveItems().map(item=>{
   const checked=selectedMap.has(item.id);
   const qty=selectedMap.get(item.id)||1;
   return `<div class="extra-row">
    <input type="checkbox" class="v2-combo-component" data-item-id="${esc(item.id)}" ${checked?"checked":""} style="width:22px;height:22px;flex:0 0 auto">
    <div style="flex:1">
     <div class="extra-name">${esc(item.name)}</div>
     <div class="muted">${esc(categoryNames.get(item.category)||item.category||"")}${item.showOnMenu===false?" — Hidden / combo-only":""}</div>
    </div>
    <input type="number" min="1" step="1" value="${qty}" class="v2-combo-qty" data-item-id="${esc(item.id)}" style="width:90px">
   </div>`;
  }).join("");
 };

 function choiceEditorHtml(){
  const items=sortedActiveItems();
  const categoryNames=new Map(menuCategoryData.map(category=>[category.id,category.name]));
  return `<div id="v2ChoiceGroupsEditor" style="margin-top:24px">
   <h3>Choice Groups</h3>
   <p class="muted">Use this when the customer chooses from allowed items, for example 2 soft drinks from Coca Cola, Sprite or Fanta.</p>
   ${v2ChoiceDraft.map((group,index)=>`
    <div class="card" style="margin:12px 0">
     <label>GROUP NAME</label>
     <input class="v2-choice-name" data-choice-index="${index}" value="${esc(group.name||"")}" placeholder="Example: Soft Drink">
     <label>NUMBER OF CHOICES REQUIRED</label>
     <input type="number" min="1" step="1" class="v2-choice-count" data-choice-index="${index}" value="${Math.max(1,Number(group.selection_count||1))}">
     <label>ALLOW SAME ITEM MORE THAN ONCE</label>
     <select class="v2-choice-duplicates" data-choice-index="${index}" style="width:100%;padding:14px;border-radius:10px;border:1px solid #444;background:#0d0d0d;color:white;margin-bottom:10px">
      <option value="true" ${group.allow_duplicates!==false?"selected":""}>Yes</option>
      <option value="false" ${group.allow_duplicates===false?"selected":""}>No</option>
     </select>
     <p class="muted">Customer chooses ${Math.max(1,Number(group.selection_count||1))} from:</p>
     ${items.map(item=>`
      <div class="ingredient-row">
       <input type="checkbox" class="v2-choice-item" data-choice-index="${index}" data-item-id="${esc(item.id)}" ${(group.item_ids||[]).includes(item.id)?"checked":""}>
       <label>${esc(item.name)} <span class="muted">— ${esc(categoryNames.get(item.category)||"")}</span></label>
      </div>`).join("")}
     <button class="danger" onclick="v2RemoveChoiceGroup(${index})">REMOVE CHOICE GROUP</button>
    </div>`).join("")}
   <button class="secondary" onclick="v2AddChoiceGroup()">ADD CHOICE GROUP</button>
  </div>`;
 }

 function syncChoiceDraftFromDom(){
  v2ChoiceDraft=v2ChoiceDraft.map((group,index)=>({
   name:document.querySelector(`.v2-choice-name[data-choice-index="${index}"]`)?.value.trim()||group.name||"",
   selection_count:Math.max(1,Number(document.querySelector(`.v2-choice-count[data-choice-index="${index}"]`)?.value||group.selection_count||1)),
   allow_duplicates:document.querySelector(`.v2-choice-duplicates[data-choice-index="${index}"]`)?.value!=="false",
   item_ids:[...document.querySelectorAll(`.v2-choice-item[data-choice-index="${index}"]:checked`)].map(input=>input.dataset.itemId)
  }));
 }

 function injectChoiceEditor(){
  const panel=document.querySelector("#root .panel");
  if(!panel||document.getElementById("v2ChoiceGroupsEditor"))return;
  const saveButton=[...panel.querySelectorAll("button")].find(button=>/CREATE COMBO|SAVE COMBO/.test(button.textContent||""));
  if(!saveButton)return;
  const holder=document.createElement("div");
  holder.innerHTML=choiceEditorHtml();
  saveButton.insertAdjacentElement("beforebegin",holder.firstElementChild);
 }

 window.v2AddChoiceGroup=function v2AddChoiceGroup(){
  syncChoiceDraftFromDom();
  v2ChoiceDraft.push({name:"Soft Drink",selection_count:1,allow_duplicates:true,item_ids:[]});
  document.getElementById("v2ChoiceGroupsEditor")?.remove();
  injectChoiceEditor();
 };

 window.v2RemoveChoiceGroup=function v2RemoveChoiceGroup(index){
  syncChoiceDraftFromDom();
  v2ChoiceDraft.splice(index,1);
  document.getElementById("v2ChoiceGroupsEditor")?.remove();
  injectChoiceEditor();
 };

 async function saveChoiceGroups(comboId){
  syncChoiceDraftFromDom();
  for(const group of v2ChoiceDraft){
   if(!group.name)throw new Error("Every choice group needs a name.");
   if(!Number.isInteger(group.selection_count)||group.selection_count<1)throw new Error("Choice quantity must be a whole number of 1 or more.");
   if((group.item_ids||[]).length<1)throw new Error(`Choice group "${group.name}" needs at least one allowed item.`);
   if(!group.allow_duplicates&&group.selection_count>group.item_ids.length){
    throw new Error(`Choice group "${group.name}" needs at least ${group.selection_count} different allowed items when duplicates are disabled.`);
   }
  }
  const response=await fetch(`/api/combos/${encodeURIComponent(comboId)}/choice-groups`,{
   method:"PUT",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({choice_groups:v2ChoiceDraft})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||"Unable to save choice groups");
  if(typeof v2LoadComboAdminState==="function")await v2LoadComboAdminState(true);
 }

 const originalAdd=window.v2OwnerAddCombo;
 if(typeof originalAdd==="function"){
  window.v2OwnerAddCombo=async function v2OwnerAddCombo(categoryId){
   v2ChoiceDraft=[];
   const result=await originalAdd(categoryId);
   injectChoiceEditor();
   return result;
  };
 }

 const originalEdit=window.v2OwnerEditCombo;
 if(typeof originalEdit==="function"){
  window.v2OwnerEditCombo=async function v2OwnerEditCombo(comboId){
   const state=await v2LoadComboAdminState(true);
   const combo=(state.combos||[]).find(entry=>entry.id===comboId);
   v2ChoiceDraft=(combo?.choice_groups||[]).map(group=>({
    name:group.name,
    selection_count:Math.max(1,Number(group.selection_count||1)),
    allow_duplicates:group.allow_duplicates!==false,
    item_ids:(group.items||[]).map(item=>item.menu_item_id)
   }));
   const result=await originalEdit(comboId);
   injectChoiceEditor();
   return result;
  };
 }

 const originalSaveNew=window.v2SaveNewCombo;
 if(typeof originalSaveNew==="function"){
  window.v2SaveNewCombo=async function v2SaveNewCombo(categoryId){
   syncChoiceDraftFromDom();
   const comboName=document.getElementById("v2ComboName")?.value.trim()||"";
   try{
    for(const group of v2ChoiceDraft){
     if(!group.name){alert("Every choice group needs a name.");return;}
     if(!Number.isInteger(group.selection_count)||group.selection_count<1){alert("Choice quantity must be a whole number of 1 or more.");return;}
     if((group.item_ids||[]).length<1){alert(`Choice group "${group.name}" needs at least one allowed item.`);return;}
     if(!group.allow_duplicates&&group.selection_count>group.item_ids.length){alert(`Choice group "${group.name}" needs at least ${group.selection_count} different allowed items when duplicates are disabled.`);return;}
    }
    await originalSaveNew(categoryId);
    if(!comboName)return;
    const state=await v2LoadComboAdminState(true);
    const combo=(state.combos||[]).find(entry=>entry.name===comboName);
    if(combo&&v2ChoiceDraft.length){
     await saveChoiceGroups(combo.id);
     await v2OwnerComboCategory(categoryId);
    }
   }catch(error){alert(error.message||"Unable to save combo choice groups.");}
  };
 }

 const originalSaveEdit=window.v2SaveEditedCombo;
 if(typeof originalSaveEdit==="function"){
  window.v2SaveEditedCombo=async function v2SaveEditedCombo(comboId,oldCategoryId){
   syncChoiceDraftFromDom();
   try{
    for(const group of v2ChoiceDraft){
     if(!group.name){alert("Every choice group needs a name.");return;}
     if(!Number.isInteger(group.selection_count)||group.selection_count<1){alert("Choice quantity must be a whole number of 1 or more.");return;}
     if((group.item_ids||[]).length<1){alert(`Choice group "${group.name}" needs at least one allowed item.`);return;}
     if(!group.allow_duplicates&&group.selection_count>group.item_ids.length){alert(`Choice group "${group.name}" needs at least ${group.selection_count} different allowed items when duplicates are disabled.`);return;}
    }
    await originalSaveEdit(comboId,oldCategoryId);
    await saveChoiceGroups(comboId);
    const state=await v2LoadComboAdminState(true);
    const combo=(state.combos||[]).find(entry=>entry.id===comboId);
    if(combo)await v2OwnerComboCategory(combo.category_id);
   }catch(error){alert(error.message||"Unable to save combo choice groups.");}
  };
 }

 const originalCategory=window.v2OwnerComboCategory;
 if(typeof originalCategory==="function"){
  window.v2OwnerComboCategory=async function v2OwnerComboCategory(categoryId){
   const result=await originalCategory(categoryId);
   try{
    const state=await v2LoadComboAdminState(true);
    const combos=(state.combos||[]).filter(combo=>combo.category_id===categoryId);
    document.querySelectorAll("#root .card").forEach(card=>{
     const name=card.querySelector("h3")?.textContent.trim();
     const combo=combos.find(entry=>entry.name===name);
     if(!combo||!(combo.choice_groups||[]).length)return;
     const firstButton=card.querySelector("button");
     if(!firstButton)return;
     const p=document.createElement("p");
     p.className="muted";
     p.innerHTML=(combo.choice_groups||[]).map(group=>`${esc(group.name)}: choose ${Number(group.selection_count||1)} from ${(group.items||[]).map(item=>esc(item.name)).join(" / ")}${group.allow_duplicates?" — duplicates allowed":""}`).join("<br>");
     firstButton.insertAdjacentElement("beforebegin",p);
    });
   }catch(error){console.error("Unable to display combo choice groups",error);}
   return result;
  };
 }
});