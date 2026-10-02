/* Customer App draft/publish controls - Phase 1 */
(function(){
 function injectDraftControls(){
  if(typeof role==="undefined"||role!=="owner")return;
  const body=document.getElementById("v2CustomerAppManagementBody");
  if(!body||document.getElementById("v2CustomerAppDraftControls"))return;

  const grid=body.querySelector(".grid");
  if(!grid)return;

  const card=document.createElement("div");
  card.id="v2CustomerAppDraftControls";
  card.className="card";
  card.innerHTML=
   '<div class="category-icon">📝</div>'+
   '<h3>PUBLISH CONTROL</h3>'+
   '<p class="muted">Prepare the current POS state as a draft, then publish it while Online Ordering is OFF.</p>'+
   '<button class="primary" style="margin-top:12px" onclick="v2PrepareCustomerAppSnapshot()">PREPARE CURRENT POS SNAPSHOT</button>'+
   '<button style="margin-top:10px" onclick="v2DiscardCustomerAppDrafts()">DISCARD DRAFTS</button>'+
   '<button class="primary" style="margin-top:10px" onclick="v2PublishCustomerAppDrafts()">PUBLISH CHANGES</button>';

  grid.prepend(card);
 }

 window.v2PrepareCustomerAppSnapshot=async function(){
  try{
   const response=await fetch("/api/customer-app/drafts/prepare-snapshot",{method:"POST"});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Unable to prepare draft.");
   await v2OwnerCustomerAppManagement();
  }catch(error){
   alert(error.message||"Unable to prepare draft.");
  }
 };

 window.v2DiscardCustomerAppDrafts=async function(){
  try{
   const response=await fetch("/api/customer-app/drafts",{method:"DELETE"});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Unable to discard drafts.");
   await v2OwnerCustomerAppManagement();
  }catch(error){
   alert(error.message||"Unable to discard drafts.");
  }
 };

 window.v2PublishCustomerAppDrafts=async function(){
  try{
   const response=await fetch("/api/customer-app/publish",{method:"POST"});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Unable to publish changes.");
   alert("Published as version v"+Number(data.publishedVersion||0)+".");
   await v2OwnerCustomerAppManagement();
  }catch(error){
   alert(error.message||"Unable to publish changes.");
  }
 };

 const root=document.getElementById("root");
 if(root&&typeof MutationObserver!=="undefined"){
  const observer=new MutationObserver(injectDraftControls);
  observer.observe(root,{childList:true,subtree:true});
 }
 setTimeout(injectDraftControls,0);
})();