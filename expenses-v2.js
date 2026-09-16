let v2ExpensesSaveQueue=Promise.resolve();
let v2ExpensesReady=false;

function v2ExpensesSnapshot(){
 return {
  categories:JSON.parse(JSON.stringify(Array.isArray(expenseCategories)?expenseCategories:[])),
  expenses:JSON.parse(JSON.stringify(Array.isArray(expenses)?expenses:[]))
 };
}

function v2ApplyExpenses(state){
 if(!state||typeof state!=="object")return;
 expenseCategories=Array.isArray(state.categories)?state.categories:[];
 expenses=Array.isArray(state.expenses)?state.expenses:[];
 localStorage.setItem("mrkExpenseCategories",JSON.stringify(expenseCategories));
 localStorage.setItem("mrkExpenses",JSON.stringify(expenses));
}

async function v2FetchExpenses(){
 const response=await fetch("/api/expenses/state",{cache:"no-store"});
 if(!response.ok)throw new Error("Unable to load expenses");
 const state=await response.json();
 v2ApplyExpenses(state);
 return state;
}

async function v2InitializeExpenses(){
 const localState=v2ExpensesSnapshot();
 const response=await fetch("/api/expenses/import-if-empty",{
  method:"POST",
  headers:{"Content-Type":"application/json"},
  body:JSON.stringify(localState)
 });
 if(!response.ok)throw new Error("Unable to initialize expenses");
 const result=await response.json();
 v2ApplyExpenses(result.state||{});
 v2ExpensesReady=true;
}

function v2QueueExpensesSave(){
 const snapshot=v2ExpensesSnapshot();
 v2ExpensesSaveQueue=v2ExpensesSaveQueue
  .then(async()=>{
   const response=await fetch("/api/expenses/state",{
    method:"PUT",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(snapshot)
   });
   if(!response.ok)throw new Error("Unable to save expenses");
   const state=await response.json();
   v2ApplyExpenses(state);
  })
  .catch(error=>console.error("Expense sync failed",error));
 return v2ExpensesSaveQueue;
}

saveExpenses=function saveExpenses(){
 localStorage.setItem("mrkExpenses",JSON.stringify(expenses));
 if(v2ExpensesReady)v2QueueExpensesSave();
};

saveExpenseCategories=function saveExpenseCategories(){
 localStorage.setItem("mrkExpenseCategories",JSON.stringify(expenseCategories));
 if(v2ExpensesReady)v2QueueExpensesSave();
};

if(typeof socket!=="undefined"&&socket){
 socket.on("expenses-changed",async()=>{
  if(!v2ExpensesReady)return;
  try{
   const root=document.getElementById("root");
   const screenText=String(root?.textContent||"").toUpperCase();
   const historyOpen=screenText.includes("EXPENSE HISTORY");
   const selectedDate=historyOpen
    ?String(root?.querySelector('input[type="date"]')?.value||"")
    :"";

   await v2FetchExpenses();

   if(historyOpen&&typeof expenseHistoryPage==="function"){
    expenseHistoryPage(selectedDate);
   }
  }catch(error){
   console.error("Expense refresh failed",error);
  }
 });
}

v2InitializeExpenses().catch(error=>{
 console.error("Expense initialization failed",error);
 v2ExpensesReady=true;
});

function v2HideReceiptMetadataFromScreen(){
 document.querySelectorAll("#root .muted").forEach(element=>{
  const text=String(element.textContent||"");
  const markerIndex=text.indexOf("RECEIPT_JSON:");
  if(markerIndex<0)return;
  const cleaned=text.slice(0,markerIndex).replace(/\s*\|\s*$/g,"").trim();
  if(cleaned)element.textContent=cleaned;
  else element.remove();
 });
}

function v2AddKitchenReceiptButtons(){
 if(role!=="kitchen")return;
 document.querySelectorAll("#root .order-card").forEach(card=>{
  if(card.querySelector(".v2-kitchen-print"))return;
  const statusButton=[...card.querySelectorAll("button")].find(button=>String(button.getAttribute("onclick")||"").includes("updateKitchenOrderStatus("));
  if(!statusButton)return;
  const match=String(statusButton.getAttribute("onclick")||"").match(/updateKitchenOrderStatus\((\d+)/);
  if(!match)return;
  const actions=card.querySelector(".actions");
  if(!actions)return;
  const button=document.createElement("button");
  button.className="secondary v2-kitchen-print";
  button.textContent="PRINT RECEIPT";
  button.onclick=event=>{
   event.stopPropagation();
   if(typeof v2PrintReceipt==="function")v2PrintReceipt(Number(match[1]));
  };
  actions.appendChild(button);
 });
}

const v2ReceiptOriginalShowActiveOrders=window.showActiveOrders;
if(typeof v2ReceiptOriginalShowActiveOrders==="function"){
 window.showActiveOrders=async function showActiveOrders(...args){
  const result=await v2ReceiptOriginalShowActiveOrders.apply(this,args);
  v2HideReceiptMetadataFromScreen();
  return result;
 };
}

const v2ReceiptOriginalKitchenHome=window.kitchenHome;
if(typeof v2ReceiptOriginalKitchenHome==="function"){
 window.kitchenHome=async function kitchenHome(...args){
  const result=await v2ReceiptOriginalKitchenHome.apply(this,args);
  v2HideReceiptMetadataFromScreen();
  v2AddKitchenReceiptButtons();
  return result;
 };
}

let v2ComboAdminState=null;
async function v2LoadComboAdminState(force=false){
 if(v2ComboAdminState&&!force)return v2ComboAdminState;
 const response=await fetch("/api/combos/state",{cache:"no-store"});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error||"Unable to load combo settings");
 v2ComboAdminState=data;
 const categories=new Map((data.categories||[]).map(row=>[row.id,row]));
 const items=new Map((data.items||[]).map(row=>[row.id,row]));
 menuCategoryData.forEach(category=>category.categoryType=categories.get(category.id)?.category_type||"item");
 ownerMenuData.forEach(item=>item.showOnMenu=items.has(item.id)?Boolean(items.get(item.id).show_on_menu):true);
 return data;
}

