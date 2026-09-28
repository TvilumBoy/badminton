const { timingSafeEqual } = require('node:crypto');
const { put, get, del } = require('@vercel/blob');
const { Readable } = require('node:stream');

function auth(req){
  const expected=process.env.APP_ACCESS_CODE;
  if(!expected)return false;
  const given=Buffer.from(String(req.headers['x-app-code']||'')),want=Buffer.from(expected);
  return given.length===want.length&&timingSafeEqual(given,want);
}
function safeId(id){return /^[A-Za-z0-9._-]{1,160}$/.test(String(id||''))?String(id):''}
function pathFor(id){return 'badminton-images/'+id}

module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');
  if(!auth(req))return res.status(401).json({error:'Forkert adgangskode.'});
  if(!process.env.BLOB_READ_WRITE_TOKEN)return res.status(503).json({error:'Online billedlager er ikke sat op endnu. Opret et privat Vercel Blob-lager.'});
  const id=safeId(req.query?.id || req.body?.id);
  if(req.method==='GET'){
    if(!id)return res.status(400).json({error:'Billed-ID mangler.'});
    try{
      const result=await get(pathFor(id),{access:'private'});
      if(!result||result.statusCode!==200)return res.status(404).json({error:'Billedet findes ikke online.'});
      res.statusCode=200;
      res.setHeader('Content-Type',result.blob.contentType||'application/octet-stream');
      res.setHeader('X-Content-Type-Options','nosniff');
      if(result.blob.etag)res.setHeader('ETag',result.blob.etag);
      Readable.fromWeb(result.stream).pipe(res);
      return;
    }catch(e){
      console.error('cloud image get error',e);
      return res.status(404).json({error:'Billedet findes ikke online.'});
    }
  }
  if(req.method==='POST'){
    let body=req.body;
    try{if(typeof body==='string')body=JSON.parse(body)}catch{return res.status(400).json({error:'Ugyldigt billede.'})}
    const postId=safeId(body?.id);
    const match=String(body?.image||'').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/);
    if(!postId||!match)return res.status(400).json({error:'Ugyldigt billede eller billed-ID.'});
    const buffer=Buffer.from(match[2],'base64');
    if(buffer.length>3000000)return res.status(413).json({error:'Billedet er for stort til online-lagring. Maks. ca. 3 MB.'});
    try{
      const blob=await put(pathFor(postId),buffer,{access:'private',contentType:match[1],allowOverwrite:true,addRandomSuffix:false});
      return res.status(200).json({ok:true,size:buffer.length,pathname:blob.pathname});
    }catch(e){
      console.error('cloud image put error',e);
      return res.status(500).json({error:'Billedet kunne ikke gemmes online.'});
    }
  }
  if(req.method==='DELETE'){
    if(!id)return res.status(400).json({error:'Billed-ID mangler.'});
    try{await del(pathFor(id));return res.status(200).json({ok:true})}
    catch(e){console.error('cloud image delete error',e);return res.status(500).json({error:'Billedet kunne ikke slettes online.'})}
  }
  return res.status(405).json({error:'Brug GET, POST eller DELETE.'});
};
