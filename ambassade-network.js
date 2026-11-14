"use strict";
/** A12 : projection READ ONLY des relations de la mission, dans son seul tenant.
 * Jamais de droit hérité d'une tutelle. L'API exige explicitement VIEW_ORGANISATION_ANALYTICS.
 * La projection expose exclusivement les noms, types et IDs d'organisations liées,
 * pas leurs personnes, dossiers, messages, adresses ou secrets.
 */
const VALID_ID = x => Number.isSafeInteger(x) && x > 0;
const TENANT = /^[A-Z][A-Z0-9_-]{0,49}$/;
const SQL_RACINE = `SELECT o.id,o.nom,o.type,t.id AS tenant_id
 FROM organisations o JOIN tenants t ON t.id=o.tenant_id AND t.actif=TRUE
 WHERE o.id=$1 AND t.code=$2 AND o.type='AMBASSADE'`;
const SQL_RELATIONS = `
SELECT r.source_organisation_id source_id,src.nom source_nom,src.type source_type,
       r.target_organisation_id target_id,dst.nom target_nom,dst.type target_type,r.type
FROM organisation_relationships r
JOIN organisations src ON src.id=r.source_organisation_id AND src.tenant_id=r.tenant_id
JOIN organisations dst ON dst.id=r.target_organisation_id AND dst.tenant_id=r.tenant_id
WHERE r.tenant_id=$1 AND r.statut='ACTIVE' AND r.actif=TRUE
  AND (r.date_debut IS NULL OR r.date_debut<=CURRENT_TIMESTAMP)
  AND (r.date_fin IS NULL OR r.date_fin>CURRENT_TIMESTAMP)
  AND r.type IN ('ADMINISTRATIVE_TUTELLE','COMMUNITY_MEMBER','COOPERATION','COORDINATION')
  AND (r.source_organisation_id=$2 OR r.target_organisation_id=$2
   OR (r.type='COMMUNITY_MEMBER' AND EXISTS (
      SELECT 1 FROM organisation_relationships parent
      JOIN organisations cons ON cons.id=parent.target_organisation_id
        AND cons.tenant_id=parent.tenant_id AND cons.type='CONSULAT'
      WHERE parent.tenant_id=$1 AND parent.source_organisation_id=$2
        AND parent.target_organisation_id=r.target_organisation_id
        AND parent.type='ADMINISTRATIVE_TUTELLE'
        AND parent.statut='ACTIVE' AND parent.actif=TRUE
        AND (parent.date_debut IS NULL OR parent.date_debut<=CURRENT_TIMESTAMP)
        AND (parent.date_fin IS NULL OR parent.date_fin>CURRENT_TIMESTAMP)
    )))
ORDER BY r.type,src.nom,dst.nom`;
const SQL_ATTENTE = `SELECT 'DEMANDE' AS origine, o.id, o.nom, j.type_relation
 FROM organisation_join_requests j
 JOIN organisations o ON o.id=j.organisation_demandeuse_id AND o.tenant_id=j.tenant_id
 WHERE j.tenant_id=$1 AND j.organisation_cible_id=$2 AND j.statut='EN_ATTENTE'
 UNION ALL
 SELECT 'INVITATION' AS origine, o.id,o.nom,i.type_relation
 FROM organisation_invitations i
 JOIN organisations o ON o.id=i.organisation_acceptee_id AND o.tenant_id=i.tenant_id
 WHERE i.tenant_id=$1 AND i.organisation_source_id=$2 AND i.statut='EN_ATTENTE'
 ORDER BY origine,nom`;
