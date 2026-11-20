'use strict';
/**
 * C4C - Projection READ ONLY des tables canoniques 051, 055, 056, 059, 060.
 * Les nombres sont des constats du registre, PAS des mesures, taux de performance ou kWh.
 * La vue d'un collaborateur ne comprend que son noeud C1 et ses descendants actifs.
 */
const {LIMIT,normaliserIndicateurs,nombre} = require('./energy-dashboard-domain');
const {presenterAction}=require('./energy-dashboard-actions-domain');
function creerEnergyDashboardStore({obtenirClient}) {
  if (typeof obtenirClient !== 'function') throw TypeError('POSTGRES_CLIENT_REQUIS');
  async function lecture(fn) {
    const c=await obtenirClient();
    try { return await fn(c); } finally { c.release(); }
  }
  // Deux champs d'identité : public_id dans l'API, id interne dans les jointures.
  async function obtenirSite(c,tenant,siteId) {
    const r=await c.query(`SELECT s.id,s.public_id,s.nom,s.type_site,s.tenant_id,s.owner_personne_id
      FROM energy_inventory_sites s JOIN tenants t ON t.id=s.tenant_id AND t.actif=TRUE
      WHERE t.code=$1 AND s.public_id=$2::uuid LIMIT 1`,[tenant,siteId]);
    return r.rows[0] || null;
  }
  async function sites({tenant,actor,offset=0}) {return lecture(async c => {
    const q=await c.query(`SELECT s.public_id,s.nom,s.type_site,
       CASE WHEN s.owner_personne_id=$2 THEN 'PROPRIETAIRE' ELSE g.role_scope END AS role,
       g.id AS grant_id,n.nom AS perimetre
      FROM energy_inventory_sites s JOIN tenants t ON t.id=s.tenant_id AND t.actif=TRUE
      LEFT JOIN energy_scope_grants g ON g.site_id=s.id AND g.tenant_id=s.tenant_id
        AND g.owner_personne_id=s.owner_personne_id AND g.personne_id=$2
        AND g.statut='ACTIF' AND s.owner_personne_id<>$2
      LEFT JOIN energy_scope_nodes n ON n.id=g.node_id AND n.site_id=s.id
      WHERE t.code=$1 AND (s.owner_personne_id=$2 OR g.id IS NOT NULL)
      ORDER BY s.nom,s.id,g.id LIMIT 51 OFFSET $3`,[tenant,actor,offset]);
    return {sites:q.rows.slice(0,LIMIT).map(r=>({
      id:String(r.public_id),nom:r.nom,typeSite:r.type_site,role:r.role,
      grantId:r.grant_id?String(r.grant_id):null,perimetre:r.perimetre || null
    })),offset,limite:LIMIT,suivant:q.rows.length>LIMIT};
  });}
  async function autoriser(c,site,actor,grantId) {
    if (grantId) {
      const r=await c.query(`SELECT g.node_id,g.role_scope,n.nom
        FROM energy_scope_grants g JOIN energy_scope_nodes n ON n.id=g.node_id AND n.site_id=g.site_id
          AND n.tenant_id=g.tenant_id AND n.owner_personne_id=g.owner_personne_id
        WHERE g.id=$1::uuid AND g.site_id=$2 AND g.tenant_id=$3
          AND g.owner_personne_id=$4 AND g.personne_id=$5 AND g.statut='ACTIF'
        LIMIT 1`,[grantId,site.id,site.tenant_id,site.owner_personne_id,actor]);
      return r.rows[0] || null;
    }
    if (Number(site.owner_personne_id)!==actor) return null;
    const r=await c.query(`SELECT id AS node_id,'PROPRIETAIRE' AS role_scope,nom
      FROM energy_scope_nodes
      WHERE site_id=$1 AND tenant_id=$2 AND owner_personne_id=$3 AND parent_id IS NULL LIMIT 1`,
    [site.id,site.tenant_id,site.owner_personne_id]);
    return r.rows[0] || {node_id:null,role_scope:'PROPRIETAIRE',nom:site.nom};
  }
  // CTE borné au descendant du noeud explicitement autorisé, jamais à un autre site.
  const arbre = `WITH RECURSIVE scope AS (
       SELECT id,parent_id,nom,type_noeud FROM energy_scope_nodes
        WHERE id=$4::uuid AND site_id=$1 AND tenant_id=$2 AND owner_personne_id=$3
       UNION ALL
       SELECT n.id,n.parent_id,n.nom,n.type_noeud FROM energy_scope_nodes n
        JOIN scope x ON n.parent_id=x.id
        WHERE n.site_id=$1 AND n.tenant_id=$2 AND n.owner_personne_id=$3
     )`;
  const stats = {
    unites: `SELECT COUNT(*) FROM scope`,
    responsabilites: `SELECT COUNT(*) FROM energy_scope_grants g JOIN scope n ON n.id=g.node_id WHERE g.site_id=$1 AND g.tenant_id=$2 AND g.owner_personne_id=$3 AND g.statut='ACTIF'`,
    enRevue: `SELECT COUNT(*) FROM energy_scope_proposals p JOIN scope n ON n.id=p.scope_node_id WHERE p.site_id=$1 AND p.tenant_id=$2 AND p.owner_personne_id=$3 AND p.statut='EN_REVUE'`,
    aCorriger: `SELECT COUNT(*) FROM energy_scope_proposals p JOIN scope n ON n.id=p.scope_node_id WHERE p.site_id=$1 AND p.tenant_id=$2 AND p.owner_personne_id=$3 AND p.statut='A_CORRIGER'`,
    integrees: `SELECT COUNT(*) FROM energy_scope_proposals p JOIN scope n ON n.id=p.scope_node_id WHERE p.site_id=$1 AND p.tenant_id=$2 AND p.owner_personne_id=$3 AND p.statut='INTEGREE'`,
    equipementsLocalises: `SELECT COUNT(*) FROM energy_scope_equipment_locations e JOIN scope n ON n.id=e.scope_node_id WHERE e.site_id=$1 AND e.tenant_id=$2 AND e.owner_personne_id=$3`,
    appareillages: `SELECT COUNT(*) FROM energy_topology_assets a JOIN scope n ON n.id=a.scope_node_id WHERE a.site_id=$1 AND a.tenant_id=$2 AND a.owner_personne_id=$3`,
    compteurs: `SELECT COUNT(*) FROM energy_topology_assets a JOIN scope n ON n.id=a.scope_node_id WHERE a.site_id=$1 AND a.tenant_id=$2 AND a.owner_personne_id=$3 AND a.type_noeud='COMPTEUR'`,
    relationsDeclarees: `SELECT COUNT(*) FROM energy_topology_links l JOIN scope n ON n.id=l.target_scope_node_id WHERE l.site_id=$1 AND l.tenant_id=$2 AND l.owner_personne_id=$3 AND l.actif=TRUE`,
    esquisses: `SELECT COUNT(*) FROM energy_sketch_positions p JOIN scope n ON n.id=p.scope_node_id WHERE p.site_id=$1 AND p.tenant_id=$2 AND p.owner_personne_id=$3 AND p.vue='PHYSIQUE'`
  };
  // Les sous-requêtes n'additionnent pas des jointures multiples : aucun gonflement artificiel des chiffres.
  const summarySql=arbre+' SELECT '+Object.entries(stats).map(([k,q])=>`(${q}) AS "${k}"`).join(',\n');
  const unitSql=arbre+`, page AS (
     SELECT * FROM scope ORDER BY nom,id LIMIT 51 OFFSET $5
   ) SELECT n.id,n.parent_id,n.nom,n.type_noeud,
   (SELECT COUNT(*) FROM energy_scope_grants g WHERE g.node_id=n.id AND g.site_id=$1 AND g.tenant_id=$2 AND g.owner_personne_id=$3 AND g.statut='ACTIF') AS responsables,
   (SELECT COUNT(*) FROM energy_scope_proposals p WHERE p.scope_node_id=n.id AND p.site_id=$1 AND p.tenant_id=$2 AND p.owner_personne_id=$3 AND p.statut='EN_REVUE') AS en_revue,
   (SELECT COUNT(*) FROM energy_scope_proposals p WHERE p.scope_node_id=n.id AND p.site_id=$1 AND p.tenant_id=$2 AND p.owner_personne_id=$3 AND p.statut='A_CORRIGER') AS a_corriger,
   (SELECT COUNT(*) FROM energy_scope_equipment_locations l WHERE l.scope_node_id=n.id AND l.site_id=$1 AND l.tenant_id=$2 AND l.owner_personne_id=$3) AS equipements,
   (SELECT COUNT(*) FROM energy_topology_assets a WHERE a.scope_node_id=n.id AND a.site_id=$1 AND a.tenant_id=$2 AND a.owner_personne_id=$3) AS appareillages,
   (SELECT COUNT(*) FROM energy_sketch_positions p WHERE p.scope_node_id=n.id AND p.site_id=$1 AND p.tenant_id=$2 AND p.owner_personne_id=$3 AND p.vue='PHYSIQUE') AS esquisses
   FROM page n ORDER BY n.nom,n.id`;
  async function synthese({tenant,actor,siteId,grantId=null,offset=0}) {return lecture(async c => {
    const site=await obtenirSite(c,tenant,siteId);
    if(!site)return null;
    const scope=await autoriser(c,site,actor,grantId);
    if(!scope)return null;
    const owner=Number(site.owner_personne_id)===actor && !grantId;
    if(!scope.node_id) return {
      site:{id:String(site.public_id),nom:site.nom,typeSite:site.type_site},
      acces:{role:scope.role_scope,perimetre:scope.nom,complet:owner},
      statutStructure:'STRUCTURE_C1_NON_INITIALISEE',indicateurs:null,unites:[],suivant:false,
      offset,limite:LIMIT,equipementsSansLocalisation:null
    };
    const params=[site.id,site.tenant_id,site.owner_personne_id,scope.node_id];
    const a=await c.query(summarySql,params);
    const b=await c.query(unitSql,[...params,offset]);
    let sansLocalisation=null;
    if(owner) {
      const count=await c.query(`SELECT COUNT(*) AS total FROM energy_inventory_equipements
          WHERE site_id=$1 AND tenant_id=$2 AND owner_personne_id=$3`,params.slice(0,3));
      sansLocalisation=Math.max(0,nombre(count.rows[0]?.total ?? 0)-nombre(a.rows[0]?.equipementsLocalises ?? 0));
    }
    return {
      site:{id:String(site.public_id),nom:site.nom,typeSite:site.type_site},
      acces:{role:scope.role_scope,perimetre:scope.nom,complet:owner},
      statutStructure:'DISPONIBLE',indicateurs:normaliserIndicateurs(a.rows[0] || {}),
      unites:b.rows.slice(0,LIMIT).map(r=>({id:String(r.id),parentId:r.parent_id?String(r.parent_id):null,
        nom:r.nom,type:r.type_noeud,responsables:nombre(r.responsables),
        enRevue:nombre(r.en_revue),aCorriger:nombre(r.a_corriger),
        equipements:nombre(r.equipements),appareillages:nombre(r.appareillages),esquisses:nombre(r.esquisses)})),
      offset,limite:LIMIT,suivant:b.rows.length>LIMIT,equipementsSansLocalisation:sansLocalisation,
      fiabilite:'DONNEES_DECLAREES_NON_CERTIFIEES',mesuresDisponibles:false
    };
  });}
  /**
   * File C2 en lecture seule. L'affectation C1 est vérifiée AVANT tout accès
   * aux propositions. Une proposition d'un autre site n'est jamais exposée.
   */
  async function actions({tenant,actor,siteId,grantId=null,offset=0,statut='TOUTES',suivi='TOUS'}) {return lecture(async c => {
    const site=await obtenirSite(c,tenant,siteId);
    if(!site)return null;
    const scope=await autoriser(c,site,actor,grantId);
    if(!scope)return null;
    const owner=Number(site.owner_personne_id)===actor && !grantId;
    // Le diagnostic d'affectation est un outil de supervision propriétaire seulement.
    if(suivi==='SANS_RELECTEUR_ACTIF' && !owner)return null;
    const contexte={site:{id:String(site.public_id),nom:site.nom},
      acces:{role:scope.role_scope,perimetre:scope.nom,complet:owner},
      filtre:statut,offset,limite:LIMIT,fiabilite:'DECLARATIONS_A_VERIFIER'};
    if(!scope.node_id)return {...contexte,statutStructure:'STRUCTURE_C1_NON_INITIALISEE',actions:[],suivant:false};
    const sql=arbre+` SELECT p.id,p.nom,p.famille,p.statut,p.date_modification,
      n.id AS scope_node_id,n.nom AS scope_nom,
      p.auteur_personne_id=$5 AS est_auteur,
      EXISTS(SELECT 1 FROM energy_scope_grants active_reviewer
        WHERE active_reviewer.id=p.reviewer_grant_id
          AND active_reviewer.site_id=$1 AND active_reviewer.tenant_id=$2
          AND active_reviewer.owner_personne_id=$3
          AND active_reviewer.statut='ACTIF' AND active_reviewer.role_scope<>'OCCUPANT') AS relecteur_actif,
      EXISTS(SELECT 1 FROM energy_scope_grants g
        WHERE g.id=p.reviewer_grant_id AND g.site_id=$1 AND g.tenant_id=$2
          AND g.owner_personne_id=$3 AND g.personne_id=$5 AND g.statut='ACTIF'
          AND g.role_scope<>'OCCUPANT') AS est_relecteur
      FROM energy_scope_proposals p JOIN scope n ON n.id=p.scope_node_id
      WHERE p.site_id=$1 AND p.tenant_id=$2 AND p.owner_personne_id=$3
        AND p.statut IN ('EN_REVUE','A_CORRIGER')
        AND ($7::text='TOUTES' OR p.statut=$7::text)
        AND ($9::text='TOUS' OR (p.statut='EN_REVUE' AND NOT EXISTS(
          SELECT 1 FROM energy_scope_grants review_grant
          WHERE review_grant.id=p.reviewer_grant_id
            AND review_grant.site_id=$1 AND review_grant.tenant_id=$2
            AND review_grant.owner_personne_id=$3
            AND review_grant.statut='ACTIF' AND review_grant.role_scope<>'OCCUPANT'
        )))
        AND ($6::boolean OR
          (p.statut='A_CORRIGER' AND p.auteur_personne_id=$5) OR
          (p.statut='EN_REVUE' AND EXISTS(
            SELECT 1 FROM energy_scope_grants g
             WHERE g.id=p.reviewer_grant_id AND g.site_id=$1 AND g.tenant_id=$2
               AND g.owner_personne_id=$3 AND g.personne_id=$5 AND g.statut='ACTIF'
               AND g.role_scope<>'OCCUPANT')))
      ORDER BY p.date_modification ASC,p.id ASC LIMIT 51 OFFSET $8`;
    const query=await c.query(sql,[site.id,site.tenant_id,site.owner_personne_id,scope.node_id,actor,owner,statut,offset,suivi]);
    return {...contexte,statutStructure:'DISPONIBLE',actions:query.rows.slice(0,LIMIT).map(r=>presenterAction(r)),suivant:query.rows.length>LIMIT};
  });}
  return {sites,synthese,actions};
}
module.exports={creerEnergyDashboardStore};
