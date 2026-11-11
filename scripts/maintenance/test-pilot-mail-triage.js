'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const ROOT=process.env.SATEER_PROJECT_ROOT||path.resolve(__dirname,'../..');
const core=require(path.join(ROOT,'pilot-mail-triage-core.js'));
const rule={categorie:'PASSEPORT',mode:'PROPOSITION',bureauId:115,bureauValide:true,actif:true};
const mail=(objet,texte)=>({objet,texte});
test('aucune règle => Secretariat pour les intentions en attente',()=>{
 const x=core.orienterVirtuellement(mail('Passeport','Bonjour, quels documents pour renouveler mon passeport ?'),[]);
 assert.equal(x.file,core.FILES.SECRETARIAT);
 assert.equal(x.execution,false);assert.equal(x.reponseEnvoyee,false);
});
test('FAQ passeport avec règle : préparation par assistant et non envoi',()=>{
 const x=core.orienterVirtuellement(mail('Passeport','Bonjour, quels documents pour renouveler mon passeport ?'),[rule]);
 assert.equal(x.file,core.FILES.ASSISTANT);assert.equal(x.acheminementReel,false);
 assert.equal(x.verificationHumaineOuInstitutionnelleRequise,true);
});
test('démarche explicite avec bureau actif => file bureau seulement proposée',()=>{
 const x=core.orienterVirtuellement(mail('Demande passeport','Je souhaite déposer mon dossier de passeport.'),[rule]);
 assert.equal(x.file,core.FILES.BUREAU);assert.equal(x.bureauId,115);
 assert.equal(x.dossierCree,false);assert.equal(x.execution,false);
});
test('bureau inhabilité ou absent => secrétariat',()=>{
 const x=core.orienterVirtuellement(mail('Demande passeport','Je souhaite déposer mon dossier de passeport.'),[{...rule,bureauValide:false}]);
 assert.equal(x.file,core.FILES.SECRETARIAT);
});
test('préparation ambiguë carte consulaire => secrétariat malgré règle',()=>{
 const x=core.orienterVirtuellement(mail('Carte consulaire','Je souhaite préparer une carte consulaire.'),[{...rule,categorie:'CARTE_CONSULAIRE'}]);
 assert.equal(x.file,core.FILES.SECRETARIAT);
});
test('question passeport avec préfixe normalisé ne devient pas demande',()=>{
 const x=core.orienterVirtuellement(mail('[DEMARCHE:PASSEPORT] information','Comment renouveler mon passeport ?'),[rule]);
 assert.equal(x.intention,'INFORMATION');assert.equal(x.file,core.FILES.ASSISTANT);
});
test('plainte individuelle ou thèmes multiples toujours secrétariat',()=>{
 for(const [objet,texte] of [['Passeport','Mon dossier passeport est bloqué. Où en est ma demande ?'],['Question','Question sur mon passeport et mon acte de naissance.']]){
  assert.equal(core.orienterVirtuellement(mail(objet,texte),[rule]).file,core.FILES.SECRETARIAT);
 }
});
test('règle inactive ou mode MANUEL => pas de simulation hors file',()=>{
 assert.equal(core.orienterVirtuellement(mail('Passeport','Je souhaite déposer mon dossier passeport.'),[{...rule,actif:false}]).file,core.FILES.SECRETARIAT);
 assert.equal(core.orienterVirtuellement(mail('Passeport','Je souhaite déposer mon dossier passeport.'),[{...rule,mode:'MANUEL'}]).file,core.FILES.SECRETARIAT);
});
test('contrat sécurité: aucun envoi, aucune mutation depuis noyau',()=>{
 const s=fs.readFileSync(path.join(ROOT,'pilot-mail-triage-core.js'),'utf8');
 assert.doesNotMatch(s,/\bINSERT\s+INTO\b|\bUPDATE\s+\w+\s+SET\b|\bDELETE\s+FROM\b/);
 for(const c of core.CATEGORIES)assert.match(c,/^[A-Z_]+$/);
});
