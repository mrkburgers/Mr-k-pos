module.exports=function cleanupLegacyBootstrapStaff(db){
 db.exec(`
  CREATE TABLE IF NOT EXISTS staff_bootstrap_identity (
   role TEXT PRIMARY KEY CHECK(role IN ('owner','manager','cashier','kitchen')),
   account_id INTEGER NOT NULL
  );
 `);

 const starterAccounts=[
  {role:"owner",name:"Owner",staffId:"Tarek"},
  {role:"manager",name:"Manager",staffId:"manager01"},
  {role:"cashier",name:"Cashier",staffId:"cashier01"},
  {role:"kitchen",name:"Kitchen",staffId:"kitchen01"}
 ];

 const getIdentity=db.prepare(`
  SELECT account_id
  FROM staff_bootstrap_identity
  WHERE role=?
 `);
 const saveIdentity=db.prepare(`
  INSERT OR IGNORE INTO staff_bootstrap_identity(role,account_id)
  VALUES(?,?)
 `);
 const oldestForRole=db.prepare(`
  SELECT id
  FROM staff_accounts
  WHERE role=?
  ORDER BY id ASC
  LIMIT 1
 `);
 const deleteRecreatedStarter=db.prepare(`
  DELETE FROM staff_accounts
  WHERE role=?
    AND name=?
    AND staff_id=? COLLATE NOCASE
    AND id<>?
 `);

 db.transaction(()=>{
  starterAccounts.forEach(starter=>{
   let identity=getIdentity.get(starter.role);
   if(!identity){
    const oldest=oldestForRole.get(starter.role);
    if(oldest){
     saveIdentity.run(starter.role,Number(oldest.id));
     identity={account_id:Number(oldest.id)};
    }
   }

   if(identity){
    deleteRecreatedStarter.run(
     starter.role,
     starter.name,
     starter.staffId,
     Number(identity.account_id)
    );
   }
  });
 })();
};
