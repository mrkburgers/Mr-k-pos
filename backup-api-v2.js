const fs=require("fs");
const path=require("path");
const Database=require("better-sqlite3");
const createSecurityAuthV2=require("./security-auth-v2");

const REQUIRED_TABLES=[
 "system_settings",
 "staff_accounts",
 "orders",
 "menu_items"
];

function stamp(){
 return new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");
}

function safeUnlink(filePath){
 try{
  if(fs.existsSync(filePath))fs.unlinkSync(filePath);
 }catch(error){
  console.error("Unable to remove temporary backup file",filePath,error);
 }
}

function validateMrKDatabase(filePath){
 let candidate;
 try{
  candidate=new Database(filePath,{readonly:true,fileMustExist:true});

  const integrity=candidate.pragma("integrity_check",{simple:true});
  if(String(integrity||"").toLowerCase()!=="ok"){
   throw new Error("Database integrity check failed.");
  }

  const rows=candidate.prepare(`
   SELECT name
   FROM sqlite_master
   WHERE type='table'
  `).all();
  const tables=new Set(rows.map(row=>String(row.name||"")));

  const missing=REQUIRED_TABLES.filter(name=>!tables.has(name));
  if(missing.length){
   throw new Error("Backup is not a valid Mr K POS database.");
  }

  const settings=candidate.prepare(`
   SELECT id
   FROM system_settings
   WHERE id=1
   LIMIT 1
  `).get();
  if(!settings){
   throw new Error("Backup is missing Mr K POS settings.");
  }

  return true;
 }finally{
  if(candidate){
   try{candidate.close();}catch{}
  }
 }
}

module.exports=function registerDatabaseBackupV2(app,io,db){
 const ownerOnly=createSecurityAuthV2().requireRole("owner");
 const liveDbPath=path.resolve(String(db.name||"mr-k-pos.db"));
 const backupDir=path.join(path.dirname(liveDbPath),".mrk-pos-backups");
 fs.mkdirSync(backupDir,{recursive:true});

 app.get("/api/database-backup",ownerOnly,async(req,res)=>{
  const filename=`mr-k-pos-${stamp()}.db`;
  const tempPath=path.join(backupDir,`download-${process.pid}-${Date.now()}.db`);

  try{
   await db.backup(tempPath);
   validateMrKDatabase(tempPath);

   res.download(tempPath,filename,error=>{
    safeUnlink(tempPath);
    if(error&&!res.headersSent){
     res.status(500).json({error:"Unable to download database backup."});
    }
   });
  }catch(error){
   safeUnlink(tempPath);
   console.error("Database backup failed",error);
   if(!res.headersSent){
    res.status(500).json({error:"Unable to create database backup."});
   }
  }
 });

 app.post(
  "/api/database-restore",
  ownerOnly,
  require("express").raw({
   type:"application/octet-stream",
   limit:"200mb"
  }),
  async(req,res)=>{
   if(!Buffer.isBuffer(req.body)||!req.body.length){
    return res.status(400).json({error:"Select a database backup file first."});
   }

   const token=`${process.pid}-${Date.now()}`;
   const stagedPath=path.join(backupDir,`restore-stage-${token}.db`);
   const rollbackPath=path.join(backupDir,`restore-rollback-${token}.db`);
   const safetyPath=path.join(backupDir,`pre-restore-${stamp()}.db`);
   let databaseClosed=false;

   try{
    fs.writeFileSync(stagedPath,req.body,{flag:"wx"});
    validateMrKDatabase(stagedPath);

    await db.backup(safetyPath);
    validateMrKDatabase(safetyPath);

    db.close();
    databaseClosed=true;

    safeUnlink(liveDbPath+"-wal");
    safeUnlink(liveDbPath+"-shm");

    fs.renameSync(liveDbPath,rollbackPath);
    try{
     fs.renameSync(stagedPath,liveDbPath);
    }catch(error){
     fs.renameSync(rollbackPath,liveDbPath);
     throw error;
    }

    safeUnlink(rollbackPath);

    res.status(200).json({
     restored:true,
     safety_backup:path.basename(safetyPath),
     restart_required:true,
     message:"Database restored. Restart the Mr K POS server."
    });

    res.once("finish",()=>{
     setTimeout(()=>process.exit(0),500);
    });
   }catch(error){
    console.error("Database restore failed",error);

    safeUnlink(stagedPath);

    if(databaseClosed&&!fs.existsSync(liveDbPath)&&fs.existsSync(rollbackPath)){
     try{fs.renameSync(rollbackPath,liveDbPath);}catch(rollbackError){
      console.error("Database rollback failed",rollbackError);
     }
    }

    if(!res.headersSent){
     const message=String(error?.message||"");
     const invalid=
      message.includes("not a valid Mr K POS database")||
      message.includes("integrity check failed")||
      message.includes("missing Mr K POS settings")||
      message.includes("file is not a database");

     res.status(invalid?400:500).json({
      error:invalid
       ?"Invalid or incompatible Mr K POS database backup."
       :"Unable to restore database backup."
     });
    }

    if(databaseClosed){
     setTimeout(()=>process.exit(1),500);
    }
   }
  }
 );
};
