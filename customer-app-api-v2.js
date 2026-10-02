const createSecurityAuthV2=require("./security-auth-v2");

module.exports=function registerCustomerAppV2(app,io,db){
 const ownerOnly=createSecurityAuthV2().requireRole("owner");

 db.exec(`
  CREATE TABLE IF NOT EXISTS customer_app_state(
   id INTEGER PRIMARY KEY CHECK(id=1),
   online_ordering_enabled INTEGER NOT NULL DEFAULT 0,
   cloud_status TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
   sync_status TEXT NOT NULL DEFAULT 'LOCAL_ONLY',
   last_sync_at TEXT,
   draft_changes INTEGER NOT NULL DEFAULT 0,
   published_version INTEGER NOT NULL DEFAULT 0,
   updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  INSERT OR IGNORE INTO customer_app_state(id)
  VALUES(1);
 `);

 function stateRow(){
  const row=db.prepare(`
   SELECT
    online_ordering_enabled,
    cloud_status,
    sync_status,
    last_sync_at,
    draft_changes,
    published_version,
    updated_at
   FROM customer_app_state
   WHERE id=1
  `).get();

  return {
   onlineOrderingEnabled:Boolean(row?.online_ordering_enabled),
   cloudStatus:String(row?.cloud_status||"NOT_CONFIGURED"),
   syncStatus:String(row?.sync_status||"LOCAL_ONLY"),
   lastSyncAt:row?.last_sync_at||null,
   draftChanges:Number(row?.draft_changes||0),
   publishedVersion:Number(row?.published_version||0),
   updatedAt:row?.updated_at||null
  };
 }

 app.get("/api/customer-app/state",ownerOnly,(req,res)=>{
  res.json(stateRow());
 });

 app.put("/api/customer-app/online-ordering",ownerOnly,(req,res)=>{
  const enabled=req.body?.enabled;
  if(typeof enabled!=="boolean"){
   return res.status(400).json({error:"enabled must be true or false."});
  }

  if(enabled){
   const current=stateRow();
   if(current.cloudStatus!=="CONNECTED"){
    return res.status(409).json({
     error:"Online ordering cannot be enabled until the cloud connection is configured and connected."
    });
   }
   if(current.syncStatus!=="SYNCED"){
    return res.status(409).json({
     error:"Online ordering cannot be enabled until customer app data is fully synced."
    });
   }
   if(current.draftChanges>0){
    return res.status(409).json({
     error:"Publish pending customer app changes before enabling online ordering."
    });
   }
  }

  db.prepare(`
   UPDATE customer_app_state
   SET online_ordering_enabled=?,updated_at=CURRENT_TIMESTAMP
   WHERE id=1
  `).run(enabled?1:0);

  const state=stateRow();
  io.emit("customer-app-state-changed",state);
  res.json(state);
 });
};
