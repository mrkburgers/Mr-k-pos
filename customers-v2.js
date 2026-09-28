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
})();
