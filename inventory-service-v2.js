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

function buildNeeds(db,items){
 const needs=new Map();
 const add=(ingredientId,qty)=>{
  if(!ingredientId || !Number.isFinite(qty) || qty<=0)return;
  needs.set(ingredientId,(needs.get(ingredientId)||0)+qty);
 };

 const ingredientByName=new Map(
  db.prepare("SELECT id,name FROM menu_ingredients").all().map(row=>[row.name,row.id])
 );
 const menuItemByName=new Map(
  db.prepare("SELECT id,name,category_id FROM menu_items").all().map(row=>[row.name,row])
 );

 const extraIngredientMap={
  "Extra beef patty":"Beef patty 120g",
  "Extra chicken steak":"Grilled chicken breast 120g",
  "Extra cheddar cheese":"Cheddar cheese",
  "Extra emmental cheese":"Emmental cheese",
  "Extra Swiss cheese":"Swiss cheese",
  "Extra mushroom":"Sautéed mushrooms",
  "Extra onion rings":"Onion rings",
  "Extra bacon":"Bacon"
 };

 for(const orderItem of items||[]){
  const itemName=String(orderItem.item_name||"");
  const orderQty=Math.max(1,Number(orderItem.quantity||1));
  const menuItem=menuItemByName.get(itemName);
  if(!menuItem)continue;

  const {removed,extras}=parseOrderNotes(orderItem.notes);
  const removedSet=new Set(removed);

  const recipe=db.prepare(`
   SELECT i.id,i.name,COALESCE(mii.quantity,1) AS quantity
   FROM menu_item_ingredients mii
   JOIN menu_ingredients i ON i.id=mii.ingredient_id
   WHERE mii.menu_item_id=?
  `).all(menuItem.id);

  recipe.forEach(ingredient=>{
   if(!removedSet.has(ingredient.name)){
    add(ingredient.id,Number(ingredient.quantity||1)*orderQty);
   }
  });

  extras.forEach(extra=>{
   const ingredientName=extraIngredientMap[extra.name];
   const ingredientId=ingredientByName.get(ingredientName);
   add(ingredientId,Number(extra.quantity||1)*orderQty);
  });
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
