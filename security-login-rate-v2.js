const WINDOW_MS=10*60*1000;
const STAFF_LIMIT=5;
const IP_LIMIT=10;

const staffFailures=new Map();
const ipFailures=new Map();

function cleanExpired(store){
 const now=Date.now();
 for(const [key,entry] of store.entries()){
  if(!entry||Number(entry.window_start)+WINDOW_MS<=now){
   store.delete(key);
  }
 }
}

function normalizeStaffId(value){
 return String(value||"").trim().toLowerCase();
}

function requestIp(req){
 return String(req?.ip||req?.socket?.remoteAddress||"unknown");
}

function getEntry(store,key){
 cleanExpired(store);
 const current=store.get(key);
 if(current)return current;
 const entry={count:0,window_start:Date.now()};
 store.set(key,entry);
 return entry;
}

function isLimited(req,staffId){
 const staffKey=normalizeStaffId(staffId);
 const ipKey=requestIp(req);
 const staffEntry=staffKey?getEntry(staffFailures,staffKey):null;
 const ipEntry=getEntry(ipFailures,ipKey);
 return Boolean(
  (staffEntry&&staffEntry.count>=STAFF_LIMIT)||
  ipEntry.count>=IP_LIMIT
 );
}

function recordFailure(req,staffId){
 const staffKey=normalizeStaffId(staffId);
 const ipKey=requestIp(req);
 if(staffKey){
  getEntry(staffFailures,staffKey).count+=1;
 }
 getEntry(ipFailures,ipKey).count+=1;
}

function clearSuccess(req,staffId){
 const staffKey=normalizeStaffId(staffId);
 const ipKey=requestIp(req);
 if(staffKey)staffFailures.delete(staffKey);
 ipFailures.delete(ipKey);
}

module.exports={
 isLimited,
 recordFailure,
 clearSuccess,
 WINDOW_MS,
 STAFF_LIMIT,
 IP_LIMIT
};
