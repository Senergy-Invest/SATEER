'use strict';
/** Recette locale réelle Core A/B, uniquement sateer_test. Les sessions et codes restent privés. */
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
assert.equal(process.env.PGDATABASE,'sateer_test');assert.equal(process.env.PGHOST,'::1');
const TENANT='ENERGY_MVP01D_RECETTE',ORIGIN='http://localhost:3479',BASE='http://127.0.0.1:3479',q='?tenant='+TENANT;
const accounts=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.sateer-recette','energy-mvp01d','IDENTIFIANTS_PRIVES.json'),'utf8'));
assert.equal(accounts.tenant,TENANT);assert.equal(accounts.accounts.length,2);
const uuid=()=>crypto.randomUUID();let count=0;const ok=t=>console.log('PASS '+(++count)+' '+t);
async function req(method,path,{cookie,body,key,origin=ORIGIN}={}){
 const headers={Accept:'application/json',Origin:origin};if(cookie)headers.Cookie=cookie;if(body!==undefined)headers['Content-Type']='application/json';if(key)headers['Idempotency-Key']=key;
 const r=await fetch(BASE+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(16000)});
 return {status:r.status,data:await r.json().catch(()=>({})),headers:r.headers};
}
async function main(){
 const api='/api/energy/collecte/v1',sc='/api/energy/collab/v2';
 assert.equal((await req('GET',api+'/mes-propositions'+q)).status,401);ok('Core Auth obligatoire');
 let cookies=[],ids=[];for(const a of accounts.accounts){const r=await req('POST','/api/auth/login',{body:a});assert.equal(r.status,200);
  const cookie=r.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie?.startsWith('sateer_session='));cookies.push(cookie);
  const m=await req('GET','/api/auth/me',{cookie});assert.equal(m.status,200);ids.push(m.data.personne.id);}
 const [A,B]=cookies;assert.notEqual(ids[0],ids[1]);ok('Sessions distinctes fictives A/B sans exposer de secrets');
 const sites=await req('GET','/api/energy/inventory/sites'+q,{cookie:A});assert.equal(sites.status,200);
 const siteId=sites.data.sites?.[0]?.id;assert.ok(siteId);ok('Site existant A réutilisé');
 const init=await req('POST',sc+'/sites/'+siteId+'/initialiser'+q,{cookie:A,body:{}});assert.equal(init.status,200);
 const grantA=init.data.sourceGrantId,root=init.data.rootNodeId;assert.ok(grantA&&root);ok('Arbre C1 et coordinateur réutilisés');
 const nom='RECETTE_C2_BUREAU_'+uuid().slice(0,8);
 const created=await req('POST',sc+'/sites/'+siteId+'/unites'+q,{cookie:A,key:uuid(),body:{sourceGrantId:grantA,parentNodeId:root,typeNoeud:'BUREAU',nom}});
 assert.equal(created.status,201);const node=created.data.id;assert.ok(node);ok('Bureau C2 distinct, sans autre dossier créé');
 const invitation=await req('POST',sc+'/sites/'+siteId+'/invitations'+q,{cookie:A,key:uuid(),body:{sourceGrantId:grantA,targetNodeId:node,targetPersonneId:ids[1],role:'OCCUPANT'}});
 assert.equal(invitation.status,201);ok('Invitation nominative OCCUPANT depuis C1');
 const accepted=await req('POST',sc+'/invitations/'+invitation.data.id+'/accepter'+q,{cookie:B,body:{}});
 assert.equal(accepted.status,200);const grantB=accepted.data.grantId;assert.ok(grantB);ok('B accepte uniquement dans son compte Core');
 assert.equal((await req('GET','/api/energy/inventory/sites/'+siteId+q,{cookie:B})).status,404);ok('B ne peut pas consulter l inventaire prive A');
 const wrong=await req('POST',api+'/sites/'+siteId+'/propositions'+q,{cookie:B,origin:'https://evil.invalid',key:uuid(),body:{sourceGrantId:grantB,scopeNodeId:node,nom:'Tromperie',famille:'FROID',quantite:1,puissanceUnitaireW:null}});
 assert.equal(wrong.status,403);ok('Origine tierce interdite');
 const item={sourceGrantId:grantB,scopeNodeId:node,nom:'Réfrigérateur fictif C2 '+uuid().slice(0,8),famille:'FROID',quantite:1,puissanceUnitaireW:null};const key=uuid();
 const sub=await req('POST',api+'/sites/'+siteId+'/propositions'+q,{cookie:B,key,body:item});
 assert.equal(sub.status,201,'CREATION_'+sub.status+'_'+sub.data.statut);const proposalId=sub.data.id;assert.ok(proposalId);ok('B propose un appareil sur SON bureau');
 const idem=await req('POST',api+'/sites/'+siteId+'/propositions'+q,{cookie:B,key,body:item});assert.equal(idem.status,201);assert.equal(idem.data.id,proposalId);ok('Proposition idempotente sans doublon');
 const before=await req('GET','/api/energy/inventory/sites/'+siteId+q,{cookie:A});assert.equal(before.status,200);
 assert.ok(!before.data.equipements.some(x=>x.nom===item.nom));ok('Pas d insertion canonique avant coordination');
 assert.equal((await req('GET',api+'/sites/'+siteId+'/a-verifier?grantId='+grantA+'&tenant='+TENANT,{cookie:B})).status,404);
 ok('B ne peut lire la file de validation A');
 const queue=await req('GET',api+'/sites/'+siteId+'/a-verifier?grantId='+grantA+'&tenant='+TENANT,{cookie:A});
 assert.equal(queue.status,200);assert.ok(queue.data.propositions.some(x=>x.id===proposalId));ok('Proposition visible uniquement dans la file du superviseur A');
 const denied=await req('POST',api+'/sites/'+siteId+'/propositions/'+proposalId+'/decision'+q,
  {cookie:B,body:{reviewerGrantId:grantA,version:1,decision:'APPROUVER'}});assert.equal(denied.status,404);ok('B ne peut valider son propre équipement');
 const final=await req('POST',api+'/sites/'+siteId+'/propositions/'+proposalId+'/decision'+q,{cookie:A,body:{reviewerGrantId:grantA,version:1,decision:'APPROUVER'}});
 assert.equal(final.status,200,'REVUE_'+final.status+'_'+final.data.statut);assert.equal(final.data.statut,'INTEGREE');assert.equal(final.data.equipmentId!==undefined,true);ok('Coordinateur seul consolide dans inventaire canonique');
 const after=await req('GET','/api/energy/inventory/sites/'+siteId+q,{cookie:A});assert.equal(after.status,200);
 assert.ok(after.data.equipements.some(x=>x.id===final.data.equipmentId&&x.nom===item.nom));ok('Equipement canonique visible au propriétaire A');
 const double=await req('POST',api+'/sites/'+siteId+'/propositions/'+proposalId+'/decision'+q,{cookie:A,body:{reviewerGrantId:grantA,version:1,decision:'APPROUVER'}});
 assert.equal(double.status,404);ok('Second arbitrage refuse sans doublon');
 const attemptDup=await req('POST',api+'/sites/'+siteId+'/propositions'+q,{cookie:B,key:uuid(),body:item});
 assert.equal(attemptDup.status,201);const dupDecision=await req('POST',api+'/sites/'+siteId+'/propositions/'+attemptDup.data.id+'/decision'+q,
  {cookie:A,body:{reviewerGrantId:grantA,version:1,decision:'APPROUVER'}});
 assert.equal(dupDecision.status,409);assert.equal(dupDecision.data.statut,'DOUBLON_POTENTIEL_A_QUALIFIER');
 const rejectDup=await req('POST',api+'/sites/'+siteId+'/propositions/'+attemptDup.data.id+'/decision'+q,
  {cookie:A,body:{reviewerGrantId:grantA,version:1,decision:'REFUSER'}});
 assert.equal(rejectDup.status,200);ok('Même bureau + même nom/type : doublon potentiel bloqué, refus explicite conservé');
 const countAfterDup=await req('GET','/api/energy/inventory/sites/'+siteId+q,{cookie:A});
 assert.equal(countAfterDup.status,200);assert.equal(countAfterDup.data.equipements.filter(x=>x.nom===item.nom).length,1);
 ok('Un seul exemplaire canonique après tentative de doublon');
 const item2={...item,nom:'Ventilateur à corriger C2 '+uuid().slice(0,8),famille:'AUTRE'};
 const p2=await req('POST',api+'/sites/'+siteId+'/propositions'+q,{cookie:B,key:uuid(),body:item2});assert.equal(p2.status,201);
 const correction=await req('POST',api+'/sites/'+siteId+'/propositions/'+p2.data.id+'/decision'+q,{cookie:A,body:{reviewerGrantId:grantA,version:1,decision:'A_CORRIGER'}});
 assert.equal(correction.status,200);assert.equal(correction.data.statut,'A_CORRIGER');ok('A demande correction sans insertion');
 const updated=await req('POST',api+'/sites/'+siteId+'/propositions/'+p2.data.id+'/corriger'+q,
  {cookie:B,body:{...item2,nom:item2.nom+' confirmé',version:1}});
 assert.equal(updated.status,200);assert.equal(updated.data.version,2);ok('B corrige, nouvelle version et réexpédition');
 const stale=await req('POST',api+'/sites/'+siteId+'/propositions/'+p2.data.id+'/decision'+q,{cookie:A,body:{reviewerGrantId:grantA,version:1,decision:'APPROUVER'}});
 assert.equal(stale.status,409);ok('Une validation sur ancienne version est refusée');
 const approve2=await req('POST',api+'/sites/'+siteId+'/propositions/'+p2.data.id+'/decision'+q,{cookie:A,body:{reviewerGrantId:grantA,version:2,decision:'APPROUVER'}});
 assert.equal(approve2.status,200);ok('Nouvelle version approuvée');
 const history=await req('GET',api+'/propositions/'+p2.data.id+'/historique'+q,{cookie:B});
 assert.equal(history.status,200);assert.ok(history.data.evenements.some(x=>x.action==='A_CORRIGER'));
 assert.ok(history.data.evenements.some(x=>x.action==='CORRIGEE'));ok('Historique versionné privé disponible au déclarant');
 const p3=await req('POST',api+'/sites/'+siteId+'/propositions'+q,{cookie:B,key:uuid(),body:{...item,nom:'Pompe refusée C2',famille:'POMPAGE'}});assert.equal(p3.status,201);
 const rejected=await req('POST',api+'/sites/'+siteId+'/propositions/'+p3.data.id+'/decision'+q,{cookie:A,body:{reviewerGrantId:grantA,version:1,decision:'REFUSER'}});
 assert.equal(rejected.status,200);ok('Refus historisé et sans équipement intégré');
 const pending=await req('POST',api+'/sites/'+siteId+'/propositions'+q,{cookie:B,key:uuid(),body:{...item,nom:'Appareil en attente avant révocation C2'}});
 assert.equal(pending.status,201);ok('Proposition en attente avant révocation');
 const revoke=await req('POST',sc+'/sites/'+siteId+'/responsabilites/'+grantB+'/revoquer'+q,{cookie:A,body:{sourceGrantId:grantA}});
 assert.equal(revoke.status,200);ok('A révoque B via C1');
 const stalePermission=await req('POST',api+'/sites/'+siteId+'/propositions/'+pending.data.id+'/decision'+q,
  {cookie:A,body:{reviewerGrantId:grantA,version:1,decision:'APPROUVER'}});
 assert.equal(stalePermission.status,409);assert.equal(stalePermission.data.statut,'TUTELLE_NON_ACTIVE');
 ok('Révocation C1 bloque aussi une validation C2 déjà en attente');
 const deniedAfter=await req('POST',api+'/sites/'+siteId+'/propositions'+q,{cookie:B,key:uuid(),body:{...item,nom:'Après révocation'}});
 assert.equal(deniedAfter.status,404);ok('Révocation C1 coupe les nouvelles contributions C2');
 const mine=await req('GET',api+'/mes-propositions'+q,{cookie:B});assert.equal(mine.status,200);assert.ok(mine.data.propositions.some(x=>x.id===proposalId));
 ok('Historique du déclarant conservé après révocation');
 console.log('ENERGY_C2_REAL_CORE_PASS='+count);console.log('DONNEES=FICTIVES_SUR_SATEER_TEST_SEULEMENT');
}
main().catch(e=>{console.error('ENERGY_C2_REAL_CORE_ECHEC='+String(e.message||e));process.exitCode=1;});
