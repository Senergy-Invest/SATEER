"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const ROOT=path.resolve(__dirname,"..");
const MODE=process.argv[2] || "static";
const TENANT="P6V_3B5AC5AB9DB04657", ORG=70;
const ORIGIN="http://127.0.0.1:3200";
const STORE=path.join(ROOT,".sateer-backups","bordeaux-dossiers-persistants-v1");
const creds=path.join(STORE,"comptes-demonstration.txt");
const manifest=path.join(STORE,"manifest.json");
function strictEqual(a,b,label){assert.equal(a,b,label);}
function staticTest(){
 const source=fs.readFileSync(path.join(ROOT,"public/consulat.js"),"utf8");
 const detail=fs.readFileSync(path.join(ROOT,"public/demande-detail.js"),"utf8");
 assert.match(source,/destination\.searchParams\.set\("tenant", tenant\)/);
 assert.match(source,/destination\.searchParams\.set\("demande", String\(demande\.id\)\)/);
 assert.match(detail,/retour\.searchParams\.set\("tenant", tenant\)/);
 assert.match(detail,/if \(!tenant \|\| contexte\.tenantCode !== tenant\)/);
 assert.match(detail,/\/api\/demandes\/\$\{DEMANDE_ID\}\?organisationId=\$\{ORGANISATION_ID\}&tenant=\$\{encodeURIComponent\(tenant\)\}/);
 // Exécuter le vrai gestionnaire de clic de Mon Consulat, avec un contexte fictif.
 const match=source.match(/item\.addEventListener\(\s*"click"\s*,\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s*\}\s*\);/);
 assert.ok(match,"Gestionnaire de clic de demande non trouve");
 const location={origin:ORIGIN,search:`?organisation=${ORG}&tenant=${TENANT}`,href:""};
 vm.runInNewContext(`(() => { ${match[1]} })()`,{
   URL,URLSearchParams,console,
   window:{location,SATEER_CONTEXT:{tenantCode:TENANT}},
   demande:{id:135},CONSULAT_ID:ORG
 });
 const parsed=new URL(location.href,ORIGIN);
 strictEqual(parsed.pathname,"/demande-detail.html","Destination incorrecte");
 strictEqual(parsed.searchParams.get("tenant"),TENANT,"Tenant perdu au clic");
 strictEqual(parsed.searchParams.get("organisation"),String(ORG));
 strictEqual(parsed.searchParams.get("demande"),"135");
 strictEqual(parsed.searchParams.get("source"),"MON_CONSULAT");
 console.log("DEMANDE_CITOYEN_NAVIGATION_PASS: tenant transmis, retour conserve, URL API contextuelle.");
}
function readPrivate(file){
 const stat=fs.statSync(file);assert.equal(stat.mode&0o077,0,"Fichier prive insuffisamment protege : "+file);
 return fs.readFileSync(file,"utf8");
}
function users(){return Object.fromEntries(readPrivate(creds).trim().split(/\n\s*\n/).map(b=>{
 const lines=b.trim().split("\n");return [lines[0],{login:lines[1]?.replace(/^Identifiant : /,""),password:lines[2]?.replace(/^Mot de passe : /,"")}];
 }));}
async function login(u){
 assert.ok(u?.login&&u?.password,"Identifiants de compte fictif absents");
 const r=await fetch(ORIGIN+"/api/auth/login",{method:"POST",redirect:"manual",headers:{"Content-Type":"application/json"},body:JSON.stringify({identifiant:u.login,motDePasse:u.password})});
 strictEqual(r.status,200,"Connexion de test refusee");
 const setCookies=typeof r.headers.getSetCookie==="function"?r.headers.getSetCookie():[r.headers.get("set-cookie")||""];
 const cookie=setCookies.map(x=>x.split(";")[0]).find(x=>x.startsWith("sateer_session="));
 assert.ok(cookie,"Cookie de test absent");return cookie;
}
async function api(url,cookie){
 const r=await fetch(ORIGIN+url,{headers:cookie?{Cookie:cookie}:undefined,redirect:"manual"});
 let body={};try{body=await r.json()}catch{}return {status:r.status,body};
}
async function logout(cookie){
 if(!cookie)return;
 await fetch(ORIGIN+"/api/auth/logout",{method:"POST",headers:{Cookie:cookie}}).catch(()=>{});
}
async function httpTest(){
 staticTest();
 const m=JSON.parse(readPrivate(manifest));
 strictEqual(m.tenant,TENANT);strictEqual(m.orgId,ORG);
 strictEqual(m.key,"BORDEAUX_DOSSIERS_PERSISTANTS_V1");
 const accounts=users();let awa,samba;
 try{
  awa=await login(accounts.CITOYEN_AWA);
  samba=await login(accounts.CITOYEN_SAMBA);
  const context=await api(`/api/context?tenant=${TENANT}`,awa);
  strictEqual(context.status,200,"Contexte Awa indisponible");
  strictEqual(context.body.tenantCode,TENANT,"Contexte tenant Awa incorrect");
  const personId=context.body.personne?.id;
  strictEqual(Number(personId),Number(m.people.AWA),"Identite Awa inattendue");
  const list=await api(`/api/mon-consulat/${personId}?tenant=${TENANT}&organisation=${ORG}`,awa);
  strictEqual(list.status,200,"Liste Mon Consulat Awa indisponible");
  const dossier=list.body.demandes?.find(d=>d.categorie==="CARTE_CONSULAIRE"&&d.statut==="TRAITEE"&&m.demandIds.includes(Number(d.id)));
  assert.ok(dossier,"Dossier traite Awa absent de la liste");
  const detailPath=`/api/demandes/${dossier.id}?organisationId=${ORG}&tenant=${TENANT}`;
  const detail=await api(detailPath,awa);
  strictEqual(detail.status,200,"Detail Awa refuse malgré la liste");
  assert.ok(Array.isArray(detail.body.reponses)&&detail.body.reponses.length>=1,"Réponse citoyen absente");
  assert.ok(Array.isArray(detail.body.historique)&&detail.body.historique.length>=1,"Historique citoyen absent");
  strictEqual((await api(detailPath,samba)).status,404,"Fuite d'un dossier vers Samba");
  strictEqual((await api(detailPath,null)).status,401,"Detail lisible sans session");
  const page=await fetch(ORIGIN+`/demande-detail.html?demande=${dossier.id}&organisation=${ORG}&tenant=${TENANT}&source=MON_CONSULAT`);
  strictEqual(page.status,200,"Page de detail non servie");
  console.log("DEMANDE_CITOYEN_HTTP_PASS: Awa 200 + reponse + historique; Samba 404; anonyme 401; page HTTP 200.");
 }finally{await Promise.allSettled([logout(awa),logout(samba)]);}
}
(async()=>{if(MODE==="static")staticTest();else if(MODE==="http")await httpTest();else throw new Error("Usage: static | http")})().catch(e=>{console.error("DEMANDE_CITOYEN_TEST_FAILED:",e.message);process.exitCode=1});
