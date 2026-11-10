'use strict';
/**
 * Tests déterministes P3.3.5AZ — aucun accès réseau, aucune base.
 * Lancer : node --test scripts/maintenance/test-bordeaux-courriers-recette.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const project = process.env.SATEER_PROJECT_ROOT || path.resolve(__dirname, '../..');
const intent = require(path.join(project, 'public/sateer-mail-intent-core.js'));
const guidance = require(path.join(project, 'sateer-mail-guidance-core.js'));
const eligible = {
  code:'PASSEPORT_RENOUVELLEMENT_TEST', categorie:'PASSEPORT',
  titre:'Renouvellement de passeport', actif:true, valide_par:1,
  validation_explicite:true, pieces_obligatoires:['CNI_RECTO','PASSEPORT']
};
const question = 'Bonjour, quels documents faut-il fournir pour renouveler mon passeport ?';
const decision = intent.qualifier('Documents pour renouvellement de passeport', question);

test('six scénarios qualifiés sans envoi, dossier ou routage automatique', () => {
  const expected = {
    INFO_PASSEPORT:'INFORMATION', DEPOT_PASSEPORT:'DEMANDE',
    SUIVI_PERSONNEL:'SECRETARIAT', MULTI_THEMES:'SECRETARIAT',
    SUJET_NORMALISE_FAQ:'INFORMATION', CARTE_PREPARATION:'INFORMATION'
  };
  assert.equal(intent.scenarios.length, 6);
  for (const s of intent.scenarios) {
    const d = intent.qualifier(s.objet, s.texte);
    assert.equal(d.intention, expected[s.id], s.id);
    assert.equal(d.envoiAutorise, false, s.id);
    assert.equal(d.creationDossierAutorisee, false, s.id);
    assert.equal(d.routageAutomatiqueAutorise, false, s.id);
  }
});
test('un dossier individuel et deux thèmes imposent le secrétariat', () => {
  assert.equal(intent.qualifier('Passeport','Mon dossier de passeport est bloqué. Où en est ma demande ?').intention, 'SECRETARIAT');
  assert.equal(intent.qualifier('Question','Quels documents pour passeport et acte de naissance ?').intention, 'SECRETARIAT');
});
test('conseil limité à une fiche validée, active, exacte et complète', () => {
  const r = guidance.selectionnerFiche(decision, question, [eligible]);
  assert.equal(r.etat, 'FICHE_VALIDEE_ACTIVE');
  assert.equal(r.fiche.code, eligible.code);
  assert.equal(r.fiche.pieces.length, 2);
  assert.match(r.brouillon, /validation|validée/);
  assert.doesNotMatch(r.brouillon, /tarif de|délai de|envoyé automatiquement/);
});
test('ne jamais reprendre une fiche inactive, non validée, ou sans validateur', () => {
  for (const updates of [{actif:false},{validation_explicite:false},{valide_par:null}]) {
    const r = guidance.selectionnerFiche(decision, question, [{...eligible,...updates}]);
    assert.equal(r.etat, 'AUCUNE_FICHE_VALIDEE_ACTIVE');
  }
});
test('situation non résolue = aucun brouillon issu du catalogue', () => {
  const tooMany = guidance.selectionnerFiche(decision,question,[eligible,{...eligible,code:'AUTRE_TEST'}]);
  assert.equal(tooMany.etat,'PLUSIEURS_FICHES');
  const missing = guidance.selectionnerFiche(decision,question,[{...eligible,pieces_obligatoires:[]}]);
  assert.equal(missing.etat,'PIECES_NON_EXHAUSTIVES');
  const nonExhaustive = guidance.selectionnerFiche(decision,question,[{...eligible,pieces_obligatoires:['AUTRE']}]);
  assert.equal(nonExhaustive.etat,'PIECES_NON_EXHAUSTIVES');
  const wrongCategory = guidance.selectionnerFiche(decision,question,[{...eligible,categorie:'ETAT_CIVIL'}]);
  assert.equal(wrongCategory.etat,'AUCUNE_FICHE_VALIDEE_ACTIVE');
});
test('questions sur tarifs et délais exclues du conseil sur pièces', () => {
  const r = guidance.selectionnerFiche(decision, question+' Quel est le tarif ?', [eligible]);
  assert.equal(r.etat, 'QUESTIONS_MULTIPLES_NON_COUVERTES');
});
