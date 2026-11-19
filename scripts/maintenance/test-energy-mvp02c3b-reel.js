'use strict';
/** Auth Core A/B fictive réelle, jamais d'identifiants dans le ZIP de rapport. */
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
assert.equal(process.env.PGDATABASE,'sateer_test');assert.equal(process.env.PGHOST,'::1');
const TENANT='ENERGY_MVP01D_RECETTE',ORIGIN='http://localhost:3481',BASE='http://127.0.0.1:3481',q='?tenant='+TENANT;
const credentials=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.sateer-recette','energy-mvp01d','IDENTIFIANTS_PRIVES.json'),'utf8'));
assert.equal(credentials.tenant,TENANT);assert.equal(credentials.accounts.length,2);
const uuid=()=>crypto.randomUUID();let n=0;const ok=x=>console.log('PASS '+(++n)+' '+x);
async function req(method,route,{cookie,body,key,origin=ORIGIN}={}){
 const headers={Accept:'application/json',Origin:origin};if(cookie)headers.Cookie=cookie;if(body!==undefined)headers['Content-Type']='application/json';if(key)headers['Idempotency-Key']=key;
 const r=await fetch(BASE+route,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 return {status:r.status,data:await r.json().catch(()=>({})),headers:r.headers};
}
function expect(r,status,context){assert.equal(r.status,status,context+' : '+r.status+' '+r.data?.statut);return r.data;}
async function main(){
 const api='/api/energy/catalogue-collab/v1',sc='/api/energy/collab/v2',c2='/api/energy/collecte/v1',c3='/api/energy/catalogue/v1';
 expect(await req('GET',api+'/mes-equipements-c2'+q),401,'Core Auth');ok('Authentification requise');
 const cookies=[],ids=[];
 for(const a of credentials.accounts){const r=await req('POST','/api/auth/login',{body:a});expect(r,200,'Connexion Core');
  cookies.push(r.headers.get('set-cookie')?.split(';')[0]);assert.ok(cookies.at(-1));const me=await req('GET','/api/auth/me',{cookie:cookies.at(-1)});
  expect(me,200,'Identité');ids.push(me.data.personne.id);}
 const [A,B]=cookies;assert.notEqual(ids[0],ids[1]);ok('A/B fictifs distincts');
 const sites=expect(await req('GET','/api/energy/inventory/sites'+q,{cookie:A}),200,'Sites');const siteId=sites.sites[0]?.id;assert.ok(siteId);ok('Site canonique existant');
 const init=expect(await req('POST',sc+'/sites/'+siteId+'/initialiser'+q,{cookie:A,body:{}}),200,'Scope');const root=init.rootNodeId,grantA=init.sourceGrantId;ok('Coordinateur A C1 existant');
 const nom='RECETTE_C3B_BUREAU_'+uuid().slice(0,8);
 const node=expect(await req('POST',sc+'/sites/'+siteId+'/unites'+q,{cookie:A,key:uuid(),body:{sourceGrantId:grantA,parentNodeId:root,typeNoeud:'BUREAU',nom}}),201,'Bureau').id;
 ok('Bureau de recette créé sans autre dossier');
 const invite=expect(await req('POST',sc+'/sites/'+siteId+'/invitations'+q,{cookie:A,key:uuid(),body:{sourceGrantId:grantA,targetNodeId:node,targetPersonneId:ids[1],role:'OCCUPANT'}}),201,'Invitation');
 const grantB=expect(await req('POST',sc+'/invitations/'+invite.id+'/accepter'+q,{cookie:B,body:{}}),200,'Acceptation').grantId;
 assert.ok(grantB);ok('Invitation ciblée B acceptée');
 expect(await req('GET','/api/energy/inventory/sites/'+siteId+q,{cookie:B}),404,'Isolation inventaire');ok('B ne voit pas inventaire privé A');
 const c2Body={sourceGrantId:grantB,scopeNodeId:node,nom:'Machine fictive C3B '+uuid().slice(0,8),famille:'MOTEUR',quantite:1,puissanceUnitaireW:null};
 const c2p=expect(await req('POST',c2+'/sites/'+siteId+'/propositions'+q,{cookie:B,key:uuid(),body:c2Body}),201,'Soumission C2').id;
 ok('B déclare la machine dans C2');
 const c2ok=expect(await req('POST',c2+'/sites/'+siteId+'/propositions/'+c2p+'/decision'+q,{cookie:A,
  body:{reviewerGrantId:grantA,version:1,decision:'APPROUVER'}}),200,'Integration C2');
 assert.equal(c2ok.statut,'INTEGREE');ok('A intègre l équipement dans le registre canonique C2');
 const my=expect(await req('GET',api+'/mes-equipements-c2'+q,{cookie:B}),200,'Liste C2');
 assert.ok(my.equipements.some(x=>x.c2ProposalId===c2p));ok('B retrouve seulement son équipement intégré');
 const unique='C3B'+uuid().slice(0,8);
 const d={sourceGrantId:grantB,c2ProposalId:c2p,famille:'MOTEUR',sousFamille:'Compresseur industriel',
  designation:'Machine pilote C3B '+unique,marque:'FabricantTest',modele:unique,puissanceNominaleW:null,tensionV:null};
 expect(await req('POST',api+'/sites/'+siteId+'/propositions'+q,{cookie:B,origin:'https://evil.invalid',key:uuid(),body:d}),403,'Origin');
 ok('Origine tierce refusée');
 expect(await req('POST',api+'/sites/'+siteId+'/propositions'+q,{cookie:B,key:uuid(),body:{...d,owner:ids[0]}}),400,'Champ injecte');
 ok('Champs d autorisation injectés refusés');
 const key=uuid(),first=expect(await req('POST',api+'/sites/'+siteId+'/propositions'+q,{cookie:B,key,body:d}),201,'Candidate B');
 const p=first.id;assert.ok(p);ok('B soumet sa référence technique');
 const idem=expect(await req('POST',api+'/sites/'+siteId+'/propositions'+q,{cookie:B,key,body:d}),201,'Idempotence');
 assert.equal(idem.id,p);ok('Une clé de requête ne crée pas de doublon');
 expect(await req('GET',api+'/sites/'+siteId+'/a-verifier?grantId='+grantA+'&tenant='+TENANT,{cookie:B}),404,'File A');
 ok('B ne voit pas la file de A');
 const queue=expect(await req('GET',api+'/sites/'+siteId+'/a-verifier?grantId='+grantA+'&tenant='+TENANT,{cookie:A}),200,'File');
 assert.ok(queue.propositions.some(x=>x.id===p));ok('A voit la proposition dans sa file');
 expect(await req('POST',api+'/sites/'+siteId+'/propositions/'+p+'/decision'+q,{cookie:B,body:{reviewerGrantId:grantA,version:1,decision:'APPROUVER',referenceId:null}}),404,'B valide A');
 ok('B ne valide pas sa propre fiche');
 const correction=expect(await req('POST',api+'/sites/'+siteId+'/propositions/'+p+'/decision'+q,{cookie:A,
  body:{reviewerGrantId:grantA,version:1,decision:'A_CORRIGER',referenceId:null}}),200,'Correction demandée');
 assert.equal(correction.statut,'A_CORRIGER');ok('A demande une correction sans créer de modèle');
 const revised=expect(await req('POST',api+'/sites/'+siteId+'/propositions/'+p+'/corriger'+q,{cookie:B,
  body:{version:1,famille:d.famille,sousFamille:d.sousFamille,designation:d.designation+' corrigée',marque:d.marque,
   modele:d.modele,puissanceNominaleW:2200,tensionV:400}}),200,'Correction B');
 assert.equal(revised.version,2);ok('B renvoie une version 2');
 expect(await req('POST',api+'/sites/'+siteId+'/propositions/'+p+'/decision'+q,{cookie:A,
  body:{reviewerGrantId:grantA,version:1,decision:'APPROUVER',referenceId:null}}),409,'Version obsolète');
 ok('Validation version 1 refusée');
 const transferred=expect(await req('POST',api+'/sites/'+siteId+'/propositions/'+p+'/decision'+q,{cookie:A,
  body:{reviewerGrantId:grantA,version:2,decision:'APPROUVER',referenceId:null}}),200,'C3A candidate');
 assert.equal(transferred.statut,'EN_CATALOGUE');assert.ok(transferred.referenceId);ok('Coordinateur crée une candidate C3A non référencée');
 const c3a=expect(await req('GET',c3+'/sites/'+siteId+'/references'+q,{cookie:A}),200,'Liste C3A');
 assert.ok(c3a.references.some(x=>x.id===transferred.referenceId&&x.statut==='CANDIDATE'));
 ok('C3A exige encore une seconde décision de référencement');
 expect(await req('GET',c3+'/sites/'+siteId+'/references'+q,{cookie:B}),404,'C3A B');ok('B ne lit pas le catalogue privé A');
 expect(await req('POST',c3+'/sites/'+siteId+'/references/'+transferred.referenceId+'/decision'+q,{cookie:B,body:{decision:'REFERENCER'}}),404,'C3A B décision');
 ok('B ne référence pas un modèle');
 const approved=expect(await req('POST',c3+'/sites/'+siteId+'/references/'+transferred.referenceId+'/decision'+q,{cookie:A,
  body:{decision:'REFERENCER'}}),200,'Référencement humain A');assert.equal(approved.statut,'REFERENCE_INTERNE');
 ok('A référence manuellement après C3B');
 const duplicate=expect(await req('POST',api+'/sites/'+siteId+'/propositions'+q,{cookie:B,key:uuid(),body:{...d,designation:'Autre machine '+unique}}),201,'Doublon candidat');
 const conflict=expect(await req('POST',api+'/sites/'+siteId+'/propositions/'+duplicate.id+'/decision'+q,{cookie:A,
  body:{reviewerGrantId:grantA,version:1,decision:'APPROUVER',referenceId:null}}),409,'Doublon modèle');
 assert.equal(conflict.statut,'MODELE_EXISTANT_A_RAPPROCHER');ok('Même modèle : rapprochement demandé sans doublon C3A');
 const match=expect(await req('POST',api+'/sites/'+siteId+'/propositions/'+duplicate.id+'/decision'+q,{cookie:A,
  body:{reviewerGrantId:grantA,version:1,decision:'RAPPROCHER',referenceId:transferred.referenceId}}),200,'Rapprochement manuel');
 assert.equal(match.statut,'RAPPROCHEE');ok('A rapproche sans copier de photos ni attribuer un passeport');
 const events=expect(await req('GET',api+'/propositions/'+p+'/historique'+q,{cookie:B}),200,'Historique B');
 assert.ok(events.evenements.some(x=>x.action==='A_CORRIGER')&&events.evenements.some(x=>x.action==='CORRIGEE'));
 ok('Historique versionné conservé pour le collaborateur');
 const pending=expect(await req('POST',api+'/sites/'+siteId+'/propositions'+q,{cookie:B,key:uuid(),body:{...d,modele:'PENDING'+unique}}),201,'En attente');
 expect(await req('POST',sc+'/sites/'+siteId+'/responsabilites/'+grantB+'/revoquer'+q,{cookie:A,body:{sourceGrantId:grantA}}),200,'Revoke B');
 ok('A révoque le droit C1 de B');
 const stale=expect(await req('POST',api+'/sites/'+siteId+'/propositions/'+pending.id+'/decision'+q,{cookie:A,
  body:{reviewerGrantId:grantA,version:1,decision:'APPROUVER',referenceId:null}}),409,'Revue après révocation');
 assert.equal(stale.statut,'TUTELLE_NON_ACTIVE');ok('Révocation bloque aussi validation technique en attente');
 const invalid=expect(await req('POST',api+'/sites/'+siteId+'/propositions'+q,{cookie:B,key:uuid(),body:{...d,modele:'AprèsRevocation'}}),409,'Soumission B révoqué');
 assert.equal(invalid.statut,'TUTELLE_NON_ACTIVE');ok('B ne soumet rien après révocation');
 const last=expect(await req('GET',api+'/mes-propositions'+q,{cookie:B}),200,'Historique B conserve');
 assert.ok(last.propositions.some(x=>x.id===p));ok('Historique personnel conservé');
 console.log('C3B_CORE_A_B_PASS='+n);console.log('DONNEES=SYNTHESE_SATEER_TEST_SEULEMENT');
}
main().catch(e=>{console.error('C3B_E2E_ECHEC',e.code||e.message);process.exitCode=1;});
