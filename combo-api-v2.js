const crypto=require("crypto");

function makeId(prefix,name){
 const slug=String(name||"")
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"")
  .replace(/[^a-z0-9]+/g,"-")
  .replace(/^-+|-+$/g,"")
  .slice(0,40)||"item";
 return `${prefix}-${slug}-${crypto.randomBytes(3).toString("hex")}`;
}

module.exports=function registerCombosV2(app,io,db){
 const categoryColumns=db.prepare("PRAGMA table_info(menu_categories)").all();
 if(!categoryColumns.some(column=>column.name==="category_type")){
  db.exec("ALTER TABLE menu_categories ADD COLUMN category_type TEXT NOT NULL DEFAULT 'item'");
 }

 const itemColumns=db.prepare("PRAGMA table_info(menu_items)").all();
 if(!itemColumns.some(column=>column.name==="show_on_menu")){
  db.exec("ALTER TABLE menu_items ADD COLUMN show_on_menu INTEGER NOT NULL DEFAULT 1");
 }

 db.exec(`
  CREATE TABLE IF NOT EXISTS menu_combos (
   id TEXT PRIMARY KEY,
   name TEXT NOT NULL UNIQUE,
   description TEXT NOT NULL DEFAULT '',
   category_id TEXT NOT NULL,
   price INTEGER NOT NULL DEFAULT 0,
   active INTEGER NOT NULL DEFAULT 1,
   sort_order INTEGER NOT NULL DEFAULT 0,
   created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
   updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
   FOREIGN KEY(category_id) REFERENCES menu_categories(id)
  );

  CREATE TABLE IF NOT EXISTS menu_combo_components (
   combo_id TEXT NOT NULL,
   menu_item_id TEXT NOT NULL,
   quantity INTEGER NOT NULL DEFAULT 1,
   sort_order INTEGER NOT NULL DEFAULT 0,
   PRIMARY KEY(combo_id,menu_item_id),
   FOREIGN KEY(combo_id) REFERENCES menu_combos(id) ON DELETE CASCADE,
   FOREIGN KEY(menu_item_id) REFERENCES menu_items(id)
  );

  CREATE TABLE IF NOT EXISTS menu_combo_choice_groups (
   id TEXT PRIMARY KEY,
   combo_id TEXT NOT NULL,
   name TEXT NOT NULL,
   selection_count INTEGER NOT NULL DEFAULT 1,
   allow_duplicates INTEGER NOT NULL DEFAULT 1,
   sort_order INTEGER NOT NULL DEFAULT 0,
   created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
   updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
   FOREIGN KEY(combo_id) REFERENCES menu_combos(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS menu_combo_choice_items (
   group_id TEXT NOT NULL,
   menu_item_id TEXT NOT NULL,
   sort_order INTEGER NOT NULL DEFAULT 0,
   PRIMARY KEY(group_id,menu_item_id),
   FOREIGN KEY(group_id) REFERENCES menu_combo_choice_groups(id) ON DELETE CASCADE,
   FOREIGN KEY(menu_item_id) REFERENCES menu_items(id)
  );

  CREATE INDEX IF NOT EXISTS idx_menu_combos_category
  ON menu_combos(category_id,sort_order,name);

  CREATE INDEX IF NOT EXISTS idx_combo_choice_groups_combo
  ON menu_combo_choice_groups(combo_id,sort_order,name);
 `);

 const groupColumns=db.prepare("PRAGMA table_info(menu_combo_choice_groups)").all();
 if(!groupColumns.some(column=>column.name==="allow_duplicates")){
  db.exec("ALTER TABLE menu_combo_choice_groups ADD COLUMN allow_duplicates INTEGER NOT NULL DEFAULT 1");
 }

 function categoryRows(){
  return db.prepare(`
   SELECT id,name,icon,active,sort_order,category_type,created_at,updated_at
   FROM menu_categories
   ORDER BY sort_order ASC,name ASC
  `).all().map(row=>({...row,active:Boolean(row.active)}));
 }

 function itemRows(){
  return db.prepare(`
   SELECT id,name,category_id,price,active,show_on_menu,sort_order,created_at,updated_at
   FROM menu_items
   ORDER BY category_id ASC,sort_order ASC,name ASC
  `).all().map(row=>({
   ...row,
   active:Boolean(row.active),
   show_on_menu:Boolean(row.show_on_menu)
  }));
 }

 function comboRows(){
  const componentStmt=db.prepare(`
   SELECT
    c.menu_item_id,c.quantity,c.sort_order,
    i.name,i.price,i.active,i.show_on_menu,i.category_id,
    mc.name AS category_name,mc.sort_order AS category_sort,
    i.sort_order AS item_sort
   FROM menu_combo_components c
   JOIN menu_items i ON i.id=c.menu_item_id
   LEFT JOIN menu_categories mc ON mc.id=i.category_id
   WHERE c.combo_id=?
   ORDER BY COALESCE(mc.sort_order,999999) ASC,COALESCE(i.sort_order,999999) ASC,i.name ASC
  `);
  const groupStmt=db.prepare(`
   SELECT id,name,selection_count,allow_duplicates,sort_order
   FROM menu_combo_choice_groups
   WHERE combo_id=?
   ORDER BY sort_order ASC,name ASC
  `);
  const choiceItemStmt=db.prepare(`
   SELECT
    ci.menu_item_id,ci.sort_order,
    i.name,i.price,i.active,i.show_on_menu,i.category_id,
    mc.name AS category_name,mc.sort_order AS category_sort,
    i.sort_order AS item_sort
   FROM menu_combo_choice_items ci
   JOIN menu_items i ON i.id=ci.menu_item_id
   LEFT JOIN menu_categories mc ON mc.id=i.category_id
   WHERE ci.group_id=?
   ORDER BY COALESCE(mc.sort_order,999999) ASC,COALESCE(i.sort_order,999999) ASC,i.name ASC
  `);

  return db.prepare(`
   SELECT id,name,description,category_id,price,active,sort_order,created_at,updated_at
   FROM menu_combos
   ORDER BY category_id ASC,sort_order ASC,name ASC
  `).all().map(combo=>({
   ...combo,
   active:Boolean(combo.active),
   components:componentStmt.all(combo.id).map(component=>({
    ...component,
    active:Boolean(component.active),
    show_on_menu:Boolean(component.show_on_menu),
    quantity:Number(component.quantity||1)
   })),
   choice_groups:groupStmt.all(combo.id).map(group=>({
    ...group,
    selection_count:Number(group.selection_count||1),
    allow_duplicates:Boolean(group.allow_duplicates),
    items:choiceItemStmt.all(group.id).map(item=>({
     ...item,
     active:Boolean(item.active),
     show_on_menu:Boolean(item.show_on_menu)
    }))
   }))
  }));
 }

 app.get("/api/combos/state",(req,res)=>{
  res.json({categories:categoryRows(),items:itemRows(),combos:comboRows()});
 });

 app.post("/api/combos/categories",(req,res)=>{
  const name=String(req.body?.name||"").trim();
  const icon=String(req.body?.icon||"🍱").trim()||"🍱";
  const active=req.body?.active!==false;
  if(!name)return res.status(400).json({error:"combo category name is required"});
  if(db.prepare("SELECT id FROM menu_categories WHERE lower(name)=lower(?)").get(name)){
   return res.status(409).json({error:"category name already exists"});
  }
  const id=makeId("category",name);
  const nextSort=db.prepare("SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM menu_categories").get().n;
  db.prepare(`
   INSERT INTO menu_categories(id,name,icon,active,sort_order,category_type)
   VALUES(?,?,?,?,?,'combo')
  `).run(id,name,icon,active?1:0,nextSort);
  io.emit("menu-changed",{type:"combo-category-created",id});
  io.emit("combos-changed",{type:"category-created",id});
  res.status(201).json({id,name,icon,active,sort_order:nextSort,category_type:"combo"});
 });

 app.patch("/api/menu/items/:id/visibility",(req,res)=>{
  const id=String(req.params.id||"");
  const item=db.prepare("SELECT id,name,active,show_on_menu FROM menu_items WHERE id=?").get(id);
  if(!item)return res.status(404).json({error:"menu item not found"});
  if(typeof req.body?.show_on_menu!=="boolean")return res.status(400).json({error:"show_on_menu must be true or false"});
  db.prepare("UPDATE menu_items SET show_on_menu=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(req.body.show_on_menu?1:0,id);
  io.emit("menu-changed",{type:"item-visibility",id});
  io.emit("combos-changed",{type:"item-visibility",id});
  res.json({id,name:item.name,active:Boolean(item.active),show_on_menu:req.body.show_on_menu});
 });

 app.post("/api/combos",(req,res)=>{
  const name=String(req.body?.name||"").trim();
  const description=String(req.body?.description||"").trim();
  const categoryId=String(req.body?.category_id||"").trim();
  const price=Number(req.body?.price);
  const active=req.body?.active!==false;
  const components=Array.isArray(req.body?.components)?req.body.components:[];
  if(!name||!categoryId||!Number.isFinite(price)||price<0)return res.status(400).json({error:"valid combo name, category and price are required"});
  const category=db.prepare("SELECT id,category_type FROM menu_categories WHERE id=?").get(categoryId);
  if(!category||category.category_type!=="combo")return res.status(400).json({error:"combo must use a combo category"});
  if(!components.length)return res.status(400).json({error:"combo needs at least one fixed component"});
  const normalized=[];
  for(const component of components){
   const itemId=String(component?.menu_item_id||"").trim();
   const quantity=Number(component?.quantity);
   const item=db.prepare("SELECT id,active FROM menu_items WHERE id=?").get(itemId);
   if(!item||!item.active)return res.status(400).json({error:"every combo component must be an active existing menu item"});
   if(!Number.isInteger(quantity)||quantity<1)return res.status(400).json({error:"every combo component quantity must be a whole number of 1 or more"});
   const existing=normalized.find(entry=>entry.menu_item_id===itemId);
   if(existing)existing.quantity+=quantity;
   else normalized.push({menu_item_id:itemId,quantity});
  }
  const id=makeId("combo",name);
  const save=db.transaction(()=>{
   const nextSort=db.prepare("SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM menu_combos WHERE category_id=?").get(categoryId).n;
   db.prepare(`INSERT INTO menu_combos(id,name,description,category_id,price,active,sort_order) VALUES(?,?,?,?,?,?,?)`).run(id,name,description,categoryId,Math.round(price),active?1:0,nextSort);
   const add=db.prepare("INSERT INTO menu_combo_components(combo_id,menu_item_id,quantity,sort_order) VALUES(?,?,?,?)");
   normalized.forEach((component,index)=>add.run(id,component.menu_item_id,component.quantity,index+1));
  });
  try{save();}
  catch(error){
   if(String(error.code||"").includes("CONSTRAINT"))return res.status(409).json({error:"combo name already exists"});
   throw error;
  }
  io.emit("menu-changed",{type:"combo-created",id});
  io.emit("combos-changed",{type:"combo-created",id});
  res.status(201).json(comboRows().find(combo=>combo.id===id));
 });

 app.patch("/api/combos/:id",(req,res)=>{
  const id=String(req.params.id||"");
  const current=db.prepare("SELECT * FROM menu_combos WHERE id=?").get(id);
  if(!current)return res.status(404).json({error:"combo not found"});
  const name=String(req.body?.name??current.name).trim();
  const description=String(req.body?.description??current.description??"").trim();
  const categoryId=String(req.body?.category_id??current.category_id).trim();
  const price=Number(req.body?.price??current.price);
  const active=typeof req.body?.active==="boolean"?req.body.active:Boolean(current.active);
  const components=Array.isArray(req.body?.components)?req.body.components:null;
  if(!name||!categoryId||!Number.isFinite(price)||price<0)return res.status(400).json({error:"invalid combo data"});
  const category=db.prepare("SELECT id,category_type FROM menu_categories WHERE id=?").get(categoryId);
  if(!category||category.category_type!=="combo")return res.status(400).json({error:"combo must use a combo category"});

  const normalized=[];
  if(components){
   if(!components.length)return res.status(400).json({error:"combo needs at least one fixed component"});
   for(const component of components){
    const itemId=String(component?.menu_item_id||"").trim();
    const quantity=Number(component?.quantity);
    const item=db.prepare("SELECT id,active FROM menu_items WHERE id=?").get(itemId);
    if(!item||!item.active)return res.status(400).json({error:"every combo component must be an active existing menu item"});
    if(!Number.isInteger(quantity)||quantity<1)return res.status(400).json({error:"every combo component quantity must be a whole number of 1 or more"});
    const existing=normalized.find(entry=>entry.menu_item_id===itemId);
    if(existing)existing.quantity+=quantity;
    else normalized.push({menu_item_id:itemId,quantity});
   }
  }

  const save=db.transaction(()=>{
   db.prepare(`UPDATE menu_combos SET name=?,description=?,category_id=?,price=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(name,description,categoryId,Math.round(price),active?1:0,id);
   if(components){
    db.prepare("DELETE FROM menu_combo_components WHERE combo_id=?").run(id);
    const add=db.prepare("INSERT INTO menu_combo_components(combo_id,menu_item_id,quantity,sort_order) VALUES(?,?,?,?)");
    normalized.forEach((component,index)=>add.run(id,component.menu_item_id,component.quantity,index+1));
   }
  });
  try{save();}
  catch(error){
   if(String(error.code||"").includes("CONSTRAINT"))return res.status(409).json({error:"combo name already exists"});
   throw error;
  }
  io.emit("menu-changed",{type:"combo-updated",id});
  io.emit("combos-changed",{type:"combo-updated",id});
  res.json(comboRows().find(combo=>combo.id===id));
 });

 app.put("/api/combos/:id/choice-groups",(req,res)=>{
  const comboId=String(req.params.id||"");
  if(!db.prepare("SELECT id FROM menu_combos WHERE id=?").get(comboId))return res.status(404).json({error:"combo not found"});
  const groups=Array.isArray(req.body?.choice_groups)?req.body.choice_groups:[];
  const normalized=[];
  for(const group of groups){
   const name=String(group?.name||"").trim();
   const selectionCount=Number(group?.selection_count??1);
   const allowDuplicates=group?.allow_duplicates!==false;
   const itemIds=[...new Set(Array.isArray(group?.item_ids)?group.item_ids.map(value=>String(value||"").trim()).filter(Boolean):[])];
   if(!name)return res.status(400).json({error:"every choice group needs a name"});
   if(!Number.isInteger(selectionCount)||selectionCount<1)return res.status(400).json({error:"choice group quantity must be a whole number of 1 or more"});
   if(itemIds.length<1)return res.status(400).json({error:"every choice group needs at least one allowed item"});
   if(!allowDuplicates && selectionCount>itemIds.length)return res.status(400).json({error:"choice quantity cannot exceed allowed items when duplicates are disabled"});
   for(const itemId of itemIds){
    const item=db.prepare("SELECT id,active FROM menu_items WHERE id=?").get(itemId);
    if(!item||!item.active)return res.status(400).json({error:"choice group items must be active existing menu items"});
   }
   normalized.push({name,selection_count:selectionCount,allow_duplicates:allowDuplicates,item_ids:itemIds});
  }

  const save=db.transaction(()=>{
   const existingGroups=db.prepare("SELECT id FROM menu_combo_choice_groups WHERE combo_id=?").all(comboId);
   const deleteItems=db.prepare("DELETE FROM menu_combo_choice_items WHERE group_id=?");
   existingGroups.forEach(group=>deleteItems.run(group.id));
   db.prepare("DELETE FROM menu_combo_choice_groups WHERE combo_id=?").run(comboId);

   const addGroup=db.prepare(`
    INSERT INTO menu_combo_choice_groups(id,combo_id,name,selection_count,allow_duplicates,sort_order)
    VALUES(?,?,?,?,?,?)
   `);
   const addItem=db.prepare(`
    INSERT INTO menu_combo_choice_items(group_id,menu_item_id,sort_order)
    VALUES(?,?,?)
   `);
   normalized.forEach((group,index)=>{
    const groupId=makeId("choice",group.name);
    addGroup.run(groupId,comboId,group.name,group.selection_count,group.allow_duplicates?1:0,index+1);
    group.item_ids.forEach((itemId,itemIndex)=>addItem.run(groupId,itemId,itemIndex+1));
   });
  });
  save();
  io.emit("menu-changed",{type:"combo-choice-groups",id:comboId});
  io.emit("combos-changed",{type:"combo-choice-groups",id:comboId});
  res.json(comboRows().find(combo=>combo.id===comboId));
 });

 app.delete("/api/combos/:id",(req,res)=>{
  const id=String(req.params.id||"");
  if(!db.prepare("SELECT id FROM menu_combos WHERE id=?").get(id))return res.status(404).json({error:"combo not found"});
  const remove=db.transaction(()=>{
   const groups=db.prepare("SELECT id FROM menu_combo_choice_groups WHERE combo_id=?").all(id);
   const deleteChoiceItems=db.prepare("DELETE FROM menu_combo_choice_items WHERE group_id=?");
   groups.forEach(group=>deleteChoiceItems.run(group.id));
   db.prepare("DELETE FROM menu_combo_choice_groups WHERE combo_id=?").run(id);
   db.prepare("DELETE FROM menu_combo_components WHERE combo_id=?").run(id);
   db.prepare("DELETE FROM menu_combos WHERE id=?").run(id);
  });
  remove();
  io.emit("menu-changed",{type:"combo-deleted",id});
  io.emit("combos-changed",{type:"combo-deleted",id});
  res.json({ok:true,id});
 });
};
