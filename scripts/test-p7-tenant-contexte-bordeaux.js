'use strict';
// Recette ciblee du routeur P7. 'isolated' : faux services, aucun acces DB.
// 'live' : API HTTP reelle 3200 avec comptes prives, sans aucune ecriture en base.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const ORG=70, TENANT='P6V_3B5AC5AB9DB04657';
const ORIGIN='http://127.0.0.1:3200';
const CREDS=path.join(process.cwd(), '.sateer-backups', 'bordeaux-dossiers-persistants-v1', 'comptes-demonstration.txt');
const forbidden=(msg)=>{throw Error(msg)};

async function isolated(){
  const routes=new Map();const middles=[];
  const router={use(fn){middles.push(fn)},get(p,fn){routes.set('GET '+p,fn)},post(p,fn){routes.set('POST '+p,fn)},put(p,fn){routes.set('PUT '+p,fn)}};
  const services={
    listerOrganisationsPersonneDatabase:async(personneId)=>personneId===401?[{id:ORG}]:[],
    obtenirPermissionsEffectivesDatabase:async()=>({succes:false})
  };
  const db={
    executerRequete:async(sql,params)=>{
      if(sql.includes('organisation_procedure_catalogue')){
        assert.equal(Number(params[0]),ORG);
        assert.equal(params[1],TENANT);
        const row={id:1,code:'DEMO_TEST',categorie:'PASSEPORT',titre:'Dossier fictif',piecesObligatoires:[],delaiIndicatifJours:null,actif:true};
        if(sql.includes('c.code=$3')) assert.equal(params[2],'DEMO_TEST');
        return {rowCount:1,rows:[row]};
      }
      if(sql.includes('citizen_private_files')) return {rowCount:0,rows:[]};
      forbidden('Requete SQL non attendue dans le test isole: '+sql.slice(0,70));
    },
    obtenirClientDatabase:()=>forbidden('Aucune ecriture DB permise dans le test isole')
  };
  const stubs={
    express:{Router:()=>router},
    './database':db,
    './services-database':services,
    './auth-authorization':{verifierPermissionPersonneDatabase:async()=>({autorise:false})},
    './private-files-crypto':{decrypt:()=>forbidden('Pas de fichiers dans ce test')}
  };
  const realLoad=Module._load;
  Module._load=function(request,parent,isMain){
    if(parent?.filename?.endsWith(path.sep+'pilot-procedures-http.js') && Object.prototype.hasOwnProperty.call(stubs,request)) return stubs[request];
    return realLoad.apply(this,arguments);
  };
  const before=process.env.PGDATABASE;
  process.env.PGDATABASE='sateer_test';
  try {
    delete require.cache[require.resolve('../pilot-procedures-http')];
    require('../pilot-procedures-http').setup({use(prefix,value){assert.equal(prefix,'/api/pilot-procedures');assert.equal(value,router)}},(req,res,next)=>next());
  } finally {Module._load=realLoad; if(before===undefined)delete process.env.PGDATABASE;else process.env.PGDATABASE=before;}
  process.env.PGDATABASE='sateer_test';
  async function call(endpoint,query,personneId=401){
    const fn=routes.get('GET '+endpoint);
    assert.ok(fn,'Route '+endpoint+' absente');
    const req={query,auth:{personneId},get:()=>undefined};
    const res={code:200,headers:{},set(k,v){this.headers[k]=v;return this},status(n){this.code=n;return this},json(obj){this.data=obj;return this}};
    for(const mw of middles){
      let called=false; const result=mw(req,res,()=>{called=true});
      if(result&&typeof result.then==='function')await result;
      if(!called)return {code:res.code,data:res.data};
    }
    await fn(req,res);
    return {code:res.code,data:res.data};
  }
  try {
    const good=await call('/catalogue',{organisationId:String(ORG),tenant:TENANT});
    assert.equal(good.code,200);assert.equal(good.data.statut,'CATALOGUE_CHARGE');
    const preview=await call('/preparer',{organisationId:String(ORG),tenant:TENANT,code:'DEMO_TEST'});
    assert.equal(preview.code,200);assert.equal(preview.data.statut,'DOSSIER_PREPARE');
    assert.equal((await call('/catalogue',{organisationId:String(ORG),tenant:TENANT},999)).code,403,'Un non membre doit etre refuse');
    for(const invalid of ['', 'a', 'aa', 'TENANT!X', 'A'.repeat(51)]) {
      assert.equal((await call('/catalogue',{organisationId:String(ORG),tenant:invalid})).code,400,'Tenant invalide accepte: '+invalid);
    }
    assert.equal((await call('/catalogue',{organisationId:'',tenant:TENANT})).code,400);
    console.log('P7_CONTEXT_ISOLATED_PASS : tenant 20 caracteres accepte; catalogue/preparation 200; non-membre 403; parametres invalides 400.');
  } finally {if(before===undefined)delete process.env.PGDATABASE;else process.env.PGDATABASE=before;}
}

