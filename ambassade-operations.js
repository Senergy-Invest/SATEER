"use strict";
/** A5 — Projection opérationnelle propre à l'organisation, via les tables du Core.
 * Adaptateur de lecture uniquement : aucune ligne de demande ni document privé ne sort.
 * Le routage et les communications restent la responsabilité de leurs moteurs existants.
 */
const SQL_DEMANDES = `
SELECT COUNT(*)::int AS total,
 COUNT(*) FILTER (WHERE d.statut = 'NOUVELLE')::int AS nouvelles,
 COUNT(*) FILTER (WHERE d.statut = 'EN_COURS')::int AS "enCours",
 COUNT(*) FILTER (WHERE d.statut = 'TRAITEE')::int AS traitees,
 COUNT(*) FILTER (WHERE d.statut IN ('NOUVELLE','EN_COURS') AND d.destination_unit_id IS NULL)::int AS "sansDestination",
 COUNT(*) FILTER (WHERE d.statut IN ('NOUVELLE','EN_COURS') AND d.priorite = 'URGENTE')::int AS "urgentesOuvertes"
FROM demandes d
JOIN organisations o ON o.id=d.organisation_id AND o.tenant_id=d.tenant_id AND o.type='AMBASSADE'
JOIN tenants t ON t.id=o.tenant_id AND t.actif=TRUE
WHERE o.id=$1 AND t.code=$2`;
const SQL_PUBLICATIONS = `
SELECT COUNT(*) FILTER (WHERE p.statut='PUBLIEE')::int AS publiees
FROM publications p
JOIN organisations o ON o.id=p.organisation_id AND o.tenant_id=p.tenant_id AND o.type='AMBASSADE'
JOIN tenants t ON t.id=o.tenant_id AND t.actif=TRUE
WHERE o.id=$1 AND t.code=$2`;
const SQL_UNITES = `
SELECT u.id, u.nom, u.code
FROM organisation_units u
JOIN organisations o ON o.id=u.organisation_id AND o.type='AMBASSADE'
JOIN tenants t ON t.id=o.tenant_id AND t.actif=TRUE
WHERE o.id=$1 AND t.code=$2 AND u.actif=TRUE
ORDER BY u.nom,u.id LIMIT 100`;
const CODE = /^[A-Z][A-Z0-9_-]{0,49}$/;
function entier(x) {return Number.isSafeInteger(x) && x>=0;}
function creerProjectionOperationsAmbassade({ requete }={}) {
  if (typeof requete!=="function") throw new TypeError('REQUETE_OBLIGATOIRE');
  return async function charger({ organisationId, tenantCode }={}) {
    if (!Number.isSafeInteger(organisationId) || organisationId<=0 ||
        typeof tenantCode!=="string" || !CODE.test(tenantCode)) throw new TypeError('CONTEXTE_INVALIDE');
    const args=[organisationId,tenantCode];
    const [demandes,publications,unites]=await Promise.all([
      requete(SQL_DEMANDES,args),requete(SQL_PUBLICATIONS,args),requete(SQL_UNITES,args)
    ]);
    if (demandes?.rows?.length!==1 || publications?.rows?.length!==1 || !Array.isArray(unites?.rows))
      throw new Error('DONNEES_OPERATIONS_INCOMPLETES');
    const champs=['total','nouvelles','enCours','traitees','sansDestination','urgentesOuvertes'];
    const bilan={};
    for(const cle of champs){const n=Number(demandes.rows[0][cle]);if(!entier(n))throw new Error('COMPTEUR_INVALIDE');bilan[cle]=n;}
    const publiees=Number(publications.rows[0].publiees);
    if(!entier(publiees)||unites.rows.length>100)throw new Error('PROJECTION_INVALIDE');
    const vues=unites.rows.map(u=>{
      if(!Number.isSafeInteger(Number(u.id))||Number(u.id)<=0 || typeof u.nom!=='string' ||
        !u.nom.trim() || u.nom.length>255 || typeof u.code!=='string'||u.code.length>100)
        throw new Error('UNITE_INVALIDE');
      return Object.freeze({id:Number(u.id),nom:u.nom,code:u.code});
    });
    return Object.freeze({
      organisationId, tenantCode, demandes:Object.freeze(bilan),
      publications:Object.freeze({publiees}), unites:Object.freeze(vues),
      orientationInterPostes:'NON_CONFIGUREE'
    });
  };
}
module.exports=Object.freeze({creerProjectionOperationsAmbassade,SQL_DEMANDES,SQL_PUBLICATIONS,SQL_UNITES});
