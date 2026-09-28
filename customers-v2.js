/* Shared delivery customer lookup / smart delivery flow */
(function(){
 let v2CustomerLookupTimer=null;
 let v2CustomerZones=[];

 function v2NormalizePhone(value){
  let digits=String(value||"").replace(/\D/g,"");
  if(digits.startsWith("00"))digits=digits.slice(2);
  if(digits.length===8)digits="223"+digits;
  return digits;
 }

 async function v2LoadCustomerZones(){
  const response=await fetch("/api/delivery-zones",{cache:"no-store"});
  const data=await response.json().catch(()=>[]);
  if(!response.ok)throw new Error(data.error||"Unable to load delivery zones.");
  v2CustomerZones=Array.isArray(data)?data:[];
  return v2CustomerZones;
 }

 function v2ApplyZone(zoneId){
  const zone=v2CustomerZones.find(item=>String(item.id)===String(zoneId)&&item.active!==false);
  if(!zone){
   customer={...customer,deliveryZoneId:"",deliveryZoneName:"",deliveryFee:0};
   return false;
  }
  customer={
   ...customer,
   deliveryZoneId:String(zone.id),
   deliveryZoneName:String(zone.name||""),
   deliveryFee:Number(zone.fee||0)
  };
  return true;
 }

 function v2RenderZoneSelect(){
  const form=document.querySelector("#root .form");
  if(!form||document.getElementById("v2DeliveryZoneSelect"))return;

  const continueButton=[...form.querySelectorAll("button")].find(button=>
   String(button.textContent||"").includes("CONTINUE TO MENU")
  );
  if(!continueButton)return;

  const wrapper=document.createElement("div");
  wrapper.id="v2DeliveryZoneBlock";
  wrapper.innerHTML=`
   <label>Delivery Zone</label>
   <select id="v2DeliveryZoneSelect">
    <option value="">Select delivery zone</option>
    ${v2CustomerZones.map(zone=>`
     <option value="${esc(zone.id)}">
      ${esc(zone.name)} — ${Number(zone.fee||0).toLocaleString()} CFA
     </option>`).join("")}
   </select>
   <div id="v2CustomerLookupStatus" class="system-note" style="display:none;margin-top:10px"></div>`;
  continueButton.insertAdjacentElement("beforebegin",wrapper);

  const select=document.getElementById("v2DeliveryZoneSelect");
  if(customer?.deliveryZoneId)select.value=String(customer.deliveryZoneId);

  select.addEventListener("change",()=>{
   v2ApplyZone(select.value);
  });
 }

 function v2SetLookupStatus(message){
  const box=document.getElementById("v2CustomerLookupStatus");
  if(!box)return;
  if(!message){
   box.style.display="none";
   box.textContent="";
   return;
  }
  box.textContent=message;
  box.style.display="";
 }

 async function v2LookupCustomerByPhone(){
  if(String(orderType||"").toUpperCase()!=="DELIVERY")return;

  const phoneInput=document.getElementById("phone");
  const nameInput=document.getElementById("name");
  const addressInput=document.getElementById("address");
  const zoneSelect=document.getElementById("v2DeliveryZoneSelect");
  if(!phoneInput||!nameInput||!addressInput||!zoneSelect)return;

  const normalized=v2NormalizePhone(phoneInput.value);
  if(normalized.length<11){
   v2SetLookupStatus("");
   return;
  }

  try{
   v2SetLookupStatus("Checking customer...");
   const response=await fetch(
    `/api/customers/by-phone?phone=${encodeURIComponent(phoneInput.value)}`,
    {cache:"no-store"}
   );

   if(response.status===404){
    customer={...customer,name:"",phone:phoneInput.value.trim(),address:"",deliveryZoneId:"",deliveryZoneName:"",deliveryFee:0};
    nameInput.value="";
    addressInput.value="";
    zoneSelect.value="";
    v2SetLookupStatus("New customer — enter name, address and delivery zone.");
    return;
   }

   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Unable to search customer.");

   const saved=data.customer||{};
   nameInput.value=String(saved.name||"");
   addressInput.value=String(saved.address||"");

   customer={
    ...customer,
    name:String(saved.name||""),
    phone:phoneInput.value.trim(),
    address:String(saved.address||"")
   };

   const zoneOk=v2ApplyZone(saved.deliveryZoneId);
   zoneSelect.value=zoneOk?String(saved.deliveryZoneId):"";

   if(zoneOk){
    v2SetLookupStatus(
     `Returning customer — ${saved.orderCount||0} previous order${Number(saved.orderCount||0)===1?"":"s"}. Name, address and zone filled automatically.`
    );
   }else{
    v2SetLookupStatus("Returning customer found. Saved delivery zone is unavailable — choose a current zone.");
   }
  }catch(error){
   console.error("Customer lookup failed",error);
   v2SetLookupStatus("Customer lookup unavailable. You can enter the details manually.");
  }
 }

 function v2AttachPhoneLookup(){
  const phoneInput=document.getElementById("phone");
  if(!phoneInput||phoneInput.dataset.v2CustomerLookup==="1")return;
  phoneInput.dataset.v2CustomerLookup="1";

  phoneInput.addEventListener("input",()=>{
   clearTimeout(v2CustomerLookupTimer);
   v2CustomerLookupTimer=setTimeout(v2LookupCustomerByPhone,350);
  });
  phoneInput.addEventListener("blur",()=>{
   clearTimeout(v2CustomerLookupTimer);
   v2LookupCustomerByPhone();
  });
 }

 const v2CustomerOriginalForm=window.customerForm;
 if(typeof v2CustomerOriginalForm==="function"){
  window.customerForm=async function customerForm(){
   const result=v2CustomerOriginalForm.apply(this,arguments);
   if(String(orderType||"").toUpperCase()!=="DELIVERY")return result;

   try{
    await v2LoadCustomerZones();
    v2RenderZoneSelect();
    v2AttachPhoneLookup();
   }catch(error){
    console.error("Unable to prepare smart delivery form",error);
    const form=document.querySelector("#root .form");
    if(form){
     const note=document.createElement("div");
     note.className="system-note";
     note.textContent="Unable to load delivery zones. Please try again.";
     form.insertBefore(note,form.firstChild);
    }
   }
   return result;
  };
 }

 const v2CustomerPreviousSelectOrderType=window.selectOrderType;
 if(typeof v2CustomerPreviousSelectOrderType==="function"){
  window.selectOrderType=function selectOrderType(type){
   if(String(type||"").toUpperCase()!=="DELIVERY"){
    return v2CustomerPreviousSelectOrderType.apply(this,arguments);
   }

   orderType="DELIVERY";
   customer={
    name:"",
    phone:"",
    address:"",
    table:"",
    deliveryZoneId:"",
    deliveryZoneName:"",
    deliveryFee:0
   };
   customerForm();
  };
 }

 const v2CustomerPreviousSaveCustomer=window.saveCustomer;
 if(typeof v2CustomerPreviousSaveCustomer==="function"){
  window.saveCustomer=function saveCustomer(){
   if(String(orderType||"").toUpperCase()==="DELIVERY"){
    const zoneSelect=document.getElementById("v2DeliveryZoneSelect");
    if(!zoneSelect?.value){
     alert("Select the delivery zone.");
     return;
    }
    v2ApplyZone(zoneSelect.value);
   }
   return v2CustomerPreviousSaveCustomer.apply(this,arguments);
  };
 }

 const v2CustomerPreviousFetch=window.fetch.bind(window);
 window.fetch=async function v2CustomerFetch(input,options={}){
  const url=typeof input==="string"?input:String(input?.url||"");
  const method=String(options?.method||"GET").toUpperCase();

  if((url==="/api/orders-with-inventory"||url==="/api/orders")&&method==="POST"){
   let body={};
   try{body=options.body?JSON.parse(options.body):{};}catch{}

   if(String(body.order_type||"").toUpperCase()==="DELIVERY"){
    const pending=typeof v2PendingCheckout!=="undefined"?v2PendingCheckout:null;
    const pendingCustomer=pending?.customer||customer||{};
    body.customer_address=String(pendingCustomer.address||"").trim();
    options={...options,body:JSON.stringify(body)};
   }
  }

  return v2CustomerPreviousFetch(input,options);
 };

 function v2CustomerMoney(value){
  return Number(value||0).toLocaleString()+" CFA";
 }

 function v2CustomerDate(value){
  if(!value)return "—";
  const text=String(value);
  const date=new Date(text.includes("T")?text:text.replace(" ","T")+"Z");
  if(Number.isNaN(date.getTime()))return text;
  return date.toLocaleString();
 }

 function v2CustomerStatusClass(status){
  return String(status||"").toUpperCase()==="COMPLETED"?"ready":"";
 }

 window.v2OwnerCustomers=async function v2OwnerCustomers(search=""){
  if(role!=="owner"){
   alert("Only the owner can access Customer History.");
   return;
  }

  clearInterval(timerInterval);
  document.getElementById("root").innerHTML=`
   <div class="app">
    <button class="back" onclick="ownerHome()">← BACK</button>
    <div class="logo">MR K BURGERS<span>OWNER — CUSTOMERS</span></div>
    <div class="panel">
     <span class="badge">👤 CUSTOMER HISTORY</span>
     <h1>Customers</h1>
     <div class="form">
      <label>Search by Name or Phone</label>
      <input
       id="v2CustomerHistorySearch"
       value="${esc(search)}"
       placeholder="Type customer name or phone number"
       oninput="v2CustomerHistorySearchChanged(this.value)">
     </div>
     <div id="v2CustomerHistoryResults">
      <p class="muted">Loading customers...</p>
     </div>
    </div>
   </div>`;

  await v2LoadOwnerCustomers(search);
 };

 let v2CustomerHistorySearchTimer=null;
 window.v2CustomerHistorySearchChanged=function v2CustomerHistorySearchChanged(value){
  clearTimeout(v2CustomerHistorySearchTimer);
  v2CustomerHistorySearchTimer=setTimeout(()=>v2LoadOwnerCustomers(value),250);
 };

 async function v2LoadOwnerCustomers(search=""){
  const results=document.getElementById("v2CustomerHistoryResults");
  if(!results)return;

  try{
   const response=await fetch(
    `/api/customers?search=${encodeURIComponent(String(search||"").trim())}`,
    {cache:"no-store"}
   );
   const data=await response.json().catch(()=>[]);
   if(!response.ok)throw new Error(data.error||"Unable to load customers.");

   const rows=Array.isArray(data)?data:[];
   results.innerHTML=rows.length?rows.map(entry=>`
    <div
     class="card clickable"
     style="margin-top:12px"
     onclick="v2OwnerCustomerDetail('${encodeURIComponent(entry.phoneKey||"")}')">
     <div class="order-top">
      <div>
       <h3>${esc(entry.name||"Unnamed Customer")}</h3>
       <div class="muted">${esc(entry.phone||"")}</div>
      </div>
      <strong>${Number(entry.totalOrders||0).toLocaleString()} order${Number(entry.totalOrders||0)===1?"":"s"}</strong>
     </div>
     <div class="info-row">
      <span>Delivery Zone</span>
      <strong>${esc(entry.deliveryZoneName||"—")}</strong>
     </div>
     <div class="info-row">
      <span>Total Spent</span>
      <strong>${v2CustomerMoney(entry.totalSpent)}</strong>
     </div>
     <div class="info-row">
      <span>Last Order</span>
      <strong>${esc(v2CustomerDate(entry.lastOrderAt))}</strong>
     </div>
    </div>
   `).join(""):`<p class="muted" style="margin-top:18px">No customers found.</p>`;
  }catch(error){
   console.error("Unable to load Customer History",error);
   results.innerHTML=`<div class="system-note">${esc(error.message||"Unable to load customers.")}</div>`;
  }
 }

 window.v2OwnerCustomerDetail=async function v2OwnerCustomerDetail(encodedPhoneKey){
  if(role!=="owner"){
   alert("Only the owner can access Customer History.");
   return;
  }

  const phoneKey=decodeURIComponent(String(encodedPhoneKey||""));
  document.getElementById("root").innerHTML=`
   <div class="app">
    <button class="back" onclick="v2OwnerCustomers()">← BACK</button>
    <div class="logo">MR K BURGERS<span>OWNER — CUSTOMER HISTORY</span></div>
    <div class="panel"><p class="muted">Loading customer history...</p></div>
   </div>`;

  try{
   const response=await fetch(
    `/api/customers/${encodeURIComponent(phoneKey)}/history`,
    {cache:"no-store"}
   );
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Unable to load customer history.");

   const history=Array.isArray(data.history)?data.history:[];
   document.querySelector("#root .panel").innerHTML=`
    <span class="badge">👤 CUSTOMER PROFILE</span>
    <h1>${esc(data.name||"Unnamed Customer")}</h1>

    <div class="summary">
     <div class="info-row"><span>Phone</span><strong>${esc(data.phone||"—")}</strong></div>
     <div class="info-row"><span>Saved Address</span><strong>${esc(data.address||"—")}</strong></div>
     <div class="info-row"><span>Saved Delivery Zone</span><strong>${esc(data.deliveryZoneName||"—")}</strong></div>
     <div class="info-row"><span>First Order</span><strong>${esc(v2CustomerDate(data.firstOrderAt))}</strong></div>
     <div class="info-row"><span>Last Order</span><strong>${esc(v2CustomerDate(data.lastOrderAt))}</strong></div>
     <div class="info-row"><span>Total Delivery Orders</span><strong>${Number(data.totalOrders||0).toLocaleString()}</strong></div>
     <div class="info-row"><span>Completed & Paid Orders</span><strong>${Number(data.completedPaidOrders||0).toLocaleString()}</strong></div>
     <div class="info-row"><span>Total Spent</span><strong>${v2CustomerMoney(data.totalSpent)}</strong></div>
    </div>

    <h2 style="margin-top:26px">Order History</h2>
    ${history.length?history.map(order=>`
     <div class="card" style="margin-top:12px">
      <div class="order-top">
       <div>
        <h3>#${String(Number(order.orderNumber||0)).padStart(3,"0")}</h3>
        <div class="muted">${esc(v2CustomerDate(order.createdAt))}</div>
       </div>
       <span class="status ${v2CustomerStatusClass(order.status)}">${esc(order.status||"—")}</span>
      </div>
      <div class="info-row"><span>Amount</span><strong>${v2CustomerMoney(order.total)}</strong></div>
      <div class="info-row"><span>Payment</span><strong>${esc(order.paymentMethod||"—")}</strong></div>
      <div class="info-row"><span>Payment Status</span><strong>${esc(order.paymentStatus||"—")}</strong></div>
      <div class="info-row"><span>Address</span><strong>${esc(order.address||"—")}</strong></div>
      <div class="info-row"><span>Delivery Zone</span><strong>${esc(order.deliveryZoneName||"—")}</strong></div>
     </div>
    `).join(""):`<p class="muted">No delivery order history found.</p>`}
   `;
  }catch(error){
   console.error("Unable to load customer detail",error);
   document.querySelector("#root .panel").innerHTML=
    `<div class="system-note">${esc(error.message||"Unable to load customer history.")}</div>`;
  }
 };

 const v2CustomerPreviousOwnerHome=window.ownerHome;
 if(typeof v2CustomerPreviousOwnerHome==="function"){
  window.ownerHome=function ownerHome(){
   const result=v2CustomerPreviousOwnerHome.apply(this,arguments);
   if(role!=="owner")return result;

   const grid=document.querySelector("#root .grid");
   if(grid&&!document.getElementById("v2CustomersCard")){
    const card=document.createElement("div");
    card.id="v2CustomersCard";
    card.className="card";
    card.style.cursor="pointer";
    card.onclick=()=>v2OwnerCustomers();
    card.innerHTML='<div class="category-icon">👤</div><h3>CUSTOMERS</h3><p class="muted">Customer profiles and delivery history</p>';
    grid.appendChild(card);
   }

   return result;
  };
 }
})();
