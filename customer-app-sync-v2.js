const https=require("https");
const http=require("http");

module.exports=function startCustomerAppSyncV2(io,db){
 const cloudUrl=String(process.env.MRK_CUSTOMER_APP_CLOUD_URL||"").trim().replace(/\/+$/,"");
 const syncToken=String(process.env.MRK_POS_SYNC_TOKEN||"").trim();
 const restaurantId=String(process.env.MRK_RESTAURANT_ID||"mr-k-bamako").trim()||"mr-k-bamako";
 const intervalMs=30000;

 function updateState(cloudStatus,syncStatus,lastSyncAt=null){
  db.prepare(`
   UPDATE customer_app_state
   SET cloud_status=?,sync_status=?,last_sync_at=?,updated_at=CURRENT_TIMESTAMP
   WHERE id=1
  `).run(cloudStatus,syncStatus,lastSyncAt);
  io.emit("customer-app-state-changed",{
   cloudStatus,
   syncStatus,
   lastSyncAt
  });
 }

 if(!cloudUrl||!syncToken){
  updateState("NOT_CONFIGURED","LOCAL_ONLY",null);
  return {configured:false};
 }

 async function heartbeat(){
  try{
   const target=new URL(cloudUrl+"/api/pos/heartbeat");
   const payload=JSON.stringify({
    restaurantId,
    posVersion:"2.1-development"
   });
   const transport=target.protocol==="https:"?https:http;

   await new Promise((resolve,reject)=>{
    const req=transport.request({
     protocol:target.protocol,
     hostname:target.hostname,
     port:target.port||undefined,
     path:target.pathname+target.search,
     method:"POST",
     headers:{
      "Content-Type":"application/json",
      "Content-Length":Buffer.byteLength(payload),
      "Authorization":"Bearer "+syncToken
     },
     timeout:8000
    },res=>{
     let body="";
     res.setEncoding("utf8");
     res.on("data",chunk=>{body+=chunk;});
     res.on("end",()=>{
      if(res.statusCode>=200&&res.statusCode<300)return resolve();
      reject(new Error("Cloud heartbeat failed with HTTP "+res.statusCode+(body?": "+body.slice(0,160):"")));
     });
    });

    req.on("timeout",()=>req.destroy(new Error("Cloud heartbeat timed out.")));
    req.on("error",reject);
    req.write(payload);
    req.end();
   });

   const now=new Date().toISOString();
   updateState("CONNECTED","SYNCED",now);
  }catch(error){
   console.error("Customer App cloud heartbeat failed:",error.message);
   updateState("DISCONNECTED","SYNC_ERROR",null);
  }
 }

 heartbeat();
 const timer=setInterval(heartbeat,intervalMs);
 if(typeof timer.unref==="function")timer.unref();

 return {configured:true,heartbeat};
};
