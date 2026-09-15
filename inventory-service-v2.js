function parseOrderNotes(notes){
 const removed=[];
 const extras=[];
 const text=String(notes||"");
 const noMatch=text.match(/NO:\s*([^|]+)/i);
 if(noMatch){
  noMatch[1].split(",").map(x=>x.trim()).filter(Boolean).forEach(x=>removed.push(x));
 }
 const extraMatch=text.match(/EXTRAS:\s*([^|]+)/i);
 if(extraMatch){
  extraMatch[1].split(",").map(x=>x.trim()).filter(Boolean).forEach(entry=>{
   const match=entry.match(/^(\d+)\s*x\s*(.+)$/i);
   if(match){
    extras.push({name:match[2].trim(),quantity:Number(match[1])||1});
   }else{
    extras.push({name:entry,quantity:1});
   }
  });
 }
 return {removed,extras};
}

function parseReceiptSnapshot(notes){
 const match=String(notes||"").match(/(?:^|\|\s*)RECEIPT_JSON:([^|]+)/);
 if(!match)return null;
 try{
  const parsed=JSON.parse(decodeURIComponent(match[1].trim()));
  return parsed&&typeof parsed==="object"?parsed:null;
 }catch(error){
  return null;
 }
}

function buildNeeds(db,items){
 const needs=new Map();
 const add=(ingredientId,qty)=>{
  if(!ingredientId || !Number.isFinite(qty) || qty<=0)return;
  needs.set(ingredientId,(needs.get(ingredientId)||0)+qty);
 };

 const menuItemByName=new Map(
  db.prepare("SELECT id,name,category_id FROM menu_items").all().map(row=>[row.name,row])
 );
 const recipeForItem=db.prepare(`
  SELECT i.id,i.name,COALESCE(mii.quantity,1) AS quantity
  FROM menu_item_ingredients mii
  JOIN menu_ingredients i ON i.id=mii.ingredient_id
  WHERE mii.menu_item_id=?
 `);

 const consumeMenuItem=(name,quantity,removed=[],extras=[])=>{
  const menuItem=menuItemByName.get(String(name||""));
  if(!menuItem)return;
  const orderQty=Math.max(1,Number(quantity||1));
  const removedSet=new Set((removed||[]).map(value=>String(value)));
  recipeForItem.all(menuItem.id).forEach(ingredient=>{
   if(!removedSet.has(ingredient.name)){
    add(ingredient.id,Number(ingredient.quantity||1)*orderQty);
   }
  });
  (extras||[]).forEach(extra=>{
   const extraItem=menuItemByName.get(String(extra?.name||""));
   if(!extraItem)return;
   const extraQty=Math.max(1,Number(extra?.quantity??extra?.qty??1));
   recipeForItem.all(extraItem.id).forEach(ingredient=>{
    add(ingredient.id,Number(ingredient.quantity||1)*extraQty*orderQty);
   });
  });
 };

 for(const orderItem of items||[]){
  const orderQty=Math.max(1,Number(orderItem.quantity||1));
  const snapshot=parseReceiptSnapshot(orderItem.notes);

  if(snapshot?.combo===true && Array.isArray(snapshot.combo_components)){
   snapshot.combo_components.forEach(component=>{
    consumeMenuItem(
     component.item_name,
     orderQty,
     Array.isArray(component.removed)?component.removed:[],
     Array.isArray(component.extras)?component.extras:[]
    );
   });
   continue;
  }

  const itemName=String(orderItem.item_name||"");
  const {removed,extras}=parseOrderNotes(orderItem.notes);
  consumeMenuItem(itemName,orderQty,removed,extras);
 }

 return needs;
}

function consumeOrderInventory(db,items,reference,createdBy){
 const needs=buildNeeds(db,items);
 if(!needs.size)return [];

 const getInventory=db.prepare(`
  SELECT inv.ingredient_id,inv.tracked,inv.stock,i.name
  FROM inventory_items inv
  JOIN menu_ingredients i ON i.id=inv.ingredient_id
  WHERE inv.ingredient_id=?
 `);

 const shortages=[];
 for(const [ingredientId,qty] of needs){
  const row=getInventory.get(ingredientId);
  if(!row || !row.tracked)continue;
  if(Number(row.stock)<qty){
   shortages.push({
    ingredient_id:ingredientId,
    name:row.name,
    required:qty,
    available:Number(row.stock)
   });
  }
 }

 if(shortages.length){
  const error=new Error("INSUFFICIENT_INVENTORY");
  error.shortages=shortages;
  throw error;
 }

 const update=db.prepare(`
  UPDATE inventory_items
  SET stock=?,updated_at=CURRENT_TIMESTAMP
  WHERE ingredient_id=?
 `);
 const movement=db.prepare(`
  INSERT INTO inventory_movements (
   ingredient_id,movement_type,quantity,stock_before,stock_after,note,created_by
  ) VALUES (?,?,?,?,?,?,?)
 `);

 const consumed=[];
 for(const [ingredientId,qty] of needs){
  const row=getInventory.get(ingredientId);
  if(!row || !row.tracked)continue;
  const before=Number(row.stock);
  const after=before-qty;
  update.run(after,ingredientId);
  movement.run(
   ingredientId,
   "SALE",
   -qty,
   before,
   after,
   reference?`Order ${reference}`:null,
   createdBy||"cashier"
  );
  consumed.push({ingredient_id:ingredientId,name:row.name,quantity:qty,stock_after:after});
 }

 return consumed;
}

module.exports={buildNeeds,consumeOrderInventory};
