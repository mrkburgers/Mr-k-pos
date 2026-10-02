const crypto=require("crypto");

function registerCustomerAuthRoutes(app,customerDb){
 const TEST_MODE=String(process.env.MRK_CUSTOMER_OTP_TEST_MODE||"false").toLowerCase()==="true";
 const OTP_TTL_MINUTES=5;
 const OTP_MAX_ATTEMPTS=5;
 const OTP_REQUEST_WINDOW_MINUTES=10;
 const OTP_REQUEST_LIMIT=3;
 const SESSION_DAYS=30;

 function normalizeMaliPhone(input){
  let value=String(input||"").trim().replace(/[\s().-]/g,"");
  if(value.startsWith("00"))value="+"+value.slice(2);
  if(/^\d{8}$/.test(value))value="+223"+value;
  if(/^223\d{8}$/.test(value))value="+"+value;
  if(!/^\+223\d{8}$/.test(value))return null;
  return value;
 }

 function hashWithSalt(value,salt){
  return crypto.scryptSync(String(value),String(salt),32).toString("hex");
 }

 function safeEqualHex(a,b){
  try{
   const left=Buffer.from(String(a||""),"hex");
   const right=Buffer.from(String(b||""),"hex");
   if(!left.length||left.length!==right.length)return false;
   return crypto.timingSafeEqual(left,right);
  }catch{
   return false;
  }
 }

 function generateOtp(){
  return String(crypto.randomInt(100000,1000000));
 }

 function generateSessionToken(){
  return crypto.randomBytes(32).toString("base64url");
 }

 function hashSessionToken(token){
  return crypto.createHash("sha256").update(String(token)).digest("hex");
 }

 app.post("/api/customer/auth/request-otp",async(req,res)=>{
  const phoneE164=normalizeMaliPhone(req.body?.phone);
  if(!phoneE164){
   return res.status(400).json({
    error:"Numéro de téléphone invalide. Utilisez un numéro malien à 8 chiffres."
   });
  }

  try{
   const recent=await customerDb.countRecentOtpRequests(phoneE164,OTP_REQUEST_WINDOW_MINUTES);
   if(recent>=OTP_REQUEST_LIMIT){
    return res.status(429).json({
     error:"Trop de demandes de code. Veuillez réessayer dans quelques minutes."
    });
   }

   const code=generateOtp();
   const salt=crypto.randomBytes(16).toString("hex");
   const codeHash=hashWithSalt(code,salt);
   const expiresAt=new Date(Date.now()+OTP_TTL_MINUTES*60*1000).toISOString();

   const challenge=await customerDb.createOtpChallenge({
    phoneE164,
    codeHash,
    codeSalt:salt,
    expiresAt,
    maxAttempts:OTP_MAX_ATTEMPTS
   });

   const response={
    ok:true,
    challengeId:challenge.id,
    phone:phoneE164,
    expiresInSeconds:OTP_TTL_MINUTES*60,
    message:TEST_MODE
     ?"Code de test généré."
     :"Un code de vérification va être envoyé par SMS."
   };

   if(TEST_MODE){
    response.testCode=code;
   }

   res.json(response);
  }catch(error){
   console.error("Customer OTP request failed:",error);
   res.status(500).json({error:"Impossible de générer le code de vérification."});
  }
 });

 app.post("/api/customer/auth/verify-otp",async(req,res)=>{
  const phoneE164=normalizeMaliPhone(req.body?.phone);
  const challengeId=String(req.body?.challengeId||"").trim();
  const code=String(req.body?.code||"").trim();

  if(!phoneE164||!challengeId||!/^[0-9]{6}$/.test(code)){
   return res.status(400).json({error:"Informations de vérification invalides."});
  }

  try{
   const challenge=await customerDb.getOtpChallenge(challengeId,phoneE164);
   if(!challenge){
    return res.status(404).json({error:"Code de vérification introuvable."});
   }
   if(challenge.consumed_at){
    return res.status(409).json({error:"Ce code a déjà été utilisé."});
   }
   if(new Date(challenge.expires_at).getTime()<=Date.now()){
    return res.status(410).json({error:"Ce code a expiré. Demandez un nouveau code."});
   }
   if(Number(challenge.attempts)>=Number(challenge.max_attempts)){
    return res.status(429).json({error:"Trop de tentatives. Demandez un nouveau code."});
   }

   const candidateHash=hashWithSalt(code,challenge.code_salt);
   if(!safeEqualHex(candidateHash,challenge.code_hash)){
    await customerDb.incrementOtpAttempts(challenge.id);
    return res.status(401).json({error:"Code incorrect."});
   }

   await customerDb.consumeOtpChallenge(challenge.id);
   const customer=await customerDb.getOrCreateCustomer(phoneE164);

   const sessionToken=generateSessionToken();
   const tokenHash=hashSessionToken(sessionToken);
   const expiresAt=new Date(Date.now()+SESSION_DAYS*24*60*60*1000).toISOString();
   const session=await customerDb.createSession(customer.id,{tokenHash,expiresAt});

   res.json({
    ok:true,
    customer:{
     id:customer.id,
     phone:customer.phone_e164,
     name:customer.name||""
    },
    session:{
     token:sessionToken,
     id:session.id,
     expiresAt:session.expiresAt
    }
   });
  }catch(error){
   console.error("Customer OTP verification failed:",error);
   res.status(500).json({error:"Impossible de vérifier le code."});
  }
 });
}

module.exports=registerCustomerAuthRoutes;
