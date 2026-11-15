"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {creerRoutesPreferencesGeo,creerRoutesCiblageGeo}=require('../diaspora-geo-http');
const {creerServiceGeoDiaspora}=require('../diaspora-geo-service');
function routeFixture({member=true,permission=true,org=true}={}){
  const paths=new Map(),calls=[];
  const router={get:(p,fn)=>paths.set('GET '+p,fn),put:(p,fn)=>paths.set('PUT '+p,fn)};
  const service={chercherTerritoires:async()=>[{id:3,nom:'Bordeaux',type:'VILLE',pays:'FR'}],
    listerPreferences:async()=>[],modifierPreference:async(...args)=>{calls.push(['preference',...args]);return{ok:true,actif:args[3]};},
    definirCible:async data=>{calls.push(['target',data]);return{ok:true,territoryId:data.territoryId};}};
  creerRoutesPreferencesGeo({router,service,contexteCitoyen:async()=>member?1:null});
  creerRoutesCiblageGeo({router,service,verifierPermission:async()=>({succes:true,autorise:permission,portee:'ORGANISATION'}),
    trouverOrganisation:async()=>org?{id:22,type:'ASSOCIATION'}:null});
  const execute=async(method,p,{auth=11,body={},tenant='TEST_DIASPORA',origin=null,params={}}={})=>{
    const req={method,auth:auth?{personneId:auth}:null,query:{tenant},params:{organisationId:'22',publicationId:'33',territoryId:'3',...params},body,get:()=>origin};
    const res={code:200,payload:null,headers:{},set(k,v){this.headers[k]=v;return this;},status(c){this.code=c;return this;},json(d){this.payload=d;return this;}};
    await paths.get(method+' '+p)(req,res);return res;
  };
  return{execute,calls};
}
const p={options:'/geo-options',prefs:'/geo-preferences',choice:'/geo-preferences/:territoryId',target:'/:organisationId/diaspora/geo-target/:publicationId'};
test('geo : absence de session interdit lecture',async()=>{const f=routeFixture(),r=await f.execute('GET',p.options,{auth:null});assert.equal(r.code,401);});
test('geo : hors tenant interdit tout choix',async()=>{const f=routeFixture({member:false}),r=await f.execute('PUT',p.choice,{body:{actif:true}});assert.equal(r.code,403);assert.equal(f.calls.length,0);});
test('geo : tenant malformé refusé',async()=>{const f=routeFixture(),r=await f.execute('GET',p.options,{tenant:'../../autre'});assert.equal(r.code,400);});
test('geo : Origin externe refusé',async()=>{const f=routeFixture(),r=await f.execute('PUT',p.choice,{body:{actif:true},origin:'https://external.example'});assert.equal(r.code,403);});
test('geo : choix explicite booléen requis',async()=>{const f=routeFixture(),r=await f.execute('PUT',p.choice,{body:{actif:1}});assert.equal(r.code,400);});
test('geo : identifiant de territoire numérique requis',async()=>{const f=routeFixture(),r=await f.execute('PUT',p.choice,{body:{actif:true},params:{territoryId:'oops'}});assert.equal(r.code,400);});
test('geo : abonnement utilise seulement personne de session',async()=>{const f=routeFixture(),r=await f.execute('PUT',p.choice,{body:{actif:true,personneId:999}});assert.equal(r.code,200);assert.deepEqual(f.calls[0],['preference',11,'TEST_DIASPORA',3,true]);});
test('geo : désabonnement de zone identique',async()=>{const f=routeFixture(),r=await f.execute('PUT',p.choice,{body:{actif:false}});assert.equal(r.code,200);assert.equal(f.calls[0][4],false);});
test('geo : catalogue sans identités nominatives',async()=>{const f=routeFixture(),r=await f.execute('GET',p.options);assert.deepEqual(r.payload.territoires,[{id:3,nom:'Bordeaux',type:'VILLE',pays:'FR'}]);});
test('ciblage : permission Core organisationnelle requise',async()=>{const f=routeFixture({permission:false}),r=await f.execute('PUT',p.target,{body:{territoryId:3}});assert.equal(r.code,403);assert.equal(f.calls.length,0);});
test('ciblage : absence org du tenant refuse',async()=>{const f=routeFixture({org:false}),r=await f.execute('PUT',p.target,{body:{territoryId:3}});assert.equal(r.code,404);});
test('ciblage : pas de territoire arbitraire',async()=>{const f=routeFixture(),r=await f.execute('PUT',p.target,{body:{territoryId:'3'}});assert.equal(r.code,400);});
test('ciblage : source et acteur issus du Core',async()=>{const f=routeFixture(),r=await f.execute('PUT',p.target,{body:{territoryId:3,acteurId:999}});assert.equal(r.code,200);assert.deepEqual(f.calls[0][1],{organisationId:22,publicationId:33,territoryId:3,acteurId:11,tenant:'TEST_DIASPORA'});});
test('ciblage : retrait explicite de la zone',async()=>{const f=routeFixture(),r=await f.execute('PUT',p.target,{body:{territoryId:null}});assert.equal(r.code,200);assert.equal(f.calls[0][1].territoryId,null);});
test('ciblage : body absent refusé',async()=>{const f=routeFixture(),r=await f.execute('PUT',p.target);assert.equal(r.code,400);});
function dbFixture(row={id:33,tenant_id:9,organisation_id:22,statut:'PUBLIEE',statut_diffusion_diaspora:'NON_DEMANDEE',audience_type:'TOUS',medias:[]}){
 const calls=[],client={async query(sql,args){calls.push(sql);if(sql.includes('FROM publications p JOIN organisations o'))return{rowCount:1,rows:[row]};return {rowCount:1,rows:[{id:3}]};},release(){calls.push('RELEASE');}};
 return{calls,service:creerServiceGeoDiaspora({executerRequete:async()=>({rows:[]}),obtenirClientDatabase:async()=>client})};
}
test('service : transaction atomique et audit sur définition de zone',async()=>{const f=dbFixture(),x=await f.service.definirCible({organisationId:22,publicationId:33,territoryId:3,acteurId:11,tenant:'TEST_DIASPORA'});assert.equal(x.ok,true);assert.ok(f.calls.some(x=>x.includes('INSERT INTO diaspora_publication_geo_targets')));assert.ok(f.calls.some(x=>x.includes('INSERT INTO audit_trail')));assert.ok(f.calls.includes('COMMIT'));});
test('service : cible immuable après SOUMISE',async()=>{const f=dbFixture({id:33,tenant_id:9,organisation_id:22,statut:'PUBLIEE',statut_diffusion_diaspora:'SOUMISE',audience_type:'TOUS',medias:[]}),x=await f.service.definirCible({organisationId:22,publicationId:33,territoryId:3,acteurId:11,tenant:'TEST_DIASPORA'});assert.equal(x.code,'CIBLAGE_NON_MODIFIABLE');assert.ok(f.calls.includes('ROLLBACK'));assert.ok(!f.calls.some(x=>x.includes('INSERT INTO diaspora_publication_geo_targets')));});
test('service : médias exclus du ciblage',async()=>{const f=dbFixture({id:33,tenant_id:9,organisation_id:22,statut:'PUBLIEE',statut_diffusion_diaspora:'NON_DEMANDEE',audience_type:'TOUS',medias:[{}]}),x=await f.service.definirCible({organisationId:22,publicationId:33,territoryId:3,acteurId:11,tenant:'TEST_DIASPORA'});assert.equal(x.code,'CIBLAGE_NON_MODIFIABLE');});
const notif=fs.readFileSync(path.join(__dirname,'../diaspora-optin-notifications.js'),'utf8');
const suivies=fs.readFileSync(path.join(__dirname,'../diaspora-optin-service.js'),'utf8');
test('notifications : double opt-in thème/association et zone ciblée requis',()=>{assert.match(notif,/diaspora_geo_preferences gp/);assert.match(notif,/gp\.personne_id=s\.personne_id/);assert.match(notif,/geo_target\.publication_id IS NULL/);assert.match(notif,/s\.theme_code=p\.categorie/);assert.match(notif,/s\.association_id=o\.id/);});
test('notifications : quota et unique antérieurs conservés',()=>{assert.match(notif,/INTERVAL '24 hours'/);assert.match(notif,/ON CONFLICT DO NOTHING/);assert.match(notif,/PUBLICATION_CANAL/);});
test('fil suivi : ne révèle pas de contenu ciblé sans zone volontaire',()=>{assert.match(suivies,/geo_target\.publication_id IS NULL OR EXISTS/);assert.match(suivies,/gp\.personne_id=\$1::integer/);});
