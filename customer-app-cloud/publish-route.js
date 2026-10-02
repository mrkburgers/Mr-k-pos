module.exports=function registerPublishRoute(app,requirePosToken){
 let latestPublication=null;

 app.get("/api/pos/publication",requirePosToken,(req,res)=>{
  res.json({latestPublication});
 });

 app.get("/api/public/catalog",(req,res)=>{
  if(!latestPublication){
   return res.status(503).json({error:"Customer App catalog has not been published yet."});
  }

  res.json({
   version:latestPublication.version,
   publishedAt:latestPublication.publishedAt,
   restaurant:latestPublication.snapshot.restaurant,
   menu:latestPublication.snapshot.menu,
   deliveryZones:latestPublication.snapshot.deliveryZones
  });
 });

 app.post("/api/pos/publication",requirePosToken,(req,res)=>{
  const restaurantId=String(req.body?.restaurantId||"mr-k-bamako").trim()||"mr-k-bamako";
  const version=Number(req.body?.version);
  const draftCount=Number(req.body?.draftCount||0);
  const snapshot=req.body?.snapshot&&typeof req.body.snapshot==="object"
   ?req.body.snapshot
   :null;

  if(!Number.isInteger(version)||version<1){
   return res.status(400).json({error:"A positive publication version is required."});
  }
  if(!snapshot){
   return res.status(400).json({error:"A Customer App snapshot payload is required."});
  }
  if(Number(snapshot?.schemaVersion)!==1){
   return res.status(400).json({error:"Unsupported Customer App snapshot schema version."});
  }
  if(!snapshot?.restaurant||!snapshot?.menu||!Array.isArray(snapshot?.deliveryZones)){
   return res.status(400).json({error:"Customer App snapshot is incomplete."});
  }

  if(latestPublication&&version<latestPublication.version){
   return res.status(409).json({error:"Publication version is older than the cloud version."});
  }

  if(!latestPublication||version>latestPublication.version){
   latestPublication={
    restaurantId,
    version,
    draftCount,
    snapshot,
    publishedAt:new Date().toISOString()
   };
  }

  res.json({
   ok:true,
   restaurantId:latestPublication.restaurantId,
   version:latestPublication.version,
   draftCount:latestPublication.draftCount,
   publishedAt:latestPublication.publishedAt,
   counts:{
    categories:Array.isArray(latestPublication.snapshot?.menu?.categories)?latestPublication.snapshot.menu.categories.length:0,
    items:Array.isArray(latestPublication.snapshot?.menu?.items)?latestPublication.snapshot.menu.items.length:0,
    combos:Array.isArray(latestPublication.snapshot?.menu?.combos)?latestPublication.snapshot.menu.combos.length:0,
    deliveryZones:Array.isArray(latestPublication.snapshot?.deliveryZones)?latestPublication.snapshot.deliveryZones.length:0
   }
  });
 });
};