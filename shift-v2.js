let v2ShiftSyncTimer=null;
let v2ShiftHydrating=false;

function v2ReadShiftLocal(key,fallback){
 try{
  const raw=localStorage.getItem(key);
  return raw===null?fallback:JSON.parse(raw);
 }catch{
  return fallback;
 }
}

function v2CurrentShiftPayload(){
 return {
  active:v2ReadShiftLocal("mrkActiveShift",null),
  history:v2ReadShiftLocal("mrkShiftHistory",[])
 };
}

async function v2PushShiftState(){
 if(v2ShiftHydrating)return;
 try{
  const