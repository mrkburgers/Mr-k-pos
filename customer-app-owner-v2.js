/* Owner Customer App Management - Phase 1 shell */
(function(){
 function v2CustomerAppStatusLabel(value){
  const labels={
   NOT_CONFIGURED:"Not configured",
   CONNECTED:"Connected",
   DISCONNECTED:"Disconnected",
   LOCAL_ONLY:"Local only",
   SYNCED:"Synced",
   SYNC_ERROR:"Sync problem"
  };
  return labels[String(value||"")]||String(value||"—");
 }

 function v2CustomerAppDate(value){
  if(!value)return "Never";
  const text=String(value);
  const date=new Date(text.includes("T")?text:text.replace(" ","T")+"Z");
  return Number.isNaN(date.getTime())?text:date.toLocaleString();
 }

 async function v2FetchCustomerAppState(){
  const response=await fetch("/api/customer-app/state",{cache:"no-store"});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||"Unable to load Customer App settings.");
  return data;
 }

 window.v2OwnerCustomerAppManagement=async function v2OwnerCustomerAppManagement(){
  if(role!=="owner"){
   alert("Only the owner can access Customer App Management.");
   return;
  }

  clearInterval(timerInterval);
  document.getElementById("root").innerHTML=`
   <div class="app">
    <button class="back" onclick="ownerHome()">← BACK</button>
    <div class="logo">MR K BURGERS<span>OWNER — CUSTOMER APP</span></div>
    <div class="panel">
     <span class="badge">📱 CUSTOMER APP MANAGEMENT</span>
     <h1>Customer App</h1>
     <div id="v2CustomerAppManagementBody">
      <p class="muted">Loading Customer App settings...</p>
     </div>
    </div>
   </div>`;

  try{
   const state=await v2FetchCustomerAppState();
   v2RenderCustomerAppManagement(state);
  }catch(error){
   console.error("Unable to load Customer App Management",error);
   document.getElementById("v2CustomerAppManagementBody").innerHTML=
    `<div class="system-note">${esc(error.message||"Unable to load Customer App settings.")}</div>`;
  }
 };

 function v2RenderCustomerAppManagement(state){
  const root=document.getElementById("v2CustomerAppManagementBody");
  if(!root)return;

  const orderingOn=Boolean(state.onlineOrderingEnabled);
  root.innerHTML=`
   <div class="summary">
    <div class="info-row">
     <span>Online Ordering</span>
     <strong>${orderingOn?"ON":"OFF"}</strong>
    </div>
    <div class="info-row">
     <span>Cloud Connection</span>
     <strong>${esc(v2CustomerAppStatusLabel(state.cloudStatus))}</strong>
    </div>
    <div class="info-row">
     <span>Sync Status</span>
     <strong>${esc(v2CustomerAppStatusLabel(state.syncStatus))}</strong>
    </div>
    <div class="info-row">
     <span>Last Successful Sync</span>
     <strong>${esc(v2CustomerAppDate(state.lastSyncAt))}</strong>
    </div>
    <div class="info-row">
     <span>Draft Changes</span>
     <strong>${Number(state.draftChanges||0).toLocaleString()}</strong>
    </div>
    <div class="info-row">
     <span>Published Version</span>
     <strong>v${Number(state.publishedVersion||0)}</strong>
    </div>
   </div>

   <div class="form" style="margin-top:20px">
    <button
     class="${orderingOn?"danger":"primary"}"
     onclick="v2SetOnlineOrdering(${orderingOn?"false":"true"})">
     ${orderingOn?"TURN ONLINE ORDERING OFF":"TURN ONLINE ORDERING ON"}
    </button>
   </div>

   <div class="system-note" style="margin-top:18px">
    Phase 1 foundation only. Cloud connection, sync, drafts and publishing will be connected in the next steps.
   </div>

   <div class="grid" style="margin-top:20px">
    <div class="card">
     <div class="category-icon">📝</div>
     <h3>DRAFT CHANGES</h3>
     <p class="muted">Framework ready. Editing comes later.</p>
    </div>
    <div class="card">
     <div class="category-icon">🖼️</div>
     <h3>HOME & MEDIA</h3>
     <p class="muted">Images and videos will be Owner-managed.</p>
    </div>
    <div class="card">
     <div class="category-icon">🟠</div>
     <h3>ORANGE MONEY</h3>
     <p class="muted">Payment integration not connected yet.</p>
    </div>
    <div class="card">
     <div class="category-icon">🔄</div>
     <h3>ORDERS / SYNC</h3>
     <p class="muted">Cloud-to-POS sync comes next.</p>
    </div>
   </div>
  `;
 }

 window.v2SetOnlineOrdering=async function v2SetOnlineOrdering(enabled){
  if(role!=="owner")return;

  const action=enabled?"enable":"disable";
  if(!confirm(`Do you want to ${action} online ordering?`))return;

  try{
   const response=await fetch("/api/customer-app/online-ordering",{
    method:"PUT",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({enabled:Boolean(enabled)})
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Unable to update online ordering.");

   v2RenderCustomerAppManagement(data);
  }catch(error){
   alert(error.message||"Unable to update online ordering.");
  }
 };

 function v2InjectCustomerAppCard(){
  if(role!=="owner")return;
  const grid=document.querySelector("#root .grid");
  if(!grid||document.getElementById("v2CustomerAppCard"))return;

  const ownerDashboard=String(document.querySelector("#root .badge")?.textContent||"")
   .toUpperCase()
   .includes("OWNER DASHBOARD");
  if(!ownerDashboard)return;

  const card=document.createElement("div");
  card.id="v2CustomerAppCard";
  card.className="card";
  card.style.cursor="pointer";
  card.onclick=()=>v2OwnerCustomerAppManagement();
  card.innerHTML='<div class="category-icon">📱</div><h3>CUSTOMER APP</h3><p class="muted">Online ordering and app management</p>';
  grid.appendChild(card);
 }

 const previousOwnerHome=window.ownerHome;
 if(typeof previousOwnerHome==="function"){
  window.ownerHome=function ownerHome(){
   const result=previousOwnerHome.apply(this,arguments);
   v2InjectCustomerAppCard();
   return result;
  };
 }

 const root=document.getElementById("root");
 if(root&&typeof MutationObserver!=="undefined"){
  const observer=new MutationObserver(()=>v2InjectCustomerAppCard());
  observer.observe(root,{childList:true,subtree:true});
 }

 setTimeout(v2InjectCustomerAppCard,0);
})();
