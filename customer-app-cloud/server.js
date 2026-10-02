const express=require("express");
const crypto=require("crypto");

const app=express();
const registerPublishRoute=require("./publish-route");
const cloudDb=require("./database");
app.use(express.json({limit:"256kb"}));

const configuredPort=Number(process.env.PORT||8080);
const PORT=Number.isInteger(configuredPort)&&configuredPort>0&&configuredPort<=65535
 ?configuredPort
 :8080;

const SYNC_TOKEN=String(process.env.MRK_POS_SYNC_TOKEN||"").trim();
let lastPosHeartbeat=null;

function safeEqual(a,b){
 const left=Buffer.from(String(a||""));
 const right=Buffer.from(String(b||""));
 if(left.length!==right.length)return false;
 return crypto.timingSafeEqual(left,right);
}

function requirePosToken(req,res,next){
 if(!SYNC_TOKEN){
  return res.status(503).json({error:"POS sync token is not configured on the cloud service."});
 }
 const auth=String(req.headers.authorization||"");
 const supplied=auth.startsWith("Bearer ")?auth.slice(7).trim():"";
 if(!supplied||!safeEqual(supplied,SYNC_TOKEN)){
  return res.status(401).json({error:"Invalid POS sync credentials."});
 }
 next();
}

app.get("/health",(req,res)=>{
 res.json({
  service:"Mr K Customer App Cloud",
  status:"online",
  version:"0.1.0",
  posHeartbeat:lastPosHeartbeat
 });
});

app.post("/api/pos/heartbeat",requirePosToken,(req,res)=>{
 const restaurantId=String(req.body?.restaurantId||"mr-k-bamako").trim()||"mr-k-bamako";
 const posVersion=String(req.body?.posVersion||"").trim();

 lastPosHeartbeat={
  restaurantId,
  posVersion,
  receivedAt:new Date().toISOString()
 };

 res.json({
  ok:true,
  cloudTime:new Date().toISOString(),
  restaurantId
 });
});

registerPublishRoute(app,requirePosToken,cloudDb);

cloudDb.init()
 .then(()=>{
  app.listen(PORT,"0.0.0.0",()=>{
   console.log(`Mr K Customer App Cloud foundation listening on port ${PORT}`);
  });
 })
 .catch(error=>{
  console.error("Customer App cloud database initialization failed:",error);
  process.exit(1);
 });
