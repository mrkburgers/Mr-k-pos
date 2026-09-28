const crypto=require("crypto");

const SCRYPT_N=16384;
const SCRYPT_R=8;
const SCRYPT_P=1;
const KEY_LENGTH=32;
const SALT_BYTES=16;
const PREFIX="scrypt";

function legacyHash(pin){
 return crypto
  .createHash("sha256")
  .update(String(pin))
  .digest("hex");
}

function hashPin(pin){
 const salt=crypto.randomBytes(SALT_BYTES);
 const derived=crypto.scryptSync(String(pin),salt,KEY_LENGTH,{
  N:SCRYPT_N,
  r:SCRYPT_R,
  p:SCRYPT_P
 });
 return [
  PREFIX,
  SCRYPT_N,
  SCRYPT_R,
  SCRYPT_P,
  salt.toString("hex"),
  derived.toString("hex")
 ].join("$");
}

function verifyScrypt(pin,stored){
 const parts=String(stored||"").split("$");
 if(parts.length!==6||parts[0]!==PREFIX)return false;

 const N=Number(parts[1]);
 const r=Number(parts[2]);
 const p=Number(parts[3]);
 if(N!==SCRYPT_N||r!==SCRYPT_R||p!==SCRYPT_P)return false;

 const saltHex=String(parts[4]||"");
 const expectedHex=String(parts[5]||"");
 const saltPattern=new RegExp("^[a-f0-9]{"+String(SALT_BYTES*2)+"}$","i");
 const expectedPattern=new RegExp("^[a-f0-9]{"+String(KEY_LENGTH*2)+"}$","i");
 if(!saltPattern.test(saltHex)||!expectedPattern.test(expectedHex))return false;

 let salt;
 let expected;
 try{
  salt=Buffer.from(saltHex,"hex");
  expected=Buffer.from(expectedHex,"hex");
 }catch{
  return false;
 }
 if(salt.length!==SALT_BYTES||expected.length!==KEY_LENGTH)return false;

 let actual;
 try{
  actual=crypto.scryptSync(String(pin),salt,expected.length,{N,r,p});
 }catch{
  return false;
 }
 return actual.length===expected.length&&crypto.timingSafeEqual(actual,expected);
}

function verifyPin(pin,stored){
 const value=String(stored||"");
 if(value.startsWith(PREFIX+"$")){
  return {ok:verifyScrypt(pin,value),needsUpgrade:false};
 }

 if(/^[a-f0-9]{64}$/i.test(value)){
  const actual=Buffer.from(legacyHash(pin),"hex");
  const expected=Buffer.from(value,"hex");
  return {
   ok:actual.length===expected.length&&crypto.timingSafeEqual(actual,expected),
   needsUpgrade:true
  };
 }

 return {ok:false,needsUpgrade:false};
}

module.exports={hashPin,verifyPin};
