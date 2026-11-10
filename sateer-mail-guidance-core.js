'use strict';
/**
 * SATEER Bordeaux P3.3.5P - lecture guidée strictement non expéditrice.
 * Ne jamais convertir cette suggestion en autorisation d'envoi.
 * Une fiche active et validée est nécessaire mais non suffisante pour une réponse automatique.
 */
const PIECES = Object.freeze({
  CNI_RECTO:'Carte nationale d’identité — recto',
  CNI_VERSO:'Carte nationale d’identité — verso',
  PASSEPORT:'Passeport',
  CARTE_CONSULAIRE:'Carte consulaire',
  ACTE_NAISSANCE:'Acte de naissance',
  JUSTIFICATIF_DOMICILE:'Justificatif de domicile',
  AUTRE:'Autre pièce (précisions nécessaires)'
});
const acc = s => String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function sousType(s){
  const t=acc(s);
  const ren=/\b(renouvellement|renouveler|renouvelle|renouvel)\b/.test(t);
  const prem=/\b(premier|premiere|premiers|premieres|1ere|premiere fois)\b/.test(t);
  return ren && prem ? 'AMBIGU' : ren ? 'RENOUVELLEMENT' : prem ? 'PREMIERE_DEMANDE' : 'NON_PRECISE';
}
function selectionnerFiche(decision, corps, rows){
  if (decision?.intention!=='INFORMATION' || !decision.categorie) return {etat:'HORS_INFORMATION',fiche:null};
  if (!Array.isArray(rows)) return {etat:'SOURCE_INDISPONIBLE',fiche:null};
  const demandeNorm=acc(corps);
  if (!/\b(pieces?|documents?|justificatifs?)\b/.test(demandeNorm))
    return {etat:'QUESTION_SANS_PIECES',fiche:null};
  if (/\b(tarifs?|prix|frais|cout|delais?|horaires?|rendez vous)\b/.test(demandeNorm))
    return {etat:'QUESTIONS_MULTIPLES_NON_COUVERTES',fiche:null};
  const liste=rows.filter(x=>x && x.categorie===decision.categorie && x.actif===true && x.valide_par!=null && x.validation_explicite===true);
  if(!liste.length)return {etat:'AUCUNE_FICHE_VALIDEE_ACTIVE',fiche:null};
  const demande=sousType(corps);
  if(demande==='AMBIGU')return {etat:'DEMARCHE_AMBIGUE',fiche:null};
  const candidats=liste.filter(x=>{
    const type=sousType(x.titre);
    // Ne pas assimiler « passeport » (sans précision) à un renouvellement.
    return demande==='NON_PRECISE' ? type==='NON_PRECISE' : type===demande;
  });
  if(candidats.length!==1)return {etat:candidats.length===0?'AUCUNE_FICHE_EXACTE':'PLUSIEURS_FICHES',fiche:null};
  const p=candidats[0];
  if (!Array.isArray(p.pieces_obligatoires) || p.pieces_obligatoires.length===0 ||
      p.pieces_obligatoires.some(x=>!Object.hasOwn(PIECES,x) || x==='AUTRE'))
    return {etat:'PIECES_NON_EXHAUSTIVES',fiche:null};
  const pieces=p.pieces_obligatoires.map(x=>PIECES[x]);
  // Ni frais, ni délai, ni conditions implicites. Les pièces proviennent EXCLUSIVEMENT du catalogue.
  return {etat:'FICHE_VALIDEE_ACTIVE',fiche:{code:p.code,titre:p.titre,categorie:p.categorie,maj:p.mis_a_jour_le,pieces},
    brouillon:proposerBrouillon(p.titre,pieces)};
}
function proposerBrouillon(titre,pieces){
  const l=['Bonjour,','',`Concernant votre question sur « ${titre} », le Consulat a enregistré une fiche de démarche validée dans SATEER.`];
  if(pieces.length)l.push('','Pièces actuellement répertoriées pour cette démarche :',...pieces.map(x=>'- '+x));
  else l.push('','La fiche ne contient pas de liste de pièces publiable dans ce parcours.');
  l.push('','Pour vérifier les autres conditions et préparer votre demande, consultez Mon Consulat sur SATEER. Vous pouvez également demander l’aide du secrétariat si votre situation est particulière.','','Cordialement,','Le Consulat');
  return l.join('\n');
}
module.exports=Object.freeze({selectionnerFiche,sousType,PIECES});
