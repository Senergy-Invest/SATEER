'use strict';
/** Contrats unitaires MVP02-B1 sans base ni identifiants. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {UUID,CODE,proposition,revue,nouveauCode,digestCode}=require('../energy/energy-collaboration-domain');
const {creerEnergyCollaborationRouter}=require('../energy/energy-collaboration-http');
const {creerEnergyCollaborationStore}=require('../energy/energy-collaboration-store');
const file=x=>fs.readFileSync(path.join(__dirname,'..',x),'utf8');
const SITE='213daab7-f401-4eb6-9838-64da10dc6d54';
const INV='74950f8c-f0a8-4d18-a045-ed03db993835';
const BODY={nom:' Mon réfrigérateur ',famille:'FROID',quantite:1,puissanceUnitaireW:null};
const TOKEN='scb_'+'a'.repeat(32);
test('Une proposition simple conserve les champs métier, sans identité ou droits',()=>{
 assert.deepEqual(proposition(BODY),{...BODY,nom:'Mon réfrigérateur'});
 assert.equal(proposition({...BODY,ownerPersonneId:1}),null);
 assert.equal(proposition({...BODY,tenant:'EXTERNE'}),null);
});
test('Refus champs non valides, puissance zéro, quantité nulle et injection',()=>{
 for(const body of [{...BODY,quantite:0},{...BODY,quantite:1.5},{...BODY,puissanceUnitaireW:0},
  {...BODY,nom:'\n'}, {...BODY,nom:'x'.repeat(121)}, {...BODY,famille:'SECRET'},{...BODY,puissanceUnitaireW:'120'}])assert.equal(proposition(body),null);
});
test('La puissance reste facultative et un appareil est déclaratif',()=>{
 assert.equal(proposition({nom:'Pompe',famille:'POMPAGE',quantite:2}).puissanceUnitaireW,null);
 assert.equal(proposition({nom:'Pompe',famille:'POMPAGE',quantite:2,puissanceUnitaireW:120}).puissanceUnitaireW,120);
});
test('Arbitrage explicite, valeurs inconnues refusées',()=>{
 assert.equal(revue({decision:'ACCEPTER'}),'ACCEPTER');assert.equal(revue({decision:'REFUSER'}),'REFUSER');
 assert.equal(revue({decision:'ACCEPTER',role:'administrateur'}),null);assert.equal(revue({decision:'MESURER'}),null);
});
test('Code secret long, distinct par invitation, condensat non réversible',()=>{
 const a=nouveauCode(),b=nouveauCode();assert.ok(CODE.test(a));assert.ok(CODE.test(b));assert.notEqual(a,b);
 assert.match(digestCode(a),/^[a-f0-9]{64}$/);assert.notEqual(digestCode(a),a);assert.notEqual(digestCode(a),digestCode(b));
});
test('Identifiant UUID et code contrôlés séparément',()=>{
 assert.equal(UUID.test(SITE),true);assert.equal(CODE.test(TOKEN),true);
 assert.equal(CODE.test(SITE),false);assert.equal(UUID.test(TOKEN),false);
});
const sql=file('database/054_energy_inventory_collaboration.sql');
test('Migration refuse toute base autre que sateer_test',()=>assert.match(sql,/current_database\(\) <> 'sateer_test'/));
test('FK composées tenant/owner/site/invitation/contributeur',()=>{
 for(const x of ['fk_collab_invite_site_scope','fk_collab_contribution_invite_scope','fk_collab_contributor_accepted_invite','fk_collab_contribution_equipment_scope'])assert.ok(sql.includes(x));
});
test('Invitation à usage unique, horodatée, liée à une personne et révocable',()=>{
 for(const x of ['token_hash CHAR(64)','invitee_personne_id','date_revocation','expires_at TIMESTAMPTZ','uq_collab_invite_assignee'])assert.ok(sql.includes(x));
});
test('Une proposition acceptée doit avoir une décision et un équipement canonique',()=>{
 assert.match(sql,/ck_collab_decision_coherente/);assert.match(sql,/statut='ACCEPTEE' AND equipment_id IS NOT NULL/);
});
test('Événements append-only et référencement propriétaire',()=>{
 for(const x of ['ContributionSubmitted.v1','ContributionAccepted.v1','ContributionRejected.v1','fk_collab_event_site'])assert.ok(sql.includes(x));
});
test('Le store interdit une mutation canonique avant arbitrage',()=>{
 const s=file('energy/energy-collaboration-store.js');
 assert.match(s,/async function submit\(/);assert.match(s,/async function review\(/);
 const submit=s.slice(s.indexOf('async function submit('),s.indexOf('function contributionDTO'));
 assert.doesNotMatch(submit,/INSERT INTO energy_inventory_equipements/);
});
test('La révision tient un verrou et une clé de requête idempotente',()=>{
 const s=file('energy/energy-collaboration-store.js');assert.match(s,/c\.public_id=\$4::uuid FOR UPDATE/);
 assert.match(s,/ON CONFLICT\(site_id,owner_personne_id,request_key\) DO NOTHING/);
 assert.match(s,/CONTRIBUTION_COLLISION_CANONIQUE/);
});
test('Un contributeur n’obtient ni photo, ni passeport, ni liste complète du site',()=>{
 const s=file('energy/energy-collaboration-http.js');
 assert.doesNotMatch(s,/\/api\/energy\/passports|\/api\/energy\/labels|\/api\/energy\/inventory\/sites/);
 assert.doesNotMatch(s,/router\.get\('\/sites\/:siteId\/equipements'/);
});
test('Page collaborative distincte, mobile et non institutionnelle',()=>{
 const html=file('public/inventaire-participatif.html'),css=file('public/inventaire-participatif.css');
 for(const x of ['id="creerInvitation"','id="copierLien"','id="formCode"','id="formProposition"','id="listePropositions"','id="mesPropositions"','auth-client.js'])assert.ok(html.includes(x));
 assert.match(css,/@media\(max-width:570px\)/);assert.match(css,/:focus-visible/);
 assert.doesNotMatch(html,/<input[^>]*type="file"/i);
});
test('Le navigateur garde uniquement le code courant en mémoire et consulte la session Core',()=>{
 const s=file('public/inventaire-participatif.js');assert.match(s,/window\.SATEER_CONTEXT_READY/);
 assert.match(s,/credentials:'same-origin'/);assert.doesNotMatch(s,/localStorage|sessionStorage|document\.cookie/);
 assert.doesNotMatch(s,/fetch\(['"]https?:/);
});
test('Navigation vers la collaboration réservée au site effectivement chargé',()=>{
 const s=file('public/inventaire-energie.js');assert.match(s,/lienCollaboration/);
 assert.match(s,/if \(\$\('lienCollaboration'\)\)/);
});
function fixture({member=true,auth={personneId:9}}={}){
 const routes={},counts={store:0,member:0};
 const router={use(){},get(p,f){routes['GET '+p]=f;},post(p,f){routes['POST '+p]=f;}};
 const baseStore={createInvite:async()=>({code:'OK',invitation:{id:INV},codeInvitation:TOKEN}),
   listOwnerInvites:async()=>({invitations:[]}),acceptInvite:async()=>({code:'OK',invitation:{id:INV}}),
   revokeInvite:async()=>({code:'OK'}),listParticipations:async()=>({participations:[]}),
   submit:async()=>({code:'OK',nouvelle:true,id:INV}),listOwnProposals:async()=>({contributions:[]}),
   listOwnerProposals:async()=>({contributions:[]}),review:async()=>({code:'OK',statut:'ACCEPTEE'})};
 const store=Object.fromEntries(Object.entries(baseStore).map(([k,v])=>[k,async(...args)=>{counts.store++;return v(...args);}]));
 creerEnergyCollaborationRouter({router,listerOrganisations:async()=>{counts.member++;return member?[{tenant_code:'ENERGY_MVP01D_RECETTE'}]:[];},
    store,origineAutorisee:'http://localhost:3476',tenantAutorise:'ENERGY_MVP01D_RECETTE'});
 async function req(method,route,{actor=auth,tenant='ENERGY_MVP01D_RECETTE',origin='http://localhost:3476',body={},params={},key}={}){
  let status=200,json,headers={};const request={method,auth:actor,query:{tenant},params:{siteId:SITE,invitationId:INV,contributionId:INV,...params},
    body,get:x=>x==='Origin'?origin:x==='Idempotency-Key'?key:null};
  const response={set(k,v){headers[k]=v;return this;},status(code){status=code;return this;},json(obj){json=obj;return this;}};
  assert.ok(routes[method+' '+route]);await routes[method+' '+route](request,response);return {status,json,headers};
 }
 return {req,counts};
}
test('Sans session Core : 401 avant toute lecture de base',async()=>{
 const f=fixture();const r=await f.req('POST','/sites/:siteId/invitations',{actor:null});assert.equal(r.status,401);assert.equal(f.counts.store,0);
});
test('Un autre tenant ou un non membre ne peut recevoir une invitation',async()=>{
 const f=fixture();assert.equal((await f.req('POST','/sites/:siteId/invitations',{tenant:'AMBVIS_96C7FBBEA383DD'})).status,403);
 const x=fixture({member:false});assert.equal((await x.req('POST','/sites/:siteId/invitations')).status,403);
 assert.equal(x.counts.store,0);
});
test('Une origine externe refuse de générer une invitation',async()=>{
 const f=fixture();const r=await f.req('POST','/sites/:siteId/invitations',{origin:'https://evil.example'});
 assert.equal(r.status,403);assert.equal(f.counts.store,0);
});
test('Création valide n’impose ni identité déclarée ni destinataire non vérifié',async()=>{
 const f=fixture();const r=await f.req('POST','/sites/:siteId/invitations');assert.equal(r.status,201);
 assert.equal(r.json.codeInvitation,TOKEN);assert.match(file('energy/energy-collaboration-http.js'),/private, no-store/);
});
test('Code inconnu/format invalide : refus sans base',async()=>{
 const f=fixture();const r=await f.req('POST','/invitations/accepter',{body:{codeInvitation:'faible'}});
 assert.equal(r.status,400);assert.equal(f.counts.store,0);
});
test('Invitation acceptée uniquement avec code correct',async()=>{
 const f=fixture();const r=await f.req('POST','/invitations/accepter',{body:{codeInvitation:TOKEN}});
 assert.equal(r.status,200);assert.equal(f.counts.store,1);
});
test('Contribution exige idempotence et refuse identité injectée',async()=>{
 const f=fixture();const route='/participations/:invitationId/contributions';
 assert.equal((await f.req('POST',route,{body:BODY})).status,400);
 assert.equal((await f.req('POST',route,{key:SITE,body:{...BODY,ownerId:20}})).status,400);
 assert.equal(f.counts.store,0);
});
test('Une proposition conforme est conservée en attente sans validation automatique',async()=>{
 const f=fixture();const r=await f.req('POST','/participations/:invitationId/contributions',{key:SITE,body:BODY});
 assert.equal(r.status,201);assert.equal(r.json.statut,'PROPOSITION_EN_ATTENTE');
});
test('Arbitrage explicite du responsable seulement',async()=>{
 const f=fixture();const route='/sites/:siteId/contributions/:contributionId/decision';
 assert.equal((await f.req('POST',route,{body:{decision:'MESURER'}})).status,400);
 assert.equal((await f.req('POST',route,{body:{decision:'ACCEPTER'}})).status,200);
});
test('Révocation explicite exige origine et site valides',async()=>{
 const f=fixture();const route='/sites/:siteId/invitations/:invitationId/revoquer';
 assert.equal((await f.req('POST',route,{origin:'https://invalid.example'})).status,403);
 assert.equal((await f.req('POST',route,{params:{siteId:'invalide'}})).status,400);
 assert.equal((await f.req('POST',route)).status,200);
});
test('Store refuse de démarrer sans client DB injecté',()=>assert.throws(()=>creerEnergyCollaborationStore({}),/CLIENT_POSTGRES_REQUIS/));
