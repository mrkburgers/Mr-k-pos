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

  CREATE TABLE IF NOT EXISTS customer_app_drafts(
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   kind TEXT NOT NULL,
   label TEXT NOT NULL,
   payload_json TEXT NOT NULL DEFAULT '{}',
   created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
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
  const state=stateRow();
  const drafts=db.prepare(`
   SELECT id,kind,label,payload_json,created_at
   FROM customer_app_drafts
   ORDER BY id ASC
  `).all().map(row=>({
   id:Number(row.id),
   kind:String(row.kind||""),
   label:String(row.label||""),
   payload:JSON.parse(row.payload_json||"{}"),
   createdAt:row.created_at
  }));
  res.json({...state,drafts});
 });

 app.post("/api/customer-app/drafts/prepare-snapshot",ownerOnly,(req,res)=>{
  const current=stateRow();
  if(current.onlineOrderingEnabled){
   return res.status(409).json({error:"Turn online ordering OFF before preparing customer app changes."});
  }

  const menuCounts=db.prepare(`
   SELECT
    (SELECT COUNT(*) FROM menu_categories WHERE active=1) AS categories,
    (SELECT COUNT(*) FROM menu_items WHERE active=1) AS items
  `).get();

  db.prepare("DELETE FROM customer_app_drafts WHERE kind='POS_SNAPSHOT'").run();
  db.prepare(`
   INSERT INTO customer_app_drafts(kind,label,payload_json)
   VALUES('POS_SNAPSHOT',?,?)
  `).run(
   "Current POS menu/settings snapshot",
   JSON.stringify({
    categories:Number(menuCounts?.categories||0),
    items:Number(menuCounts?.items||0),
    preparedAt:new Date().toISOString()
   })
  );

  const count=Number(db.prepare("SELECT COUNT(*) AS count FROM customer_app_drafts").get()?.count||0);
  db.prepare(`
   UPDATE customer_app_state
   SET draft_changes=?,updated_at=CURRENT_TIMESTAMP
   WHERE id=1
  `).run(count);

  io.emit("customer-app-state-changed",stateRow());
  res.json({ok:true,draftChanges:count});
 });

 app.delete("/api/customer-app/drafts",ownerOnly,(req,res)=>{
  const current=stateRow();
  if(current.onlineOrderingEnabled){
   return res.status(409).json({error:"Turn online ordering OFF before discarding customer app changes."});
  }

  db.prepare("DELETE FROM customer_app_drafts").run();
  db.prepare(`
   UPDATE customer_app_state
   SET draft_changes=0,updated_at=CURRENT_TIMESTAMP
   WHERE id=1
  `).run();

  io.emit("customer-app-state-changed",stateRow());
  res.json({ok:true});
 });

 app.post("/api/customer-app/publish",ownerOnly,(req,res)=>{
  const current=stateRow();
  if(current.onlineOrderingEnabled){
   return res.status(409).json({error:"Turn online ordering OFF before publishing customer app changes."});
  }
  if(current.cloudStatus!=="CONNECTED"||current.syncStatus!=="SYNCED"){
   return res.status(409).json({error:"Customer App cloud must be connected and synced before publishing."});
  }
  if(current.draftChanges<1){
   return res.status(409).json({error:"There are no draft changes to publish."});
  }

  const nextVersion=current.publishedVersion+1;
  db.transaction(()=>{
   db.prepare("DELETE FROM customer_app_drafts").run();
   db.prepare(`
    UPDATE customer_app_state
    SET draft_changes=0,published_version=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=1
   `).run(nextVersion);
  })();

  const state=stateRow();
  io.emit("customer-app-state-changed",state);
  res.json({...state,published:true});
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
