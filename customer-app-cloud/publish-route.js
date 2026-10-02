module.exports=function registerPublishRoute(app,requirePosToken){
 let latestPublication=null;

 app.get("/api/pos/publication",requirePosToken,(req,res)=>{
  res.json({latestPublication});
 });

 app.post("/api/pos/publication",requirePosToken,(req,res)=>{
  const restaurantId=String(req.body?.restaurantId||"mr-k-bamako").trim()||"mr-k-bamako";
  const version=Number(req.body?.version);
  const draftCount=Number(req.body?.draftCount||0);

  if(!Number.isInteger(version)||version<1){
   return res.status(400).json({error:"A positive publication version is required."});
  }

  if(latestPublication&&version<latestPublication.version){
   return res.status(409).json({error:"Publication version is older than the cloud version."});
  }

  if(!latestPublication||version>latestPublication.version){
   latestPublication={
    restaurantId,
    version,
    draftCount,
    publishedAt:new Date().toISOString()
   };
  }

  res.json({ok:true,...latestPublication});
 });
};