'use strict';
/** E2E Core réel A/B. Crée des données exclusivement FICTIVES dans sateer_test.
 * Les codes d'invitation, cookies, identifiants privés ne sont jamais affichés dans le rapport.
 */
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const TENANT='ENERGY_MVP01D_RECETTE',ORIGIN='http://localhost:3476',BASE='http://127.0.0.1:3476';
assert.equal(process.env.PGDATABASE,'sateer_test');assert.equal(process.env.PGHOST,'::1');
const C=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.sateer-recette','energy-mvp01d','IDENTIFIANTS_PRIVES.json'),'utf8'));
assert.equal(C.tenant,TENANT);assert.equal(C.accounts.length,2);
let n=0;const ok=s=>console.log('PASS '+(++n)+' '+s);const q='?tenant='+TENANT,api='/api/energy/collab';
let inviteId=null,siteId=null,cookies=[];
async function req(method,uri,{cookie,body,origin=ORIGIN,key}={}){
 const headers={Accept:'application/json',Origin:origin};if(cookie)headers.Cookie=cookie;
 if(body!==undefined)headers['Content-Type']='application/json';if(key)headers['Idempotency-Key']=key;
 const r=await fetch(BASE+uri,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(18000)});
 return {status:r.status,data:await r.json().catch(()=>({})),headers:r.headers};
}
async function main(){
 try{
  const anon=await req('GET',api+'/mes-participations'+q);assert.equal(anon.status,401);ok('Non authentifié Core : accès refusé');
  for(const acc of C.accounts){const r=await req('POST','/api/auth/login',{body:acc});assert.equal(r.status,200);
   assert.match(r.headers.get('set-cookie')||'',/httponly/i);cookies.push(r.headers.get('set-cookie').split(';')[0]);}
  ok('Comptes fictifs Energy A et B authentifiés avec Core réel');
  const a=cookies[0],b=cookies[1];
  const sites=await req('GET','/api/energy/inventory/sites'+q,{cookie:a});assert.equal(sites.status,200);
  siteId=sites.data.sites?.[0]?.id;assert.ok(siteId);ok('Site existant A récupéré sans duplication');
  const bRead=await req('GET','/api/energy/inventory/sites/'+siteId+q,{cookie:b});assert.equal(bRead.status,404);
  ok('Compte B ne consulte pas le dossier inventaire complet de A');
  const passports=await req('GET','/api/energy/passports/sites/'+siteId+q,{cookie:a});
  assert.equal(passports.status,200);const passId=passports.data.passeports?.[0]?.id;
  assert.ok(passId,'PASSEPORT_FICTIF_A_ABSENT');
  const passportFull=await req('GET','/api/energy/passports/'+passId+q,{cookie:a});assert.equal(passportFull.status,200);
  const scanToken=new URL(passportFull.data.qrUrl).searchParams.get('t');assert.ok(scanToken);
  assert.equal((await req('GET','/api/energy/passports/'+passId+q,{cookie:b})).status,404);
  assert.equal((await req('GET','/api/energy/passports/scan/'+scanToken,{cookie:b})).status,404);
  assert.equal((await req('GET','/api/energy/labels/'+passId+q,{cookie:b})).status,404);
  const photo=passportFull.data.photos?.[0];
  if(photo){const image=await fetch(BASE+'/api/energy/passports/'+passId+'/photos/'+photo.id+q,
     {headers:{Cookie:b,Origin:ORIGIN},signal:AbortSignal.timeout(15000)});assert.equal(image.status,404);}
  ok('B ne lit ni passeport, ni code QR, ni valeurs OCR, ni photo A');

  const wrongOrigin=await req('POST',api+'/sites/'+siteId+'/invitations'+q,{cookie:a,origin:'https://evil.invalid',body:{}});
  assert.equal(wrongOrigin.status,403);ok('Origine tierce ne crée aucune invitation');
  const notOwner=await req('POST',api+'/sites/'+siteId+'/invitations'+q,{cookie:b,body:{}});
  assert.equal(notOwner.status,404);ok('Compte B ne crée pas de code au nom de A');
  const invite=await req('POST',api+'/sites/'+siteId+'/invitations'+q,{cookie:a,body:{}});
  assert.equal(invite.status,201,'INVITATION_CREATION_'+invite.status+'_'+invite.data.statut);
  inviteId=invite.data.invitation?.id;const code=invite.data.codeInvitation;
  assert.ok(inviteId);assert.match(code,/^scb_[A-Za-z0-9_-]{32}$/);
  ok('Code privé aléatoire, non exposé dans les journaux');
  const ownerCannot=await req('POST',api+'/invitations/accepter'+q,{cookie:a,body:{codeInvitation:code}});
  assert.equal(ownerCannot.status,404);ok('Le propriétaire ne peut accepter son propre code');
  const accepted=await req('POST',api+'/invitations/accepter'+q,{cookie:b,body:{codeInvitation:code}});
  assert.equal(accepted.status,200,'INVITATION_ACCEPTEE_'+accepted.status+'_'+accepted.data.statut);
  ok('Compte B accepte une invitation rattachée à son tenant');
  const acceptedAgain=await req('POST',api+'/invitations/accepter'+q,{cookie:b,body:{codeInvitation:code}});
  assert.equal(acceptedAgain.status,200);ok('Acceptation rejouée par B sans doublon');
  const listOwner=await req('GET',api+'/sites/'+siteId+'/invitations'+q,{cookie:a});assert.equal(listOwner.status,200);
  assert.ok(listOwner.data.invitations.some(x=>x.id===inviteId&&x.statut==='ACCEPTEE'));
  assert.ok(!JSON.stringify(listOwner.data).includes(code));ok('Responsable lit le statut sans exposer le code en clair');
  const bCannot=await req('GET',api+'/sites/'+siteId+'/invitations'+q,{cookie:b});assert.equal(bCannot.status,404);
  ok('B ne consulte pas le journal de gestion de A');
  const member=await req('GET',api+'/mes-participations'+q,{cookie:b});assert.equal(member.status,200);
  assert.ok(member.data.participations.some(x=>x.invitationId===inviteId));ok('B trouve sa participation active');
  const prop1={nom:'Réfrigérateur fictif collaboration B1',famille:'FROID',quantite:1,puissanceUnitaireW:null};
  const key=crypto.randomUUID();
  const sub=await req('POST',api+'/participations/'+inviteId+'/contributions'+q,{cookie:b,body:prop1,key});
  assert.equal(sub.status,201,'SOUMISSION_'+sub.status+'_'+sub.data.statut);const propId=sub.data.id;assert.ok(propId);
  ok('Proposition B soumise sans créer un équipement chez A');
  const repeated=await req('POST',api+'/participations/'+inviteId+'/contributions'+q,{cookie:b,body:prop1,key});
  assert.equal(repeated.status,200);assert.equal(repeated.data.id,propId);ok('Rejeu idempotent de la proposition');
  const ownProposals=await req('GET',api+'/participations/'+inviteId+'/contributions'+q,{cookie:b});
  assert.equal(ownProposals.status,200);assert.ok(ownProposals.data.contributions.some(x=>x.id===propId&&x.statut==='SOUMISE'));
  ok('B voit uniquement le statut de ses propres propositions');
  const readBefore=await req('GET','/api/energy/inventory/sites/'+siteId+q,{cookie:a});assert.equal(readBefore.status,200);
  assert.ok(!readBefore.data.equipements.some(e=>e.nom===prop1.nom));ok('Aucune insertion canonique avant revue');
  const noReview=await req('POST',api+'/sites/'+siteId+'/contributions/'+propId+'/decision'+q,{cookie:b,body:{decision:'ACCEPTER'}});
  assert.equal(noReview.status,404);ok('Le contributeur ne peut valider à la place du propriétaire');
  const approved=await req('POST',api+'/sites/'+siteId+'/contributions/'+propId+'/decision'+q,{cookie:a,body:{decision:'ACCEPTER'}});
  assert.equal(approved.status,200,'DECISION_'+approved.status+'_'+approved.data.statut);assert.equal(approved.data.statut,'PROPOSITION_ARBITREE');
  assert.equal(approved.data.equipmentId!==undefined,true);ok('Acceptation explicite liée au nouvel équipement');
  const readAfter=await req('GET','/api/energy/inventory/sites/'+siteId+q,{cookie:a});assert.equal(readAfter.status,200);
  assert.ok(readAfter.data.equipements.some(e=>e.id===approved.data.equipmentId&&e.nom===prop1.nom&&e.provenance==='DECLAREE'));
  ok('Équipement déclaré disponible dans le moteur canonique existant');
  const doubleReview=await req('POST',api+'/sites/'+siteId+'/contributions/'+propId+'/decision'+q,{cookie:a,body:{decision:'ACCEPTER'}});
  assert.equal(doubleReview.status,409);ok('Deuxième validation refusée sans doublon');
  const prop2={nom:'Lampe fictive refusée B1',famille:'ECLAIRAGE',quantite:2,puissanceUnitaireW:12};
  const second=await req('POST',api+'/participations/'+inviteId+'/contributions'+q,{cookie:b,body:prop2,key:crypto.randomUUID()});
  assert.equal(second.status,201);const refused=await req('POST',api+'/sites/'+siteId+'/contributions/'+second.data.id+'/decision'+q,
   {cookie:a,body:{decision:'REFUSER'}});assert.equal(refused.status,200);
  const check=await req('GET','/api/energy/inventory/sites/'+siteId+q,{cookie:a});assert.equal(check.status,200);
  assert.ok(!check.data.equipements.some(e=>e.nom===prop2.nom));ok('Proposition refusée non publiée dans le site');
  const rev=await req('POST',api+'/sites/'+siteId+'/invitations/'+inviteId+'/revoquer'+q,{cookie:a,body:{}});
  assert.equal(rev.status,200);ok('Révocation explicite par A');
  const denied=await req('POST',api+'/participations/'+inviteId+'/contributions'+q,
    {cookie:b,body:{nom:'B après révocation',famille:'AUTRE',quantite:1},key:crypto.randomUUID()});
  assert.equal(denied.status,404);ok('B ne peut plus proposer après révocation');
  const memberAfter=await req('GET',api+'/mes-participations'+q,{cookie:b});assert.equal(memberAfter.status,200);
  assert.ok(!memberAfter.data.participations.some(x=>x.invitationId===inviteId));ok('Accès collaboratif retiré, aucune fuite de site');
  const stillDenied=await req('GET','/api/energy/inventory/sites/'+siteId+q,{cookie:b});assert.equal(stillDenied.status,404);
  ok('Révocation ne modifie pas le verrouillage de l’inventaire originel');
  for(const cookie of cookies){const r=await req('POST','/api/auth/logout',{cookie});assert.equal(r.status,200);}
  ok('Déconnexion et révocation des sessions Core');
  console.log('ENERGY_MVP02B_E2E_CORE_PASS='+n);
  console.log('DONNEES=EXCLUSIVEMENT_FICTIVES;INVITATION_E2E_REVOQUEE;AUCUN_SECRET_DANS_RAPPORT');
 }finally{
  // En cas d'échec, ne laisser aucune invitation TEST encore active si l'instance répond.
  if(inviteId&&siteId&&cookies[0])await req('POST',api+'/sites/'+siteId+'/invitations/'+inviteId+'/revoquer'+q,
    {cookie:cookies[0],body:{}}).catch(()=>{});
 }
}
main().catch(e=>{console.error('ENERGY_MVP02B_E2E_ECHEC='+String(e.message||e));process.exitCode=1;});
