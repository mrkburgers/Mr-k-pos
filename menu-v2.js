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
  active:Boolean(ingredient.active)
 }));

 ownerMenuData=data.items.map(item=>({
  id:item.id,
  name:item.name,
  category:item.category_id,
  price:Number(item.price||0),
  ingredientIds:(item.ingredients||[]).map(ingredient=>ingredient.id),
  ingredientQuantities:{},
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
  const response=await fetch("/api/menu",{cache:"no-store"});
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
