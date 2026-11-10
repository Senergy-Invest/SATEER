'use strict';
/**
 * P3.3.5AK - Etat volatile du catalogue de RECETTE.
 * Aucune ecriture SQL, aucune mutation du catalogue institutionnel.
 * La publication est une simulation partagee uniquement dans ce processus Node.
 */
const ORG = 70;
const TENANT = 'P6V_3B5AC5AB9DB04657';
const PREFIX = '[DEMO BORDEAUX]';
const CONFIRMATION = 'CONFIRMER_SIMULATION_BORDEAUX';
const STATES = Object.freeze({BROUILLON:'BROUILLON', VALIDEE:'VALIDEE', PUBLIEE:'PUBLIEE'});

function eligible(row) {
  return Boolean(row && typeof row.code === 'string' && /^[A-Z][A-Z0-9_]{2,63}$/.test(row.code)
    && typeof row.titre === 'string' && row.titre.startsWith(PREFIX)
    && typeof row.revision === 'string' && /^\d{10}\.\d{6}$/.test(row.revision)
    && row.actif === false && row.validation_explicite === false && row.valide_par == null);
}
function error(code, http = 409) {
  const e = new Error(code); e.statusCode = http; return e;
}
function createRecetteState() {
  const states = new Map();
  function stateFor(row) {
    if (!eligible(row)) return null;
    const previous = states.get(row.code);
    if (!previous || previous.revision !== row.revision) {
      states.delete(row.code); return STATES.BROUILLON;
    }
    return previous.etat;
  }
  function project(row) {
    const etat = stateFor(row);
    if (etat === null) return null;
    return Object.freeze({code:row.code,titre:row.titre,categorie:row.categorie,
      piecesObligatoires:row.pieces_obligatoires || [],
      delaiIndicatifJours:row.delai_indicatif_jours ?? null,
      revision:row.revision,etat,recette:true,officielle:false,persistante:false});
  }
  function list(rows, canManage) {
    const eligibleRows = rows.map(project).filter(Boolean);
    return canManage ? eligibleRows : eligibleRows.filter(x => x.etat === STATES.PUBLIEE);
  }
  function transition(row, action, revision, confirmation) {
    if (!eligible(row)) throw error('FICHE_FICTIVE_NON_ELIGIBLE', 404);
    if (confirmation !== CONFIRMATION) throw error('CONFIRMATION_RECETTE_REQUISE',400);
    if (revision !== row.revision) throw error('REVISION_OBSOLETE');
    const current = stateFor(row);
    const rules = {
      VALIDER: [STATES.BROUILLON, STATES.VALIDEE],
      PUBLIER: [STATES.VALIDEE, STATES.PUBLIEE],
      RETIRER: [STATES.PUBLIEE, STATES.VALIDEE]
    };
    const target = {VALIDER:STATES.VALIDEE,PUBLIER:STATES.PUBLIEE,RETIRER:STATES.VALIDEE};
    if (!rules[action] || !rules[action].includes(current)) throw error('TRANSITION_RECETTE_INTERDITE');
    // Aucune operation async entre lecture de l'etat et mise a jour de la Map.
    states.set(row.code, {revision:row.revision,etat:target[action]});
    return project(row);
  }
  return Object.freeze({list,transition,project});
}
module.exports = Object.freeze({ORG,TENANT,PREFIX,CONFIRMATION,STATES,eligible,createRecetteState});
