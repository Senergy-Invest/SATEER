"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {creerRoutesSponsorDiaspora,creerRoutesMarquageSponsor}=require('../diaspora-sponsored-http');
const {creerServiceSponsorDiaspora}=require('../diaspora-sponsored-service');
function fixture({member=true,permitted=true,orgFound=true}={}){
 const urls=new Map(),calls=[];
 const router={get:(p,f)=>urls.set('GET '+p,f),put:(p,f)=>urls.set('PUT '+p,f)};
 const service={lireConsentement:async()=>({actif:false}),modifierConsentement:async(...a)=>{calls.push(['consent',...a]);return{ok:true,actif:a[2]};},
  definirSponsorisation:async x=>{calls.push(['mark',x]);return{ok:true,sponsorise:x.sponsorise};}};
 creerRoutesSponsorDiaspora({router,service,contexteCitoyen:async()=>member?9:null});
 creerRoutesMarquageSponsor({router,service,trouverOrganisation:async()=>orgFound?{id:22}:null,
  verifierPermission:async()=>({succes:true,autorise:permitted,portee:'ORGANISATION'})});
 async function send(method,url,{auth=101,body={},origin=null,tenant='TEST_RECETTE',params={}}={}){
  const req={method,query:{tenant},body,params:{organisationId:'22',publicationId:'201',...params},
    auth:auth?{personneId:auth}:null,get:()=>origin};
  const res={code:200,data:null,set(){return this;},status(x){this.code=x;return this;},json(x){this.data=x;return this;}};
  await urls.get(method+' '+url)(req,res);return res;
 }
 return{send,calls};
}
const p={get:'/sponsor-consent',put:'/sponsor-consent',mark:'/:organisationId/diaspora/sponsorisation/:publicationId'};
test('consentement absent par défaut',async()=>{const f=fixture(),r=await f.send('GET',p.get);assert.equal(r.code,200);assert.equal(r.data.actif,false)});
test('session obligatoire',async()=>{const f=fixture(),r=await f.send('GET',p.get,{auth:0});assert.equal(r.code,401)});
test('tenant fictif non accessible refusé',async()=>{const f=fixture({member:false}),r=await f.send('GET',p.get);assert.equal(r.code,403)});
test('tenant malformé refusé',async()=>{const f=fixture(),r=await f.send('GET',p.get,{tenant:'../'});assert.equal(r.code,400)});
test('consentement exige vrai booléen explicite',async()=>{const f=fixture(),r=await f.send('PUT',p.put,{body:{actif:1}});assert.equal(r.code,400)});
test('aucun opt-in par simple abonnement aux thèmes',async()=>{const f=fixture(),r=await f.send('GET',p.get);assert.equal(r.data.actif,false);assert.equal(f.calls.length,0)});
test('consentement dérive de personne session',async()=>{const f=fixture(),r=await f.send('PUT',p.put,{body:{actif:true,personneId:999}});assert.equal(r.code,200);assert.deepEqual(f.calls[0],['consent',101,'TEST_RECETTE',true]);});
test('retrait consentement',async()=>{const f=fixture(),r=await f.send('PUT',p.put,{body:{actif:false}});assert.equal(r.code,200);assert.equal(f.calls[0][3],false)});
test('origine externe refusée au choix',async()=>{const f=fixture(),r=await f.send('PUT',p.put,{body:{actif:true},origin:'https://malicious.test'});assert.equal(r.code,403)});
test('marquage sans droit Core interdit',async()=>{const f=fixture({permitted:false}),r=await f.send('PUT',p.mark,{body:{sponsorise:true}});assert.equal(r.code,403);assert.equal(f.calls.length,0)});
test('marquage org absente du tenant interdit',async()=>{const f=fixture({orgFound:false}),r=await f.send('PUT',p.mark,{body:{sponsorise:true}});assert.equal(r.code,404)});
test('marquage utilise uniquement org et acteur issus Core',async()=>{const f=fixture(),r=await f.send('PUT',p.mark,{body:{sponsorise:true,acteurId:999,sponsorOrganisationId:1000}});assert.equal(r.code,200);assert.deepEqual(f.calls[0][1],{organisationId:22,publicationId:201,acteurId:101,tenant:'TEST_RECETTE',sponsorise:true})});
test('marquage sans booléen refusé',async()=>{const f=fixture(),r=await f.send('PUT',p.mark,{body:{sponsorise:'true'}});assert.equal(r.code,400)});
test('marquage sans permission origine refusé',async()=>{const f=fixture(),r=await f.send('PUT',p.mark,{body:{sponsorise:true},origin:'https://out.test'});assert.equal(r.code,403)});
test('marquage id publication invalide refusé',async()=>{const f=fixture(),r=await f.send('PUT',p.mark,{body:{sponsorise:true},params:{publicationId:'xyz'}});assert.equal(r.code,400)});
function txFixture(row={id:201,tenant_id:9,organisation_id:22,statut:'PUBLIEE',statut_diffusion_diaspora:'NON_DEMANDEE',audience_type:'TOUS',medias:[],categorie:'EVENEMENT'}){
 const calls=[];let released=0;
 const db={async query(sql){calls.push(sql);if(sql.includes('FROM publications p JOIN organisations'))return {rowCount:1,rows:[row]};
  return{rowCount:1,rows:[{id:9}]};},release(){released++}};
 return {service:creerServiceSponsorDiaspora({executerRequete:async()=>({rows:[]}),obtenirClientDatabase:async()=>db}),calls,get released(){return released}};
}
test('déclaration sponsorisée est transactionnelle et auditée',async()=>{const f=txFixture(),r=await f.service.definirSponsorisation({organisationId:22,publicationId:201,acteurId:101,tenant:'TEST',sponsorise:true});
 assert.equal(r.ok,true);assert.ok(f.calls.some(x=>x.includes('INSERT INTO diaspora_sponsored_publications')));assert.ok(f.calls.some(x=>x.includes('INSERT INTO audit_trail')));assert.ok(f.calls.includes('COMMIT'));assert.equal(f.released,1)});
