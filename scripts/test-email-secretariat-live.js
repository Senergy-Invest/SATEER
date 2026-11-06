'use strict';
// Reutilise seulement les sessions deja validees. Ne fait AUCUN POST /login.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const p=path.join(process.cwd(),'.sateer-backups','recette-sessions-temporaires.json');
const base='http://127.0.0.1:3200';
const args='?organisationId=70&tenant=P6V_3B5AC5AB9DB04657';
async function call(route,cookie){const response=await fetch(base+route,{headers:{Accept:'application/json',...(cookie?{Cookie:cookie}:{})},redirect:'manual'});let body=null;try{body=await response.json();}catch(e){}return {code:response.status,body,type:response.headers.get('content-type')||''};}
(async()=>{
 const anon=await call('/api/bordeaux-email-demo/messages'+args);
 assert.equal(anon.code,401);assert.match(anon.type,/application\/json/);console.log('EMAIL_DEMO_HTTP_ANONYME_401_JSON_PASS');
 if(!fs.existsSync(p)){console.log('EMAIL_DEMO_HTTP_ROLES_NON_TESTES : cache des sessions absent; aucun login effectué');return;}
 const st=fs.lstatSync(p);assert(st.isFile()&&!st.isSymbolicLink()&&(st.mode&0o077)===0);
 const j=JSON.parse(fs.readFileSync(p,'utf8'));
 const v=j.entries?.['Vice-Consul'];const c=j.entries?.['Consul'];
 if(!v?.cookie||!c?.cookie){console.log('EMAIL_DEMO_HTTP_ROLES_NON_TESTES : sessions des rôles indisponibles; aucun login effectué');return;}
 const check=async entry=>{const m=await call('/api/auth/me',entry.cookie);if(m.code!==200 || Number(m.body?.personne?.id)!==Number(entry.personId))return false;return true;};
 if(!(await check(v))||!(await check(c))){console.log('EMAIL_DEMO_HTTP_ROLES_NON_TESTES : sessions expirées; aucun login effectué');return;}
 const cv=await call('/api/bordeaux-email-demo/messages'+args,v.cookie);
 assert.equal(cv.code,200,'Vice doit lire la boîte synthétique');
 assert.equal(cv.body?.enLectureSeule,true);assert.equal(cv.body?.messages?.length,1);
 console.log('EMAIL_DEMO_HTTP_VICE_200_PASS : message synthétique présent');
 const cc=await call('/api/bordeaux-email-demo/messages'+args,c.cookie);
 assert.equal(cc.code,403,'Consul ne doit pas accéder aux courriers opérationnels');
 console.log('EMAIL_DEMO_HTTP_CONSUL_403_PASS');
 const bd=await call('/api/bordeaux-email-demo/messages/1'+args,v.cookie);
 assert.equal(bd.code,200);assert.match(bd.body?.message?.texte||'',/fictif/i);
 console.log('EMAIL_DEMO_HTTP_DETAIL_200_PASS');
})().catch(e=>{console.error('EMAIL_DEMO_HTTP_ECHEC :',e.message);process.exitCode=1;});
