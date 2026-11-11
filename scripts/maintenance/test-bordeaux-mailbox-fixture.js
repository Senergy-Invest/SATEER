'use strict';
/** P335BO — boîte fictive, sans connexion réseau ni PostgreSQL. */
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const root=process.env.SATEER_BORDEAUX_ROOT || path.resolve(__dirname,'../..');
const intent=require(path.join(root,'public/sateer-mail-intent-core.js'));
const core=require(path.join(root,'scripts/bordeaux-email-intake-core.js'));
const guide=require(path.join(root,'sateer-mail-guidance-core.js'));
const ORG=70, TENANT='P6V_3B5AC5AB9DB04657';
const mail=(id,objet,texte,boite='CONSULAT_DEMO')=>({mailboxKey:boite,messageId:`<bo-${id}@example.invalid>`,organisationId:ORG,tenantCode:TENANT,objet,texte});
class FakeMailbox {
  constructor(items){this.items=items;this.acknowledged=new Set();this.failNextRead=false;}
  async read(){if(this.failNextRead){this.failNextRead=false;throw Error('SOURCE_TEMPORAIRE_INDISPONIBLE');}return this.items.filter(x=>!this.acknowledged.has(x.mailboxKey+'\0'+x.messageId));}
  async ack(x){this.acknowledged.add(x.mailboxKey+'\0'+x.messageId);}
}
async function ingest(mailbox,store,opts={}){
 const output=[];
 for(const x of await mailbox.read()){
  if(x.organisationId!==ORG||x.tenantCode!==TENANT)throw Error('TENANT_NON_AUTORISE');
  if(typeof x.texte!=='string'||x.texte.length>16000)throw Error('TAILLE_MESSAGE_INVALIDE');
  const id=core.empreinte(x.mailboxKey,x.messageId);
  const prev=store.get(id);
  if(prev){output.push({status:'DEJA_CONNU',id});await mailbox.ack(x);continue;}
  const decision=intent.qualifier(x.objet,x.texte); // Toujours AVANT toute orientation thématique.
  const proposal=core.proposerCategorie(x.objet,x.texte);
  const saved={id,intention:decision.intention,categorie:decision.categorie,
    categorieProposee:proposal.categorie,validationHumaineRequise:true,
    envoiAutorise:false,creationDossierAutorisee:false,routageAutomatiqueAutorise:false};
  store.set(id,saved); // Jeu de mémoire uniquement, aucune écriture dans l'application.
  if(opts.failAfterSave){opts.failAfterSave=false;throw Error('PANNE_APRES_ENREGISTREMENT_FICTIF');}
  await mailbox.ack(x);
  output.push({status:'PRIS_EN_COMPTE_FICTIF',id});
 }
 return output;
}
test('intention avant thème, y compris sujet normalisé [DEMARCHE:PASSEPORT]',()=>{
 for(const id of ['INFO_PASSEPORT','SUJET_NORMALISE_FAQ']){
  const s=intent.scenarios.find(x=>x.id===id);
  const d=intent.qualifier(s.objet,s.texte);
  assert.equal(d.categorie,'PASSEPORT');
  assert.equal(d.intention,'INFORMATION');
  assert.equal(d.creationDossierAutorisee,false);
  assert.equal(d.routageAutomatiqueAutorise,false);
 }
 assert.equal(intent.qualifier('Passeport','Je souhaite déposer mon dossier de passeport.').intention,'DEMANDE');
 assert.equal(intent.qualifier('Suivi passeport','Mon dossier de passeport est bloqué. Où en est ma demande ?').intention,'SECRETARIAT');
 assert.equal(intent.qualifier('Documents','Quels documents pour mon passeport et mon acte de naissance ?').intention,'SECRETARIAT');
});
test('flux fictif: information, demande et situation individuelle restent sans action automatique',async()=>{
 const box=new FakeMailbox([
  mail('info','[DEMARCHE:PASSEPORT] Renseignements','Comment faire pour renouveler mon passeport ? Quels documents faut-il ?'),
  mail('action','Passeport','Je souhaite déposer mon dossier de passeport.'),
  mail('suivi','Suivi passeport','Mon dossier de passeport est bloqué. Où en est ma demande ?')]);
 const store=new Map();
 assert.equal((await ingest(box,store)).length,3);
 assert.deepEqual([...store.values()].map(x=>x.intention),['INFORMATION','DEMANDE','SECRETARIAT']);
 for(const x of store.values()){
  assert.equal(x.validationHumaineRequise,true);
  assert.equal(x.envoiAutorise,false);
  assert.equal(x.creationDossierAutorisee,false);
  assert.equal(x.routageAutomatiqueAutorise,false);
 }
 assert.equal((await ingest(box,store)).length,0);
 assert.equal(store.size,3);
});
test('empreinte stable par boîte et Message-ID ; doublons refusés après rejeu',async()=>{
 const m=mail('repeat','Passeport','Comment renouveler mon passeport ?');
 const box=new FakeMailbox([m]);const store=new Map();
 await ingest(box,store);
 box.acknowledged.clear();
 const replay=await ingest(box,store);
 assert.equal(replay[0].status,'DEJA_CONNU');assert.equal(store.size,1);
 const second=new FakeMailbox([mail('repeat','Passeport','Comment renouveler mon passeport ?','SECONDE_BOITE')]);
 await ingest(second,store);assert.equal(store.size,2);
 assert.notEqual(core.empreinte('CONSULAT_DEMO',m.messageId),core.empreinte('SECONDE_BOITE',m.messageId));
});
test('panne entre mémorisation fictive et acquittement : reprise sans doublon',async()=>{
 const box=new FakeMailbox([mail('crash','Passeport','Comment renouveler mon passeport ?')]);
 const store=new Map(),opts={failAfterSave:true};
 await assert.rejects(ingest(box,store,opts),/PANNE_APRES_ENREGISTREMENT_FICTIF/);
 assert.equal(box.acknowledged.size,0);
 const again=await ingest(box,store);
 assert.equal(again[0].status,'DEJA_CONNU');assert.equal(store.size,1);
});
test('source indisponible, tenant extérieur, Message-ID invalide : jamais acquittés',async()=>{
 const source=new FakeMailbox([mail('timeout','Passeport','Quels documents pour passeport ?')]);
 source.failNextRead=true;const saved=new Map();
 await assert.rejects(ingest(source,saved),/SOURCE_TEMPORAIRE_INDISPONIBLE/);
 assert.equal(saved.size,0);assert.equal(source.acknowledged.size,0);
 const other=new FakeMailbox([{...mail('cross','Passeport','Quels documents pour passeport ?'),tenantCode:'TENANT_AUTRE'}]);
 await assert.rejects(ingest(other,new Map()),/TENANT_NON_AUTORISE/);assert.equal(other.acknowledged.size,0);
 const bad=new FakeMailbox([{...mail('bad','Passeport','Quels documents pour passeport ?'),messageId:'invalide'}]);
 await assert.rejects(ingest(bad,new Map()),/MESSAGE_ID_INVALIDE/);assert.equal(bad.acknowledged.size,0);
});
test('question FAQ : seul catalogue explicitement validé, actif et exact ; aucun envoi',()=>{
 const d=intent.qualifier('Passeport','Quels documents faut-il pour renouveler mon passeport ?');
 const approved={code:'TEST_VALIDEE',categorie:'PASSEPORT',titre:'Renouvellement de passeport',actif:true,valide_par:1,validation_explicite:true,pieces_obligatoires:['CNI_RECTO','PASSEPORT']};
 const a=guide.selectionnerFiche(d,'Quels documents faut-il pour renouveler mon passeport ?',[approved]);
 assert.equal(a.etat,'FICHE_VALIDEE_ACTIVE');
 for(const edits of [{actif:false},{validation_explicite:false},{valide_par:null}]){
  const b=guide.selectionnerFiche(d,'Quels documents faut-il pour renouveler mon passeport ?',[{...approved,...edits}]);
  assert.notEqual(b.etat,'FICHE_VALIDEE_ACTIVE');
 }
 assert.equal(guide.selectionnerFiche(d,'Quel est le tarif et le délai, et les documents ?',[approved]).etat,'QUESTIONS_MULTIPLES_NON_COUVERTES');
});