test('retrait du marquage avant soumission',async()=>{const f=txFixture(),r=await f.service.definirSponsorisation({organisationId:22,publicationId:201,acteurId:101,tenant:'TEST',sponsorise:false});
 assert.equal(r.ok,true);assert.ok(f.calls.some(x=>x.includes('DELETE FROM diaspora_sponsored_publications')))});
test('marquage immuable après SOUMISE',async()=>{const f=txFixture({id:201,tenant_id:9,organisation_id:22,statut:'PUBLIEE',statut_diffusion_diaspora:'SOUMISE',audience_type:'TOUS',medias:[],categorie:'EVENEMENT'});
 const r=await f.service.definirSponsorisation({organisationId:22,publicationId:201,acteurId:101,tenant:'TEST',sponsorise:true});
 assert.equal(r.code,'MARQUAGE_NON_MODIFIABLE');assert.ok(f.calls.includes('ROLLBACK'));
 assert.ok(!f.calls.some(x=>x.includes('INSERT INTO diaspora_sponsored_publications')))});
test('marquage rejette médias',async()=>{const f=txFixture({id:201,tenant_id:9,organisation_id:22,statut:'PUBLIEE',statut_diffusion_diaspora:'NON_DEMANDEE',audience_type:'TOUS',medias:[{}]});
 const r=await f.service.definirSponsorisation({organisationId:22,publicationId:201,acteurId:101,tenant:'TEST',sponsorise:true});assert.equal(r.code,'MARQUAGE_NON_MODIFIABLE')});
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('notification requiert consentement séparé, suivi, cible et quota',()=>{const s=read('diaspora-optin-notifications.js');assert.match(s,/diaspora_sponsor_optins so/);assert.match(s,/diaspora_subscriptions s/);assert.match(s,/diaspora_geo_preferences gp/);assert.match(s,/metadata->>'sponsorise'='true'/);assert.match(s,/INTERVAL '24 hours'/);assert.match(s,/PUBLICATION_CANAL/);assert.match(s,/ON CONFLICT DO NOTHING/);});
test('fil suivi filtre sponsorisation sans consentement',()=>{const s=read('diaspora-optin-service.js');assert.match(s,/sponsor_p\.publication_id IS NULL OR EXISTS/);assert.match(s,/so\.personne_id=\$1::integer/);});
test('fil général conserve l’étiquette explicite',()=>{const s=read('diaspora-feed-http.js');assert.match(s,/sponsorisee:mapSponsors\.has/);});
test('migration ne crée ni optin implicite ni compte',()=>{const s=read('database/049_diaspora_sponsor_consent.sql');assert.doesNotMatch(s,/INSERT INTO diaspora_sponsor_optins/i);assert.doesNotMatch(s,/INSERT INTO (personnes|auth_accounts|organisations)/i);assert.match(s,/sponsor_organisation_id=organisation_id/);});
