import { createClient } from '@libsql/client';
import { lookup } from 'node:dns/promises';
const db = createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
try {
  const rows = (await db.execute("SELECT canonical_url FROM items WHERE is_fixture=0 ORDER BY published_at DESC LIMIT 100")).rows;
  const urls = [...new Set([...rows.slice(0,12),...rows.slice(-12)].map(row=>String(row.canonical_url)))];
  let next=0;
  await Promise.all(Array.from({length:3},async()=>{
    while(next<urls.length) {
      const value=urls[next++];
      try {
        const url=new URL(value);
        if(url.protocol!=='https:' || url.username || url.password) throw new Error('UNSAFE_URL');
        const addresses=await lookup(url.hostname,{all:true});
        if(addresses.some(({address})=> /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|::1$|f[cd]|fe80)/i.test(address))) throw new Error('PRIVATE_HOST');
        let response=await fetch(url,{method:'HEAD',redirect:'manual',signal:AbortSignal.timeout(5000)});
        if(response.status===405) response=await fetch(url,{method:'GET',headers:{Range:'bytes=0-256'},redirect:'manual',signal:AbortSignal.timeout(5000)});
        void response.body?.cancel().catch(()=>{});
        console.info(JSON.stringify({event:'source.link_checked',url:value,status:response.status,result:[404,410].includes(response.status)?'broken':response.status>=200&&response.status<300?'reachable':response.status>=300&&response.status<400?'redirect':'unverified'}));
      } catch(error) {console.info(JSON.stringify({event:'source.link_checked',url:value,status:null,result:'unverified',code:['UNSAFE_URL','PRIVATE_HOST'].includes(error.message)?error.message:error.name}));}
    }
  }));
} finally {db.close();}
