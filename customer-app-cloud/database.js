const {Pool}=require("pg");

const connectionString=String(process.env.DATABASE_URL||"").trim();

if(!connectionString){
 throw new Error("DATABASE_URL is required for Customer App cloud persistence.");
}

const pool=new Pool({
 connectionString,
 ssl:false,
 max:5,
 idleTimeoutMillis:30000,
 connectionTimeoutMillis:8000
});

async function init(){
 await pool.query(`
  CREATE TABLE IF NOT EXISTS customer_app_publications(
   id BIGSERIAL PRIMARY KEY,
   restaurant_id TEXT NOT NULL,
   version INTEGER NOT NULL,
   draft_count INTEGER NOT NULL DEFAULT 0,
   snapshot_json JSONB NOT NULL,
   published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   UNIQUE(restaurant_id,version)
  )
 `);

 await pool.query(`
  CREATE INDEX IF NOT EXISTS idx_customer_app_publications_latest
  ON customer_app_publications(restaurant_id,version DESC)
 `);
}

async function getLatestPublication(restaurantId){
 const result=await pool.query(`
  SELECT restaurant_id,version,draft_count,snapshot_json,published_at
  FROM customer_app_publications
  WHERE restaurant_id=$1
  ORDER BY version DESC
  LIMIT 1
 `,[restaurantId]);

 const row=result.rows[0];
 if(!row)return null;

 return {
  restaurantId:String(row.restaurant_id),
  version:Number(row.version),
  draftCount:Number(row.draft_count||0),
  snapshot:row.snapshot_json,
  publishedAt:new Date(row.published_at).toISOString()
 };
}

async function savePublication({restaurantId,version,draftCount,snapshot}){
 const result=await pool.query(`
  INSERT INTO customer_app_publications(
   restaurant_id,version,draft_count,snapshot_json
  )
  VALUES($1,$2,$3,$4::jsonb)
  ON CONFLICT(restaurant_id,version)
  DO UPDATE SET
   draft_count=EXCLUDED.draft_count,
   snapshot_json=EXCLUDED.snapshot_json
  RETURNING restaurant_id,version,draft_count,snapshot_json,published_at
 `,[
  restaurantId,
  version,
  draftCount,
  JSON.stringify(snapshot)
 ]);

 const row=result.rows[0];
 return {
  restaurantId:String(row.restaurant_id),
  version:Number(row.version),
  draftCount:Number(row.draft_count||0),
  snapshot:row.snapshot_json,
  publishedAt:new Date(row.published_at).toISOString()
 };
}

async function health(){
 await pool.query("SELECT 1");
 return true;
}

module.exports={
 init,
 health,
 getLatestPublication,
 savePublication
};
