'use strict';
/** Deux sessions Core fictives A et B, 7 niveaux, refus hors branche et revocation.
 * Toutes les creations restent dans sateer_test et sont etiquetees RECETTE_FICTIVE.
 */
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
assert.equal(process.env.PGDATABASE,'sateer_test');assert.equal(process.env.PGHOST,'::1');
const TENANT='ENERGY_MVP01D_RECETTE',O='http://localhost:3477',BASE='http://127.0.0.1:3477',q='?tenant='+TENANT;
const accounts=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.sateer-recette','energy-mvp01d','IDENTIFIANTS_PRIVES.json'),'utf8'));
assert.equal(accounts.tenant,TENANT);assert.equal(accounts.accounts.length,2);let count=0;
const ok=t=>console.log('PASS '+(++count)+' '+t);
async function req(method,route,{cookie,body,key,origin=O}={}){
 const h={'Accept':'application/json','Origin':origin};if(cookie)h.Cookie=cookie;if(body!==undefined)h['Content-Type']='application/json';if(key)h['Idempotency-Key']=key;
 const r=await fetch(BASE+route,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(14000)});
 return {status:r.status,data:await r.json().catch(()=>({})),headers:r.headers};
}
async function main(){let cookies=[],people=[];const api='/api/energy/collab/v2';
 assert.equal((await req('GET',api+'/mes-invitations'+q)).status,401);ok('Core authentification obligatoire');
 for(const acc of accounts.accounts){const r=await req('POST','/api/auth/login',{body:acc});assert.equal(r.status,200);
  const c=r.headers.get('set-cookie')?.split(';')[0];assert.ok(c?.startsWith('sateer_session='));cookies.push(c);
  const m=await req('GET','/api/auth/me',{cookie:c});assert.equal(m.status,200);people.push(m.data.personne.id);}
 const [A,B]=cookies;assert.notEqual(people[0],people[1]);ok('Deux comptes reels Core A/B, personneId issu serveur');
 const sites=await req('GET','/api/energy/inventory/sites'+q,{cookie:A});assert.equal(sites.status,200);
 const siteId=sites.data.sites?.[0]?.id;assert.ok(siteId);ok('Site Energy existant recupere sans duplication');
 const forbidden=await req('POST',api+'/sites/'+siteId+'/initialiser'+q,{cookie:B,body:{}});assert.equal(forbidden.status,404);ok('B ne peut creer organisation de A');
 const init=await req('POST',api+'/sites/'+siteId+'/initialiser'+q,{cookie:A,body:{}});assert.equal(init.status,200);
 const root=init.data.rootNodeId,grantA=init.data.sourceGrantId;assert.ok(root&&grantA);ok('Responsable A initialise arbre unique');
 const same=await req('POST',api+'/sites/'+siteId+'/initialiser'+q,{cookie:A,body:{}});assert.equal(same.status,200);
 assert.equal(same.data.rootNodeId,root);ok('Reprise idempotente, meme racine');
 async function unit(cookie,grant,parent,nom){return req('POST',api+'/sites/'+siteId+'/unites'+q,{cookie,key:crypto.randomUUID(),body:{sourceGrantId:grant,parentNodeId:parent,typeNoeud:'ZONE',nom}});}
 const marker='RECETTE_C1_'+crypto.randomUUID().slice(0,7);
 const north=await unit(A,grantA,root,marker+'_NORD');assert.equal(north.status,201);const northId=north.data.id;
 const south=await unit(A,grantA,root,marker+'_SUD');assert.equal(south.status,201);ok('Deux branches soeurs distinctes');
 const noInv=await req('POST',api+'/sites/'+siteId+'/invitations'+q,{cookie:B,key:crypto.randomUUID(),body:{sourceGrantId:grantA,targetNodeId:northId,targetPersonneId:people[1],role:'RESPONSABLE'}});
 assert.equal(noInv.status,404);ok('B ne peut usurper attribution du coordinateur');
 const sent=await req('POST',api+'/sites/'+siteId+'/invitations'+q,{cookie:A,key:crypto.randomUUID(),body:{sourceGrantId:grantA,targetNodeId:northId,targetPersonneId:people[1],role:'RESPONSABLE'}});
 assert.equal(sent.status,201);const invitation=sent.data.id;ok('Invitation nominative vers B, sans token public');
 const inboxA=await req('GET',api+'/mes-invitations'+q,{cookie:A});assert.equal(inboxA.status,200);
 assert.ok(!(inboxA.data.invitations||[]).some(x=>x.id===invitation));ok('A ne voit pas invitation ciblee B');
 const inboxB=await req('GET',api+'/mes-invitations'+q,{cookie:B});assert.equal(inboxB.status,200);
 assert.ok(inboxB.data.invitations.some(x=>x.id===invitation));ok('B voit invitation dans son propre compte');
 const accept=await req('POST',api+'/invitations/'+invitation+'/accepter'+q,{cookie:B,body:{}});assert.equal(accept.status,200);
 const grantB=accept.data.grantId;assert.ok(grantB);ok('B accepte sans partager mot de passe');
 let parent=northId;for(let i=0;i<6;i++){const next=await unit(B,grantB,parent,marker+'_LOCAL_'+i);assert.equal(next.status,201);parent=next.data.id;}
 ok('B construit six sous-niveaux successifs sans niveau fixe');
 assert.equal((await unit(B,grantB,south.data.id,marker+'_FORBIDDEN')).status,404);ok('Sous-unite soeur inaccessible a B');
 const listing=await req('GET',api+'/sites/'+siteId+'/arbre?grantId='+grantB+'&tenant='+TENANT,{cookie:B});
 assert.equal(listing.status,200);assert.ok(listing.data.unites.length>=7);
 assert.ok(!listing.data.unites.some(x=>x.id===south.data.id));ok('B voit seulement son sous-arbre, pas la branche soeur');
 const loop=await req('POST',api+'/sites/'+siteId+'/invitations'+q,{cookie:B,key:crypto.randomUUID(),body:{sourceGrantId:grantB,targetNodeId:parent,targetPersonneId:people[0],role:'RESPONSABLE'}});
 assert.equal(loop.status,409);ok('Boucle humaine A -> B -> A refusee');
 const rev=await req('POST',api+'/sites/'+siteId+'/responsabilites/'+grantB+'/revoquer'+q,{cookie:A,body:{sourceGrantId:grantA}});
 assert.equal(rev.status,200);ok('A revoque la responsabilite de B');
 const mineB=await req('GET',api+'/mes-responsabilites'+q,{cookie:B});assert.equal(mineB.status,200);
 assert.ok(!mineB.data.responsabilites.some(x=>x.id===grantB));ok('Attribution de B n est plus active');
 assert.equal((await unit(B,grantB,northId,marker+'_APRES_REVOK')).status,404);ok('B ne peut plus deleguer apres revocation');
 const reb=await req('POST',api+'/invitations/'+invitation+'/accepter'+q,{cookie:B,body:{}});assert.equal(reb.status,409);ok('Invitation acceptee ne reactive pas un grant revoque');
 assert.equal((await req('GET','/api/energy/inventory/sites/'+siteId+q,{cookie:B})).status,404);ok('Aucun acces aux equipements prives A');
 console.log('ENERGY_SCOPE_REAL_CORE_PASS='+count);console.log('DONNEES=RECETTE_FICTIVE_DANS_SATEER_TEST_SEULEMENT');
}
main().catch(e=>{console.error('ENERGY_SCOPE_REAL_CORE_ECHEC='+String(e.message||e));process.exitCode=1;});