function v2ComboInsertField(anchor,id,label,html){
 if(!anchor||document.getElementById(id))return;
 const holder=document.createElement("div");
 holder.id=id;
 holder.innerHTML=`<label>${label}</label>${html}`;
 anchor.insertAdjacentElement("afterend",holder);
}

const v2ComboOriginalOwnerAddCategory=window.ownerAddCategory;
if(typeof v2ComboOriginalOwnerAddCategory==="function"){
 window.ownerAddCategory=function ownerAddCategory(){
  v2ComboOriginalOwnerAddCategory();
  v2ComboInsertField(document.getElementById("newCategoryIcon"),"v2CategoryTypeField","CATEGORY TYPE",`<select id="newCategoryType" style="width:100%;padding:14px;border-radius:10px;border:1px solid #444;background:#0d0d0d;color:white;margin-bottom:10px"><option value="item">Normal Menu Category</option><option value="combo">Combo Category</option></select><p class="muted">Combo categories contain combo products built from existing menu items.</p>`);
 };
}

const v2ComboOriginalSaveNewCategory=window.saveNewCategory;
if(typeof v2ComboOriginalSaveNewCategory==="function"){
 window.saveNewCategory=async function saveNewCategory(){
  if((document.getElementById("newCategoryType")?.value||"item")!=="combo")return v2ComboOriginalSaveNewCategory();
  const name=document.getElementById("newCategoryName")?.value.trim()||"";
  const icon=document.getElementById("newCategoryIcon")?.value.trim()||"🍱";
  if(!name){alert("Please enter a category name.");return;}
  try{
   const response=await fetch("/api/combos/categories",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,icon,active:true})});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Unable to create combo category");
   if(typeof loadV2BackendMenu==="function")await loadV2BackendMenu(true);
   await v2LoadComboAdminState(true);
   alert("Combo category added successfully.");
   ownerCategoryList();
  }catch(error){alert(error.message||"Unable to create combo category.");}
 };
}

const v2ComboOriginalOwnerEditCategory=window.ownerEditCategory;
if(typeof v2ComboOriginalOwnerEditCategory==="function"){
 window.ownerEditCategory=async function ownerEditCategory(id){
  try{await v2LoadComboAdminState();}catch{}
  v2ComboOriginalOwnerEditCategory(id);
  const category=menuCategoryData.find(entry=>entry.id===id);
  if(category?.categoryType==="combo"){
   const panel=document.querySelector("#root .panel");
   if(panel){
    const note=document.createElement("div");
    note.className="system-note";
    note.textContent="Combo Category — editable like any other category.";
    panel.prepend(note);
   }
  }
 };
}

function v2InjectShowOnMenu(value){
 const anchor=document.getElementById("newMenuItemName")||document.getElementById("editMenuItemName");
 v2ComboInsertField(anchor,"v2ShowOnMenuField","SHOW ON MENU",`<select id="v2ShowOnMenu" style="width:100%;padding:14px;border-radius:10px;border:1px solid #444;background:#0d0d0d;color:white;margin-bottom:10px"><option value="true" ${value!==false?"selected":""}>Yes — sell as standalone item</option><option value="false" ${value===false?"selected":""}>No — hidden / combo-only item</option></select><p class="muted">Hidden active items can still be used and customized inside combos.</p>`);
}

const v2ComboOriginalOwnerAddMenuItem=window.ownerAddMenuItem;
if(typeof v2ComboOriginalOwnerAddMenuItem==="function"){
 window.ownerAddMenuItem=function ownerAddMenuItem(){
  v2ComboOriginalOwnerAddMenuItem();
  v2InjectShowOnMenu(true);
 };
}

const v2ComboOriginalOwnerEditMenuItem=window.ownerEditMenuItem;
if(typeof v2ComboOriginalOwnerEditMenuItem==="function"){
 window.ownerEditMenuItem=async function ownerEditMenuItem(id){
  try{await v2LoadComboAdminState();}catch{}
  v2ComboOriginalOwnerEditMenuItem(id);
  v2InjectShowOnMenu(ownerMenuData.find(entry=>entry.id===id)?.showOnMenu!==false);
 };
}

