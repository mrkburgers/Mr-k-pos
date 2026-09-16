/* Delivery-fee breakdown for active shift and shift history */
(function(){
 function money(value){
  return `${Number(value||0).toLocaleString()} CFA`;
 }

 function localDateText(value){
  if(!value)return "";
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return "";
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
 }

 async function backendOrderMap(){
  try{
   const response=await fetch("/api/orders",{cache:"no-store"});
   if(!response.ok)return new Map();
   const rows=await response.json();
   return new Map((Array.isArray(rows)?rows:[]).map(order=>[Number(order.id),order]));