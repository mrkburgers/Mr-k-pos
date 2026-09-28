(function(){
 function downloadBlob(blob,filename){
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;
  link.download=filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
 }

 window.v2DownloadDatabaseBackup=async function v2DownloadDatabaseBackup(){
  try{
   const response=await fetch("/api/database-backup",{cache:"no-store"});
   if(!response.ok){
    const data=await response.json().catch(()=>({}));
    throw new Error(data.error||"Unable to create database backup.");
   }
   const disposition=String(response.headers.get("content-disposition")||"");
   const match=disposition.match(/filename="?([^";]+)"?/i);
   const filename=match?.[1]||"mr-k-pos-backup.db";
   const blob=await response.blob();
   downloadBlob(blob,filename);
  }catch(error){
   alert(error.message||"Unable to create database backup.");
  }
 };

 window.v2RestoreDatabaseBackup=async function v2RestoreDatabaseBackup(event){
  const input=event?.target;
  const file=input?.files?.[0];
  if(!file)return;

  if(!String(file.name||"").toLowerCase().endsWith(".db")){
   alert("Please select a Mr K POS .db backup file.");
   input.value="";
   return;
  }

  const confirmed=confirm(
   "Restore this database backup?\n\n"+
   "The current database will first be saved automatically as a safety backup.\n\n"+
   "After a successful restore, the Mr K POS server will stop and must be restarted."
  );
  if(!confirmed){
   input.value="";
   return;
  }

  try{
   const body=await file.arrayBuffer();
   const response=await fetch("/api/database-restore",{
    method:"POST",
    headers:{"Content-Type":"application/octet-stream"},
    body
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok){
    throw new Error(data.error||"Unable to restore database backup.");
   }
   alert(
    (data.message||"Database restored. Restart the Mr K POS server.")+
    (data.safety_backup?"\n\nSafety backup created: "+data.safety_backup:"")
   );
   document.getElementById("root").innerHTML=
    '<div class="login"><div class="loginbox"><div class="logo">MR K BURGERS<span>DATABASE RESTORED</span></div><div class="system-note" style="margin-top:24px">Database restored successfully.<br><br>Restart the Mr K POS server, then reload this page.</div></div></div>';
  }catch(error){
   alert(error.message||"Unable to restore database backup.");
   input.value="";
  }
 };

 const originalOwnerPosSettings=window.ownerPosSettings;
 if(typeof originalOwnerPosSettings==="function"){
  window.ownerPosSettings=function ownerPosSettings(){
   const result=originalOwnerPosSettings.apply(this,arguments);
   if(role!=="owner")return result;

   const panel=document.querySelector("#root .panel");
   const grid=panel?.querySelector(".grid");
   if(!grid)return result;

   const cards=[...grid.querySelectorAll(".card")];
   const exportCard=cards.find(card=>card.querySelector("h3")?.textContent?.trim()==="EXPORT BACKUP");
   const restoreCard=cards.find(card=>card.querySelector("h3")?.textContent?.trim()==="RESTORE BACKUP");

   if(exportCard){
    exportCard.onclick=()=>v2DownloadDatabaseBackup();
    exportCard.querySelector("h3").textContent="DATABASE BACKUP";
    const note=exportCard.querySelector(".muted");
    if(note)note.textContent="Download a safe backup of the real SQLite restaurant database";
   }

   if(restoreCard){
    restoreCard.onclick=()=>document.getElementById("v2DatabaseBackupFileInput")?.click();
    restoreCard.querySelector("h3").textContent="RESTORE DATABASE";
    const note=restoreCard.querySelector(".muted");
    if(note)note.textContent="Validate and restore a Mr K SQLite database backup";
   }

   if(!document.getElementById("v2DatabaseBackupFileInput")){
    const dbInput=document.createElement("input");
    dbInput.id="v2DatabaseBackupFileInput";
    dbInput.type="file";
    dbInput.accept=".db,application/octet-stream";
    dbInput.style.display="none";
    dbInput.onchange=v2RestoreDatabaseBackup;
    panel.appendChild(dbInput);
   }

   if(!document.getElementById("v2LegacyBackupSection")){
    const section=document.createElement("div");
    section.id="v2LegacyBackupSection";
    section.style.marginTop="26px";
    section.innerHTML=
     '<div class="system-note"><strong>LEGACY BROWSER BACKUP</strong><br>Temporary compatibility backup for remaining browser-local data. The SQLite database backup above is the primary production backup.</div>'+
     '<div class="grid" style="margin-top:14px"><div class="card" id="v2LegacyExportBackup" style="cursor:pointer"><div class="category-icon">🗂️</div><h3>EXPORT LEGACY BACKUP</h3><p class="muted">Download remaining browser-local compatibility data</p></div><div class="card" id="v2LegacyRestoreBackup" style="cursor:pointer"><div class="category-icon">↩️</div><h3>RESTORE LEGACY BACKUP</h3><p class="muted">Restore the older browser JSON backup format</p></div></div>';
    panel.appendChild(section);
    section.querySelector("#v2LegacyExportBackup").onclick=()=>exportMrKBackup();
    section.querySelector("#v2LegacyRestoreBackup").onclick=()=>document.getElementById("mrkBackupFileInput")?.click();
   }

   return result;
  };
 }
})();