const v2ComboOriginalSaveNewMenuItem=window.saveNewMenuItem;
if(typeof v2ComboOriginalSaveNewMenuItem==="function"){
 window.saveNewMenuItem=async function saveNewMenuItem(){
  const name=document.getElementById("newMenuItemName")?.value.trim()||"";
  const show=document.getElementById("v2ShowOnMenu")?.value!=="false";
  await v2ComboOriginalSaveNewMenuItem();
  const item=ownerMenuData.find(entry=>entry.name===name);
  if(!item)return;
  try{
   const response=await fetch(`/api/menu/items/${encodeURIComponent(item.id)}/visibility`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({show_on_menu:show})});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Unable to save menu visibility");
   item.showOnMenu=show;
   await v2LoadComboAdminState(true);
  }catch(error){alert(error.message||"Menu item was saved, but visibility could not be updated.");}
 };
}

const v2ComboOriginalSaveEditedMenuItem=window.saveEditedMenuItem;
if(typeof v2ComboOriginalSaveEditedMenuItem==="function"){
 window.saveEditedMenuItem=async function saveEditedMenuItem(id){
  const show=document.getElementById("v2ShowOnMenu")?.value!=="false";
  await v2ComboOriginalSaveEditedMenuItem(id);
  const item=ownerMenuData.find(entry=>entry.id===id);
  if(!item)return;
  try{
   const response=await fetch(`/api/menu/items/${encodeURIComponent(id)}/visibility`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({show_on_menu:show})});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Unable to save menu visibility");
   item.showOnMenu=show;
   await v2LoadComboAdminState(true);
  }catch(error){alert(error.message||"Menu item was saved, but visibility could not be updated.");}
 };
}

const v2ComboOriginalOpenCategory=window.openCategory;
if(typeof v2ComboOriginalOpenCategory==="function"){
 window.openCategory=async function openCategory(categoryId){
  const result=await v2ComboOriginalOpenCategory(categoryId);
  try{
   const state=await v2LoadComboAdminState(true);
   const hidden=new Set((state.items||[]).filter(item=>item.active&&!item.show_on_menu).map(item=>item.name));
   document.querySelectorAll("#root .card").forEach(card=>{
    const name=card.querySelector("h3")?.textContent.trim();
    if(name&&hidden.has(name))card.remove();
   });
  }catch(error){console.error("Unable to apply menu visibility",error);}
  return result;
 };
}

v2LoadComboAdminState().catch(error=>console.error("Combo admin state load failed",error));

function v2ComboComponentRows(selected=[]){
 const selectedMap=new Map((selected||[]).map(component=>[component.menu_item_id,Number(component.quantity||1)]));
 const categoryNames=new Map(menuCategoryData.map(category=>[category.id,category.name]));
 return ownerMenuData
  .filter(item=>item.active!==false)
  .sort((a,b)=>String(a.name).localeCompare(String(b.name)))
  .map(item=>{
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
}

function v2ReadComboComponents(){
 const components=[];
 document.querySelectorAll(".v2-combo-component:checked").forEach(box=>{
  const id=box.dataset.itemId;
  const input=document.querySelector(`.v2-combo-qty[data-item-id="${CSS.escape(id)}"]`);
  const quantity=Number(input?.value||1);
  if(Number.isInteger(quantity)&&quantity>0){
   components.push({menu_item_id:id,quantity});
  }
 });
 return components;
}

window.v2OwnerComboCategory=async function v2OwnerComboCategory(categoryId){
 clearInterval(timerInterval);
 try{
  const state=await v2LoadComboAdminState(true);
  const category=(state.categories||[]).find(row=>row.id===categoryId&&row.category_type==="combo");
  if(!category)throw new Error("Combo category not found");
  const combos=(state.combos||[]).filter(combo=>combo.category_id===categoryId);
  document.getElementById("root").innerHTML=`
   <div class="app">
    <button class="back" onclick="ownerCategoryList()">← BACK</button>
    <div class="logo">MR K BURGERS<span>OWNER — ${esc(category.name.toUpperCase())}</span></div>
    <div class="panel">
     <span class="badge">🍱 COMBO CATEGORY</span>
     <h1>${esc(category.name)}</h1>
     <button class="primary" onclick="v2OwnerAddCombo('${esc(categoryId)}')">ADD COMBO</button>
     <div class="grid" style="margin-top:18px">
      ${combos.length?combos.map(combo=>`
       <div class="card">
        <h3>${esc(combo.name)}</h3>
        ${combo.description?`<p class="muted">${esc(combo.description)}</p>`:""}
        <p><strong>${Number(combo.price||0).toLocaleString()} CFA</strong></p>
        <p class="muted">Status: ${combo.active?"Active":"Inactive"}</p>
        <p class="muted">${(combo.components||[]).map(component=>`${...