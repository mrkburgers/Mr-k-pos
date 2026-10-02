module.exports=function registerPublishRoute(app,requirePosToken,cloudDb){
 const restaurantIdDefault="mr-k-bamako";

 function counts(snapshot){
  return {
   categories:Array.isArray(snapshot?.menu?.categories)?snapshot.menu.categories.length:0,
   items:Array.isArray(snapshot?.menu?.items)?snapshot.menu.items.length:0,
   combos:Array.isArray(snapshot?.menu?.combos)?snapshot.menu.combos.length:0,
   deliveryZones:Array.isArray(snapshot?.deliveryZones)?snapshot.deliveryZones.length:0
  };
 }

 app.get("/api/pos/publication",requirePosToken,async(req,res)=>{
  try{
   const restaurantId=String(req.query?.restaurantId||restaurantIdDefault).trim()||restaurantIdDefault;
   const latestPublication=await cloudDb.getLatestPublication(restaurantId);
   res.json({latestPublication});
  }catch(error){
   console.error("Unable to read latest publication:",error);
   res.status(500).json({error:"Unable to read latest publication."});
  }
 });

 app.get("/api/public/catalog",async(req,res)=>{
  try{
   const restaurantId=String(req.query?.restaurantId||restaurantIdDefault).trim()||restaurantIdDefault;
   const latestPublication=await cloudDb.getLatestPublication(restaurantId);

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
  }catch(error){
   console.error("Unable to load public catalog:",error);
   res.status(500).json({error:"Unable to load Customer App catalog."});
  }
 });

 app.post("/api/pos/publication",requirePosToken,async(req,res)=>{
  const restaurantId=String(req.body?.restaurantId||restaurantIdDefault).trim()||restaurantIdDefault;
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

  try{
   const current=await cloudDb.getLatestPublication(restaurantId);
   if(current&&version<current.version){
    return res.status(409).json({error:"Publication version is older than the cloud version."});
   }

   const publication=await cloudDb.savePublication({
    restaurantId,
    version,
    draftCount,
    snapshot
   });

   res.json({
    ok:true,
    restaurantId:publication.restaurantId,
    version:publication.version,
    draftCount:publication.draftCount,
    publishedAt:publication.publishedAt,
    counts:counts(publication.snapshot)
   });
  }catch(error){
   console.error("Unable to persist publication:",error);
   res.status(500).json({error:"Unable to persist Customer App publication."});
  }
 });
};
