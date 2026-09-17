const crypto=require("crypto");

const COOKIE_NAME="mrk_pos_session";
const SESSION_TTL_MS=12*60*60*1000;

module.exports=function createSecurityAuthV2(){
 const sessions=new Map();

 function removeExpiredSessions(){
  const now=Date.now();
  for(const [token,session] of sessions.entries()){
   if(!session||Number(session.expires_at)<=now){
    sessions.delete(token);
   }
  }
 }

 function parseCookies(req){
  const header=String(req?.headers?.cookie||"");
  const cookies={};
  header.split(";").forEach(part=>{
   const separator=part.indexOf("=");
   if(separator<0)return;
   const key=part.slice(0,separator).trim();
   const value=part.slice(separator+1).trim();
   if(!key)return;
   cookies[key]=decodeURIComponent(value);
  });
  return cookies;
 }

 function createSession(res,account){
  removeExpiredSessions();
  const token=crypto.randomBytes(32).toString("hex");
  sessions.set(token,{
   staff_account_id:Number(account?.id),
   staff_id:String(account?.staff_id||""),
   name:String(account?.name||""),
   role:String(account?.role||""),
   expires_at:Date.now()+SESSION_TTL_MS
  });
  const maxAge=Math.floor(SESSION_TTL_MS/1000);
  res.append(
   "Set-Cookie",
   `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`
  );
  return token;
 }

 function getSession(req){
  removeExpiredSessions();
  const token=parseCookies(req)[COOKIE_NAME];
  if(!token)return null;
  const session=sessions.get(token)||null;
  if(!session)return null;
  return {...session};
 }

 function clearSession(req,res){
  const token=parseCookies(req)[COOKIE_NAME];
  if(token)sessions.delete(token);
  res.append(
   "Set-Cookie",
   `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
  );
 }

 function requireAuth(req,res,next){
  const session=getSession(req);
  if(!session){
   return res.status(401).json({error:"Authentication required."});
  }
  req.v2Session=session;
  next();
 }

 function requireRole(...allowedRoles){
  const allowed=new Set(allowedRoles.map(role=>String(role)));
  return function v2RequireRole(req,res,next){
   const session=getSession(req);
   if(!session){
    return res.status(401).json({error:"Authentication required."});
   }
   if(!allowed.has(session.role)){
    return res.status(403).json({error:"You do not have permission to perform this action."});
   }
   req.v2Session=session;
   next();
  };
 }

 return {
  createSession,
  getSession,
  clearSession,
  requireAuth,
  requireRole
 };
};