function projeter(ambassade, relations, attente) {
  if (!VALID_ID(Number(ambassade?.id)) || ambassade?.type !== 'AMBASSADE' ||
      !Array.isArray(relations) || !Array.isArray(attente)) throw new Error('PROJECTION_RESEAU_INVALIDE');
  const racineId=Number(ambassade.id);
  const postes=new Map();
  for (const r of relations) {
    if (r.type==='ADMINISTRATIVE_TUTELLE' && Number(r.source_id)===racineId && r.target_type==='CONSULAT' && VALID_ID(Number(r.target_id))) {
      postes.set(Number(r.target_id),{id:Number(r.target_id),nom:r.target_nom});
    }
  }
  const directs=new Map(),territoriales=new Map(),partenaires=new Map();
  for (const r of relations) {
    if (r.type==='COMMUNITY_MEMBER' && r.source_type==='ASSOCIATION' && VALID_ID(Number(r.source_id))) {
      const a={id:Number(r.source_id),nom:r.source_nom};
      if (Number(r.target_id)===racineId) directs.set(a.id,a);
      else if (postes.has(Number(r.target_id))) {
        const poste=postes.get(Number(r.target_id));
        territoriales.set(`${poste.id}:${a.id}`,{...a,consulatId:poste.id,consulatNom:poste.nom});
      }
    }
    if (['COOPERATION','COORDINATION'].includes(r.type) &&
        (Number(r.source_id)===racineId || Number(r.target_id)===racineId)) {
      const source=Number(r.source_id)===racineId;
      const id=Number(source?r.target_id:r.source_id);
      if (VALID_ID(id) && id!==racineId) partenaires.set(`${r.type}:${id}`,{
        id,nom:source?r.target_nom:r.source_nom,type:source?r.target_type:r.source_type,relation:r.type
      });
    }
  }
  const cmp=(a,b)=>String(a.nom).localeCompare(String(b.nom),'fr') || a.id-b.id;
  const safeNames=arr=>arr.filter(x=>typeof x.nom==='string' && x.nom.length<=255);
  return {
    statut:'RESEAU_AMBASSADE',
    organisation:{id:racineId,nom:ambassade.nom,type:'AMBASSADE'},
    consulats:safeNames([...postes.values()]).sort(cmp),
    associationsDirectes:safeNames([...directs.values()]).sort(cmp),
    associationsDesConsulats:safeNames([...territoriales.values()]).sort((a,b)=>a.consulatNom.localeCompare(b.consulatNom,'fr')||cmp(a,b)),
    partenaires:safeNames([...partenaires.values()]).sort(cmp),
    attentes:attente.filter(x=>VALID_ID(Number(x.id)) && typeof x.nom==='string' && x.nom.length<=255 &&
      ['DEMANDE','INVITATION'].includes(x.origine)).map(x=>({id:Number(x.id),nom:x.nom,origine:x.origine,typeRelation:x.type_relation})),
    note:'Relations enregistrées et actives, uniquement dans ce tenant. Aucun droit de gestion hérité des consulats.'
  };
}
function creerChargerReseau({requete}) {
  if(typeof requete!=='function') throw new TypeError('REQUETE_OBLIGATOIRE');
  return async({organisationId,tenantCode})=>{
    if(!VALID_ID(organisationId)||typeof tenantCode!=='string'||!TENANT.test(tenantCode))
      throw new TypeError('CONTEXTE_RESEAU_INVALIDE');
    const root=await requete(SQL_RACINE,[organisationId,tenantCode]);
    if(root.rows?.length!==1) return null;
    const tenantId=Number(root.rows[0].tenant_id);
    if(!VALID_ID(tenantId)) throw new Error('TENANT_RESEAU_INVALIDE');
    const [links,pending]=await Promise.all([requete(SQL_RELATIONS,[tenantId,organisationId]),requete(SQL_ATTENTE,[tenantId,organisationId])]);
    if(!Array.isArray(links.rows)||!Array.isArray(pending.rows))throw new Error('DONNEES_RESEAU_INCOMPLETES');
    return {...projeter(root.rows[0],links.rows,pending.rows),tenantCode};
  };
}
module.exports=Object.freeze({creerChargerReseau,projeter,SQL_RACINE,SQL_RELATIONS,SQL_ATTENTE});
