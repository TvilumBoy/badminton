const { timingSafeEqual } = require('node:crypto');
const { neon } = require('@neondatabase/serverless');

function auth(req){
  const expected=process.env.APP_ACCESS_CODE;
  if(!expected)return false;
  const given=Buffer.from(String(req.headers['x-app-code']||'')),want=Buffer.from(expected);
  return given.length===want.length&&timingSafeEqual(given,want);
}
function connectionString(){
  return process.env.DATABASE_URL||process.env.POSTGRES_URL||process.env.NEON_DATABASE_URL||'';
}

module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!auth(req))return res.status(401).json({error:'Forkert adgangskode.'});
  const url=connectionString();
  if(!url)return res.status(503).json({error:'Online database er ikke sat op endnu. Tilføj en Neon Postgres-database til Vercel-projektet.'});
  const sql=neon(url);
  try{
    await sql`CREATE TABLE IF NOT EXISTS badminton_cloud_state (
      id text PRIMARY KEY,
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
    if(req.method==='GET'){
      const rows=await sql`SELECT data, updated_at FROM badminton_cloud_state WHERE id='primary' LIMIT 1`;
      if(!rows.length)return res.status(200).json({state:null});
      return res.status(200).json({state:rows[0].data,updatedAt:rows[0].updated_at});
    }
    if(req.method==='PUT'){
      const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
      const state=body?.state;
      if(!state||typeof state!=='object'||Array.isArray(state))return res.status(400).json({error:'Ugyldige app-data.'});
      const json=JSON.stringify(state);
      if(json.length>4000000)return res.status(413).json({error:'App-data fylder for meget til online-lagring.'});
      await sql`INSERT INTO badminton_cloud_state (id,data,updated_at)
        VALUES ('primary',${json}::jsonb,now())
        ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data, updated_at=now()`;
      return res.status(200).json({ok:true});
    }
    return res.status(405).json({error:'Brug GET eller PUT.'});
  }catch(e){
    console.error('cloud state error',e);
    return res.status(500).json({error:'Online databasen kunne ikke gemme eller hente data.'});
  }
};