function privateCredentials(){
 const st=fs.statSync(CREDS);
 assert.equal(st.mode & 0o077,0,'Fichier des identifiants trop ouvert');
 const raw=fs.readFileSync(CREDS,'utf8');
 return new Map(raw.split(/\r?\n\s*\r?\n/).map(block=>{
   const [label,...lines]=block.trim().split(/\r?\n/);
   const login=lines.find(x=>x.startsWith('Identifiant : '))?.slice('Identifiant : '.length);
   const password=lines.find(x=>x.startsWith('Mot de passe : '))?.slice('Mot de passe : '.length);
   return [label,{login,password}];
 }).filter(([label,u])=>Boolean(label&&u.login&&u.password)));
}
async function fetchJson(url,cookie,options={}){
 const resp=await fetch(ORIGIN+url,{redirect:'manual',signal:AbortSignal.timeout(10000),headers:{...(cookie?{Cookie:cookie}:{}),...(options.headers||{})},...options});
 return {code:resp.status,data:await resp.json().catch(()=>({})),headers:resp.headers};
}
async function login(u){
 const resp=await fetchJson('/api/auth/login',null,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifiant:u.login,motDePasse:u.password})});
 assert.equal(resp.code,200,'Connexion test refusee');
 const c=typeof resp.headers.getSetCookie==='function'?resp.headers.getSetCookie():[resp.headers.get('set-cookie')||''];
 const cookie=c.map(x=>x.split(';')[0]).find(x=>x.startsWith('sateer_session='));
 assert.ok(cookie,'Cookie SATEER absent');return cookie;
}
async function live(){
 const creds=privateCredentials();
 assert.ok(creds.has('CITOYEN_SAMBA')&&creds.has('CITOYEN_AWA'),'Comptes de demo manquants');
 const samba=await login(creds.get('CITOYEN_SAMBA'));
 const awa=await login(creds.get('CITOYEN_AWA'));
 const pathGood=`/api/pilot-procedures/catalogue?organisationId=${ORG}&tenant=${encodeURIComponent(TENANT)}`;
 const a=await fetchJson(pathGood,samba);
 assert.equal(a.code,200,'P7 catalogue Samba: HTTP '+a.code+' '+(a.data.statut||''));
 assert.equal(a.data.statut,'CATALOGUE_CHARGE');
 assert.ok(Array.isArray(a.data.procedures));
 const b=await fetchJson(pathGood,awa);
 assert.equal(b.code,200,'P7 catalogue Awa: HTTP '+b.code+' '+(b.data.statut||''));
 const foreign=await fetchJson(`/api/pilot-procedures/catalogue?organisationId=132&tenant=${TENANT}`,samba);
 assert.equal(foreign.code,403,'Un citoyen ne doit pas acceder a une organisation non rattachee');
 const anon=await fetchJson(pathGood);
 assert.equal(anon.code,401,'Catalogue sans authentification doit etre refuse');
 const bad=await fetchJson(`/api/pilot-procedures/catalogue?organisationId=${ORG}&tenant=TENANT!INTERDIT`,samba);
 assert.equal(bad.code,400,'Tenant invalide doit etre refuse');
 const chosen=a.data.procedures.find(p=>p.categorie==='PASSEPORT');
 if(chosen){
   const prep=await fetchJson(`/api/pilot-procedures/preparer?organisationId=${ORG}&tenant=${TENANT}&code=${encodeURIComponent(chosen.code)}`,samba);
   assert.equal(prep.code,200,'Preparation passeport HTTP '+prep.code+' '+(prep.data.statut||''));
   assert.equal(prep.data.statut,'DOSSIER_PREPARE');
 }
 console.log('P7_CONTEXT_LIVE_PASS : Samba/Awa 200; hors organisation 403; anonyme 401; tenant invalide 400.');
 console.log('P7_CATALOGUE_INFO : '+a.data.procedures.length+' procedure(s) active(s), passeport='+Boolean(chosen)+' (aucune demande creee).');
 if(!chosen)console.log('A_VERIFIER_EN_CONFIGURATION : aucune procedure Passeport active; ne pas inventer ses pieces obligatoires.');
}
(async()=>{
 const mode=process.argv[2]||'isolated';
 if(mode==='isolated')await isolated();else if(mode==='live')await live();else forbidden('Mode inconnu '+mode);
})().catch(e=>{console.error('P7_CONTEXT_TEST_FAILED: '+e.message);process.exitCode=1});
