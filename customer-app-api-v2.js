const https=require("https");
const http=require("http");
const createSecurityAuthV2=require("./security-auth-v2");

module.exports=function registerCustomerAppV2(app,io,db){
 const ownerOnly=createSecurityAuthV2().requireRole("owner");

 function tableExists(name){
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(String(name||"")));
 }

 function columnExists(table,name){
  if(!tableExists(table))return false;
  return db.prepare("PRAGMA table_info("+table+")").all().some(column=>column.name===name);
 }

 function safeJson(value,fallback=null){
  if(value===null||value===undefined||value==="")return fallback;
  try{return typeof value==="string"?JSON.parse(value):value;}
  catch{return fallback;}
 }

 function buildCustomerAppSnapshot(){
  const hasCategoryType=columnExists("menu_categories","category_type");
  const hasShowOnMenu=columnExists("menu_items","show_on_menu");
  const hasIngredientQuantity=columnExists("menu_item_ingredients","quantity");

  const categories=db.prepare(`
   SELECT id,name,icon,active,sort_order${hasCategoryType?",category_type":""}
   FROM menu_categories
   ORDER BY sort_order ASC,name ASC
  `).all().map(row=>({
   id:String(row.id),
   name:String(row.name||""),
   icon:String(row.icon||""),
   active:Boolean(row.active),
   sortOrder:Number(row.sort_order||0),
   categoryType:hasCategoryType?String(row.category_type||"item"):"item"
  }));

  const ingredients=db.prepare(`
   SELECT id,name,active
   FROM menu_ingredients
   ORDER BY name ASC
  `).all().map(row=>({
   id:String(row.id),
   name:String(row.name||""),
   active:Boolean(row.active)
  }));

  const itemIngredients=db.prepare(`
   SELECT menu_item_id,ingredient_id,removable,sort_order${hasIngredientQuantity?",quantity":""}
   FROM menu_item_ingredients
   ORDER BY menu_item_id ASC,sort_order ASC
  `).all();

  const itemExtras=db.prepare(`
   SELECT menu_item_id,extra_item_id
   FROM menu_item_extras
   ORDER BY menu_item_id ASC,extra_item_id ASC
  `).all();

  const items=db.prepare(`
   SELECT id,name,category_id,price,active,sort_order${hasShowOnMenu?",show_on_menu":""}
   FROM menu_items
   ORDER BY category_id ASC,sort_order ASC,name ASC
  `).all().map(row=>({
   id:String(row.id),
   name:String(row.name||""),
   categoryId:String(row.category_id||""),
   price:Number(row.price||0),
   active:Boolean(row.active),
   showOnMenu:hasShowOnMenu?Boolean(row.show_on_menu):true,
   sortOrder:Number(row.sort_order||0),
   ingredients:itemIngredients
    .filter(link=>String(link.menu_item_id)===String(row.id))
    .map(link=>({
     ingredientId:String(link.ingredient_id),
     removable:Boolean(link.removable),
     quantity:hasIngredientQuantity?Number(link.quantity||1):1,
     sortOrder:Number(link.sort_order||0)
    })),
   extras:itemExtras
    .filter(link=>String(link.menu_item_id)===String(row.id))
    .map(link=>String(link.extra_item_id))
  }));

  let combos=[];
  if(tableExists("menu_combos")){
   const components=tableExists("menu_combo_components")
    ?db.prepare(`
      SELECT combo_id,menu_item_id,quantity,sort_order
      FROM menu_combo_components
      ORDER BY combo_id ASC,sort_order ASC
     `).all()
    :[];

   combos=db.prepare(`
    SELECT id,name,description,category_id,price,active,sort_order
    FROM menu_combos
    ORDER BY category_id ASC,sort_order ASC,name ASC
   `).all().map(row=>({
    id:String(row.id),
    name:String(row.name||""),
    description:String(row.description||""),
    categoryId:String(row.category_id||""),
    price:Number(row.price||0),
    active:Boolean(row.active),
    sortOrder:Number(row.sort_order||0),
    components:components
     .filter(component=>String(component.combo_id)===String(row.id))
     .map(component=>({
      menuItemId:String(component.menu_item_id),
      quantity:Number(component.quantity||1),
      sortOrder:Number(component.sort_order||0)
     }))
   }));
  }

  let deliveryZones=[];
  if(tableExists("delivery_zones")){
   deliveryZones=db.prepare(`
    SELECT id,name,fee,active,sort_order,boundary_json
    FROM delivery_zones
    ORDER BY sort_order ASC,name ASC
   `).all().map(row=>({
    id:String(row.id),
    name:String(row.name||""),
    fee:Number(row.fee||0),
    active:Boolean(row.active),
    sortOrder:Number(row.sort_order||0),
    boundary:safeJson(row.boundary_json,null)
   }));
  }

  const settings=db.prepare(`
   SELECT restaurant_name,restaurant_status
   FROM system_settings
   WHERE id=1
  `).get()||{};

  return {
   schemaVersion:1,
   preparedAt:new Date().toISOString(),
   restaurant:{
    id:String(process.env.MRK_RESTAURANT_ID||"mr-k-bamako").trim()||"mr-k-bamako",
    name:String(settings.restaurant_name||"Mr K Burgers"),
    status:String(settings.restaurant_status||"OPEN")
   },
   menu:{
    categories,
    ingredients,
    items,
    combos
   },
   deliveryZones
  };
 }

 async function publishToCloud(version,draftCount,snapshot){
  const cloudUrl=String(process.env.MRK_CUSTOMER_APP_CLOUD_URL||"").trim().replace(/\/+$/,"");
  const token=String(process.env.MRK_POS_SYNC_TOKEN||"").trim();
  const restaurantId=String(process.env.MRK_RESTAURANT_ID||"mr-k-bamako").trim()||"mr-k-bamako";

  if(!cloudUrl||!token){
   throw new Error("Customer App cloud connection is not configured.");
  }

  const target=new URL(cloudUrl+"/api/pos/publication");
  const body=JSON.stringify({restaurantId,version,draftCount,snapshot});
  const transport=target.protocol==="https:"?https:http;

  return await new Promise((resolve,reject)=>{
   const req=transport.request({
    protocol:target.protocol,
    hostname:target.hostname,
    port:target.port||undefined,
    path:target.pathname+target.search,
    method:"POST",
    headers:{
     "Content-Type":"application/json",
     "Content-Length":Buffer.byteLength(body),
     "Authorization":"Bearer "+token
    },
    timeout:8000
   },response=>{
    let responseBody="";
    response.setEncoding("utf8");
    response.on("data",chunk=>{responseBody+=chunk;});
    response.on("end",()=>{
     let parsed={};
     try{parsed=responseBody?JSON.parse(responseBody):{};}catch{}
     if(response.statusCode>=200&&response.statusCode<300){
      return resolve(parsed);
     }
     reject(new Error(parsed.error||("Cloud publish failed with HTTP "+response.statusCode)));
    });
   });

   req.on("timeout",()=>req.destroy(new Error("Cloud publish timed out.")));
   req.on("error",reject);
   req.write(body);
   req.end();
  });
 }

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

  const snapshot=buildCustomerAppSnapshot();

  db.prepare("DELETE FROM customer_app_drafts WHERE kind='POS_SNAPSHOT'").run();
  db.prepare(`
   INSERT INTO customer_app_drafts(kind,label,payload_json)
   VALUES('POS_SNAPSHOT',?,?)
  `).run(
   "Current POS customer app snapshot",
   JSON.stringify(snapshot)
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

 app.post("/api/customer-app/publish",ownerOnly,async(req,res)=>{
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
  const snapshotDraft=db.prepare(`
   SELECT payload_json
   FROM customer_app_drafts
   WHERE kind='POS_SNAPSHOT'
   ORDER BY id DESC
   LIMIT 1
  `).get();

  if(!snapshotDraft){
   return res.status(409).json({error:"Prepare a current POS snapshot before publishing."});
  }

  const snapshot=safeJson(snapshotDraft.payload_json,null);
  if(!snapshot){
   return res.status(500).json({error:"The prepared Customer App snapshot is invalid."});
  }

  try{
   const cloud=await publishToCloud(nextVersion,current.draftChanges,snapshot);

   db.transaction(()=>{
    db.prepare("DELETE FROM customer_app_drafts").run();
    db.prepare(`
     UPDATE customer_app_state
     SET draft_changes=0,published_version=?,last_sync_at=?,updated_at=CURRENT_TIMESTAMP
     WHERE id=1
    `).run(nextVersion,cloud.publishedAt||new Date().toISOString());
   })();

   const state=stateRow();
   io.emit("customer-app-state-changed",state);
   res.json({...state,published:true,cloud});
  }catch(error){
   console.error("Customer App publish failed:",error.message);
   res.status(502).json({error:error.message||"Cloud publish failed."});
  }
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
