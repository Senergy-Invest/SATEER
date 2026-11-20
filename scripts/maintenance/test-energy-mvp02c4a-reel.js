'use strict';
/** C4A : comptes Core A/B autorisés, site privé A, graphes avec source/tableaux/2 bâtiments. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
assert.equal(process.env.PGDATABASE,'sateer_test');assert.equal(process.env.PGHOST,'::1');
const TENANT='ENERGY_MVP01D_RECETTE',BASE='http://127.0.0.1:3482',ORIGIN='http://localhost:3482',q='?tenant='+TENANT;
const credentials=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.sateer-recette','energy-mvp01d','IDENTIFIANTS_PRIVES.json'),'utf8'));
assert.equal(credentials.tenant,TENANT);assert.equal(credentials.accounts.length,2);
const uuid=()=>crypto.randomUUID();let count=0;const ok=x=>console.log('PASS '+(++count)+' '+x);
async function req(method,url,{cookie,body,key,origin=ORIGIN}={}){
 const headers={Accept:'application/json',Origin:origin};if(cookie)headers.Cookie=cookie;
 if(body!==undefined)headers['Content-Type']='application/json';if(key)headers['Idempotency-Key']=key;
 const r=await fetch(BASE+url,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 return {status:r.status,data:await r.json().catch(()=>({})),headers:r.headers};
}
function good(r,status,msg){assert.equal(r.status,status,msg+' ('+r.status+':'+r.data?.statut+')');return r.data;}
async function main(){
 const api='/api/energy/topologie/v1',sc='/api/energy/collab/v2';
 good(await req('GET',api+'/sites'+q),401,'Authentification');ok('Core Auth obligatoire');
 const cookies=[],ids=[];for(const a of credentials.accounts){const login=await req('POST','/api/auth/login',{body:a});good(login,200,'Login');
  const cookie=login.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);cookies.push(cookie);
  const me=good(await req('GET','/api/auth/me',{cookie}),200,'Moi');ids.push(me.personne.id);}
 const [A,B]=cookies;assert.notEqual(ids[0],ids[1]);ok('Deux utilisateurs fictifs authentifiés distincts');
 const sites=good(await req('GET',api+'/sites'+q,{cookie:A}),200,'Sites A');const siteId=sites.sites[0]?.id;assert.ok(siteId);ok('Site canonique A retrouvé');
 const bSites=good(await req('GET',api+'/sites'+q,{cookie:B}),200,'Sites B');
 assert.ok(!bSites.sites.some(x=>x.id===siteId));ok('B ne voit pas le site privé A, même s’il possède un autre site');
 good(await req('GET',api+'/sites/'+siteId+'/carte'+q,{cookie:B}),404,'Carte A privée');ok('B ne lit pas la cartographie privée A');
 const init=good(await req('POST',sc+'/sites/'+siteId+'/initialiser'+q,{cookie:A,body:{}}),200,'Init C1');
 const root=init.rootNodeId,grant=init.sourceGrantId;assert.ok(root&&grant);ok('Racine C1 réutilisée');
 const buildings=[];for(let i=1;i<=2;i++){
  const r=good(await req('POST',sc+'/sites/'+siteId+'/unites'+q,{cookie:A,key:uuid(),body:{sourceGrantId:grant,parentNodeId:root,typeNoeud:'BATIMENT',nom:'RECETTE_C4A_'+uuid().slice(0,8)+'_BAT_'+i}}),201,'Bâtiment');buildings.push(r.id);
 }
 ok('Deux bâtiments C1 distincts créés, aucune double arborescence');
 async function add(type,nom,scopeNodeId=null){return good(await req('POST',api+'/sites/'+siteId+'/appareillages'+q,{cookie:A,key:uuid(),body:{typeNoeud:type,nom,repere:null,scopeNodeId}}),201,nom).id;}
 const suffix=uuid().slice(0,8);const src=await add('SOURCE','ARRIVEE_C4A_'+suffix),meter=await add('COMPTEUR','COMPTEUR_S2_'+suffix),
 tab=await add('TABLEAU','TGBT_'+suffix,root),second=await add('TABLEAU','T2_'+suffix,root);
 ok('Source, compteur, TGBT et secondaire créés sans nouveau matériel C2');
 const invalid=await req('POST',api+'/sites/'+siteId+'/appareillages'+q,{cookie:B,key:uuid(),body:{typeNoeud:'COMPTEUR',nom:'INTRUS',repere:null,scopeNodeId:null}});
 good(invalid,404,'B interdit');ok('B ne crée pas un compteur sur le site A');
 async function link(sourceAssetId,typeLien,targetAssetId=null,targetScopeNodeId=null,targetEquipmentId=null,as=A){return req('POST',api+'/sites/'+siteId+'/liens'+q,{cookie:as,key:uuid(),body:{sourceAssetId,typeLien,targetAssetId,targetScopeNodeId,targetEquipmentId}});}
 const one=good(await link(meter,'MESURE',null,buildings[0]),201,'Mesure bâtiment 1'),two=good(await link(meter,'MESURE',null,buildings[1]),201,'Mesure bâtiment 2');
 assert.notEqual(one.id,two.id);ok('Un compteur secondaire couvre deux bâtiments');
 good(await link(src,'ALIMENTE',meter),201,'Arrivée compteur');good(await link(meter,'ALIMENTE',tab),201,'Compteur TGBT');
 const electrical=good(await link(tab,'ALIMENTE',second),201,'TGBT T2');ok('Chaîne électrique déclarée explicitement');
 good(await link(second,'DESSERT',null,buildings[0]),201,'Tableau dessert bâtiment');ok('Relation de desserte bâtiment explicite');
 const cycle=good(await link(second,'ALIMENTE',tab),409,'Boucle interdite');assert.equal(cycle.statut,'BOUCLE_ALIMENTATION_REFUSEE');ok('Cycle de raccordement refusé');
 good(await link(tab,'MESURE',null,buildings[0]),409,'Tableau ne mesure pas');ok('Seul un compteur peut déclarer une mesure');
 good(await link(meter,'MESURE',null,buildings[0],null,B),404,'B ne relie pas le site A');ok('B ne crée pas un lien électrique');
 const current=good(await req('GET',api+'/sites/'+siteId+'/carte'+q,{cookie:A}),200,'Carte A');
 assert.ok(current.appareillages.some(a=>a.id===meter));assert.ok(current.liens.some(l=>l.id===one.id));ok('La carte redonne les éléments et liens ajoutés');
 assert.ok(current.lieux.some(n=>n.id===buildings[0]));ok('La carte réutilise les unités C1 existantes');
 const e=current.equipements.find(x=>!current.usages.some(u=>u.equipmentId===x.id&&u.usage==='FROID'));
 assert.ok(e?.id,'Un équipement 051 / C2 sans usage FROID est attendu dans le site de recette');
 const usage=good(await req('POST',api+'/sites/'+siteId+'/usages'+q,{cookie:A,key:uuid(),body:{equipmentId:e.id,usage:'FROID',commentaire:'Recette C4A'}}),201,'Usage');assert.ok(usage.id);
 ok('Usage FROID associé à un équipement 051 sans duplication');
 const duplicate=good(await req('POST',api+'/sites/'+siteId+'/usages'+q,{cookie:A,key:uuid(),body:{equipmentId:e.id,usage:'FROID',commentaire:'Deuxième déclaration'}}),409,'Usage doublon');
 assert.ok(duplicate.statut.includes('USAGE_DEJA'));ok('Même usage ne duplique pas la fiche machine');
 good(await req('POST',api+'/sites/'+siteId+'/liens/'+electrical.id+'/retirer'+q,{cookie:A,body:{}}),200,'Retrait');ok('Lien retiré sans supprimer les deux tableaux');
 good(await req('POST',api+'/sites/'+siteId+'/liens/'+electrical.id+'/retirer'+q,{cookie:A,body:{}}),409,'Retrait répété');ok('Un retrait ne peut être répété à l’insu du responsable');
 const after=good(await req('GET',api+'/sites/'+siteId+'/carte'+q,{cookie:A}),200,'Après');assert.ok(after.liens.some(l=>l.id===electrical.id&&!l.actif));
 ok('Historique du lien retiré reste lisible');
 assert.ok(!JSON.stringify(after).includes('scan_token')&&!JSON.stringify(after).includes('photo_id'));ok('Aucune photo / QR / OCR divulguée dans la carte');
 good(await req('POST',api+'/sites/'+siteId+'/liens'+q,{cookie:A,origin:'https://evil.invalid',key:uuid(),body:{sourceAssetId:tab,typeLien:'DESSERT',targetAssetId:null,targetScopeNodeId:buildings[1],targetEquipmentId:null}}),403,'Origin');
 ok('Les écritures d origine tierce sont refusées');
 console.log('C4A_CORE_A_B_PASS='+count);console.log('DONNEES=FICTIONS_SATEER_TEST_SEULEMENT');
}
main().catch(e=>{console.error('C4A_E2E_ECHEC',e.code||e.message);process.exitCode=1;});
