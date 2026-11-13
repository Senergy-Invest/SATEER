/* SATEER P3.3.5O1 — préqualification déterministe, démonstration uniquement.
 * Ce module ne décide jamais de l'envoi d'un e-mail ni de la création d'un dossier.
 * Aucune classification ne peut à elle seule autoriser un routage automatique réel.
 */
(function (scope, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (scope && typeof window !== 'undefined') scope.SATEER_MAIL_INTENT = api;
})(typeof globalThis !== 'undefined' ? globalThis : null, function () {
  'use strict';
  const themes = Object.freeze({
    PASSEPORT: {label:'Passeport', pattern:/\b(passeport|passport)\b/},
    CARTE_CONSULAIRE: {label:'Carte consulaire', pattern:/\bcarte\s+consulaire\b/},
    ETAT_CIVIL: {label:'État civil', pattern:/\b(etat\s+civil|acte\s+de\s+naissance|acte\s+de\s+mariage|acte\s+de\s+deces)\b/}
  });
  function normaliser(s) {
    return String(s == null ? '' : s).slice(0,16000).normalize('NFKD')
      .replace(/[\u0300-\u036f]/g,'').toLowerCase()
      .replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  }
  function qualifier(objet, corps) {
    const subject = normaliser(objet), body = normaliser(corps);
    const texte = [subject,body].filter(Boolean).join(' ');
    const categories = Object.keys(themes).filter(k => themes[k].pattern.test(texte));
    const categorie = categories.length === 1 ? categories[0] : null;
    const shared = { categorie, categorieLibelle: categorie ? themes[categorie].label : 'Non déterminée',
      categoriesDetectees:categories, envoiAutorise:false, creationDossierAutorisee:false,
      routageAutomatiqueAutorise:false, validationHumaineRequise:true, orientation:null,
      mode:'SIMULATION_LOCALE' };
    if (!body || texte.length < 12) return {...shared,intention:'AMBIGU',orientation:'SECRETARIAT',motif:'MESSAGE_INSUFFISANT',label:'À qualifier par le secrétariat'};
    if (categories.length > 1) return {...shared,intention:'AMBIGU',orientation:'SECRETARIAT',motif:'PLUSIEURS_THEMES',label:'À qualifier par le secrétariat'};
    const individuel = /\b(mon dossier (?:est|a ete|n avance|reste|bloque)|numero de dossier|reference de dossier|ma demande (?:est|a ete)|mon passeport (?:est|n est)|j ai deja (?:depose|envoye|fait)|reclamation|litige|refus|bloque|perdu|vole|perte de passeport|en attente depuis|ou en est ma demande|statut de ma demande)\b/.test(body);
    if (individuel) return {...shared,intention:'AMBIGU',orientation:'SECRETARIAT',motif:'CAS_INDIVIDUEL',label:'Situation particulière — secrétariat'};
    const information = /\b(quels?|quelles?|comment|combien|pourquoi|ou trouver|ou obtenir|renseignements?|informations?|liste des|pieces? (?:a|necessaires?|requises?|justificatives?)|documents? (?:a|necessaires?|requis?)|faut il|dois je|conditions?|tarifs?|horaires?|delais?|procedure|comment faire|avant de (?:deposer|soumettre)|pour (?:renouveler|deposer|faire)|savoir)\b/.test(body);
    const depot = /\b(je (?:souhaite|veux|voudrais|demande) (?:de )?(?:deposer|soumettre|enregistrer)|je demande (?:un|une|le|la|l) (?:acte|extrait|duplicata|copie)\b|je vous adresse (?:ma|une) demande|je joins (?:mes|les) pieces|ci joint (?:mon|le) dossier|veuillez enregistrer|depot de mon dossier|dossier complet en piece jointe)\b/.test(body);
    if (information && !depot && categorie) return {...shared,intention:'INFORMATION',motif:'QUESTION_GENERALE',label:'Information générale — Mon Consulat'};
    if (information && depot) return {...shared,intention:'AMBIGU',orientation:'SECRETARIAT',motif:'INTENTION_AMBIGUE',label:'À qualifier par le secrétariat'};
    if (depot && categorie) return {...shared,intention:'DEMANDE',motif:'DEMANDE_EXPLICITE',label:'Démarche à vérifier avant orientation'};
    return {...shared,intention:'AMBIGU',orientation:'SECRETARIAT',motif:!categorie?'THEME_NON_IDENTIFIE':/\bprepar(?:er|ation)\b/.test(body)?'PREPARATION_AMBIGUE':'INTENTION_INDETERMINEE',label:'À qualifier par le secrétariat'};
  }
  const scenarios = Object.freeze([
    Object.freeze({id:'INFO_PASSEPORT',expediteur:'Citoyen fictif A',objet:'Documents pour renouvellement de passeport',texte:'Bonjour, quels documents faut-il fournir pour renouveler mon passeport ? Merci.'}),
    Object.freeze({id:'DEPOT_PASSEPORT',expediteur:'Citoyen fictif B',objet:'[DEMARCHE:PASSEPORT] Demande de passeport',texte:'Bonjour, je souhaite déposer mon dossier de passeport. Pouvez-vous prendre en charge ma demande ?'}),
    Object.freeze({id:'SUIVI_PERSONNEL',expediteur:'Citoyen fictif C',objet:'Suivi passeport',texte:'Mon dossier de passeport est bloqué. Où en est ma demande ?'}),
    Object.freeze({id:'MULTI_THEMES',expediteur:'Citoyen fictif D',objet:'Besoin d’aide',texte:'J’ai une question sur mon passeport et mon acte de naissance.'}),
    Object.freeze({id:'SUJET_NORMALISE_FAQ',expediteur:'Citoyen fictif E',objet:'[DEMARCHE:PASSEPORT] Information',texte:'Comment faire pour renouveler mon passeport ? Quelle liste de pièces faut-il ?'}),
    Object.freeze({id:'CARTE_PREPARATION',expediteur:'Citoyen fictif F',objet:'Carte consulaire',texte:'Bonjour, je souhaite préparer une carte consulaire. Comment faire ?'})
  ]);
  return Object.freeze({normaliser, qualifier, scenarios});
});
