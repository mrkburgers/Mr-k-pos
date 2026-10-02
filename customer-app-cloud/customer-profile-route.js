const crypto=require("crypto");

function registerCustomerProfileRoutes(app,customerDb){
 function hashSessionToken(token){
  return crypto.createHash("sha256").update(String(token)).digest("hex");
 }

 async function requireCustomer(req,res,next){
  try{
   const auth=String(req.headers.authorization||"");
   const token=auth.startsWith("Bearer ")?auth.slice(7).trim():"";
   if(!token){
    return res.status(401).json({error:"Connexion requise."});
   }

   const customer=await customerDb.getCustomerBySessionTokenHash(hashSessionToken(token));
   if(!customer){
    return res.status(401).json({error:"Session invalide ou expirée."});
   }

   req.customer=customer;
   next();
  }catch(error){
   console.error("Customer session validation failed:",error);
   res.status(500).json({error:"Impossible de vérifier la session."});
  }
 }

 function cleanText(value,max){
  return String(value??"").trim().slice(0,max);
 }

 function parseCoordinate(value,min,max){
  if(value===null||value===undefined||value==="")return null;
  const number=Number(value);
  if(!Number.isFinite(number)||number<min||number>max)return NaN;
  return number;
 }

 app.get("/api/customer/profile",requireCustomer,async(req,res)=>{
  try{
   const addresses=await customerDb.listAddresses(req.customer.id);
   res.json({
    customer:{
     id:req.customer.id,
     phone:req.customer.phone_e164,
     name:req.customer.name||""
    },
    addresses
   });
  }catch(error){
   console.error("Customer profile read failed:",error);
   res.status(500).json({error:"Impossible de charger le profil."});
  }
 });

 app.patch("/api/customer/profile",requireCustomer,async(req,res)=>{
  const name=cleanText(req.body?.name,120);
  if(!name){
   return res.status(400).json({error:"Le nom est requis."});
  }
  try{
   const customer=await customerDb.updateCustomerName(req.customer.id,name);
   res.json({
    ok:true,
    customer:{
     id:customer.id,
     phone:customer.phone_e164,
     name:customer.name
    }
   });
  }catch(error){
   console.error("Customer profile update failed:",error);
   res.status(500).json({error:"Impossible de modifier le profil."});
  }
 });

 app.get("/api/customer/addresses",requireCustomer,async(req,res)=>{
  try{
   res.json({addresses:await customerDb.listAddresses(req.customer.id)});
  }catch(error){
   console.error("Customer address list failed:",error);
   res.status(500).json({error:"Impossible de charger les adresses."});
  }
 });

 app.post("/api/customer/addresses",requireCustomer,async(req,res)=>{
  const label=cleanText(req.body?.label,50);
  const addressText=cleanText(req.body?.addressText,250);
  const latitude=parseCoordinate(req.body?.latitude,-90,90);
  const longitude=parseCoordinate(req.body?.longitude,-180,180);

  if(!label||!addressText){
   return res.status(400).json({error:"Le nom et l’adresse sont requis."});
  }
  if(Number.isNaN(latitude)||Number.isNaN(longitude)){
   return res.status(400).json({error:"Coordonnées GPS invalides."});
  }

  try{
   const address=await customerDb.addAddress(req.customer.id,{
    label,
    addressText,
    latitude,
    longitude,
    isDefault:Boolean(req.body?.isDefault)
   });
   res.status(201).json({ok:true,address});
  }catch(error){
   console.error("Customer address create failed:",error);
   res.status(500).json({error:"Impossible d’ajouter l’adresse."});
  }
 });

 app.patch("/api/customer/addresses/:addressId",requireCustomer,async(req,res)=>{
  const label=cleanText(req.body?.label,50);
  const addressText=cleanText(req.body?.addressText,250);
  const latitude=parseCoordinate(req.body?.latitude,-90,90);
  const longitude=parseCoordinate(req.body?.longitude,-180,180);

  if(!label||!addressText){
   return res.status(400).json({error:"Le nom et l’adresse sont requis."});
  }
  if(Number.isNaN(latitude)||Number.isNaN(longitude)){
   return res.status(400).json({error:"Coordonnées GPS invalides."});
  }

  try{
   const address=await customerDb.updateAddress(req.customer.id,req.params.addressId,{
    label,
    addressText,
    latitude,
    longitude,
    isDefault:req.body?.isDefault===true
   });
   if(!address){
    return res.status(404).json({error:"Adresse introuvable."});
   }
   res.json({ok:true,address});
  }catch(error){
   console.error("Customer address update failed:",error);
   res.status(500).json({error:"Impossible de modifier l’adresse."});
  }
 });

 app.delete("/api/customer/addresses/:addressId",requireCustomer,async(req,res)=>{
  try{
   const deleted=await customerDb.deleteAddress(req.customer.id,req.params.addressId);
   if(!deleted){
    return res.status(404).json({error:"Adresse introuvable."});
   }
   res.json({ok:true});
  }catch(error){
   console.error("Customer address delete failed:",error);
   res.status(500).json({error:"Impossible de supprimer l’adresse."});
  }
 });

 app.post("/api/customer/addresses/:addressId/default",requireCustomer,async(req,res)=>{
  try{
   const address=await customerDb.setDefaultAddress(req.customer.id,req.params.addressId);
   if(!address){
    return res.status(404).json({error:"Adresse introuvable."});
   }
   res.json({ok:true,address});
  }catch(error){
   console.error("Customer default address update failed:",error);
   res.status(500).json({error:"Impossible de définir l’adresse par défaut."});
  }
 });
}

module.exports=registerCustomerProfileRoutes;
