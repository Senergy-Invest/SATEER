'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {createRecetteState,CONFIRMATION,eligible,STATES}=require('../../pilot-procedures-recette-core');
const row=()=>({code:'RENOUVELLEMENT_PASSEPORT',titre:'[DEMO BORDEAUX] Renouvellement de passeport — test fictif',
  revision:'1794336000.000001',categorie:'PASSEPORT',pieces_obligatoires:['PASSEPORT'],
  delai_indicatif_jours:null,actif:false,validation_explicite:false,valide_par:null});
test('aucune fiche réelle ni historique ne rentre en simulation',()=>{
  assert.equal(eligible({...row(),titre:'Passeport officiel'}),false);
  assert.equal(eligible({...row(),actif:true}),false);
  assert.equal(eligible({...row(),validation_explicite:true}),false);
  assert.equal(eligible({...row(),valide_par:1}),false);
});
test('broillon -> validation RECETTE -> publication RECETTE -> retrait',()=>{
  const s=createRecetteState(),r=row();
  assert.equal(s.list([r],false).length,0);
  assert.equal(s.list([r],true)[0].etat,STATES.BROUILLON);
  assert.throws(()=>s.transition(r,'PUBLIER',r.revision,CONFIRMATION),/TRANSITION/);
  assert.throws(()=>s.transition(r,'VALIDER',r.revision,'oui'),/CONFIRMATION/);
  s.transition(r,'VALIDER',r.revision,CONFIRMATION);
  assert.equal(s.list([r],false).length,0);
  s.transition(r,'PUBLIER',r.revision,CONFIRMATION);
  assert.equal(s.list([r],false)[0].etat,STATES.PUBLIEE);
  assert.equal(s.list([r],false)[0].officielle,false);
  assert.equal(s.list([r],false)[0].persistante,false);
  s.transition(r,'RETIRER',r.revision,CONFIRMATION);
  assert.equal(s.list([r],false).length,0);
});
test('une modification du brouillon invalide la publication simulée',()=>{
  const s=createRecetteState(),r=row();
  s.transition(r,'VALIDER',r.revision,CONFIRMATION);
  s.transition(r,'PUBLIER',r.revision,CONFIRMATION);
  const changed={...r,revision:'1794336001.000001'};
  assert.equal(s.list([changed],false).length,0);
  assert.equal(s.list([changed],true)[0].etat,STATES.BROUILLON);
  assert.throws(()=>s.transition(changed,'VALIDER',r.revision,CONFIRMATION),/REVISION/);
});
test('aucun etat d une instance n est partagé avec une autre instance serveur',()=>{
  const a=createRecetteState(),b=createRecetteState(),r=row();
  a.transition(r,'VALIDER',r.revision,CONFIRMATION);
  a.transition(r,'PUBLIER',r.revision,CONFIRMATION);
  assert.equal(a.list([r],false).length,1);
  assert.equal(b.list([r],false).length,0);
});
