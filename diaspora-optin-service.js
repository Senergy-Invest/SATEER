"use strict";
/** D2B-A : opt-in Diaspora, independant des abonnements institutionnels.
 * Les requetes sont toutes scopees au tenant, a la session et aux associations
 * explicitement verifiees par SATEER. Aucune liste nominative n'est exposee.
 */
const THEMES = Object.freeze(['EVENEMENT','FORMATION','EMPLOI','ENTREPRENEURIAT','CULTURE','COMMUNAUTE']);
const THEME_SET = new Set(THEMES);
function creerServiceOptinDiaspora({executerRequete,obtenirClientDatabase}) {
  if(typeof executerRequete!=='function'||typeof obtenirClientDatabase!=='function') throw new TypeError('DEPENDANCES_OPTIN_REQUISES');
  async function contexteCitoyen(personneId,tenant){
    const r=await executerRequete(`
      SELECT t.id FROM tenants t WHERE t.code=$2 AND t.actif=TRUE
      AND EXISTS (SELECT 1 FROM relations_personne_organisation member
        JOIN organisations o ON o.id=member.organisation_id AND o.tenant_id=t.id
        WHERE member.personne_id=$1)
      LIMIT 1`,[personneId,tenant]);
    return r.rows[0]?.id??null;
  }
  async function lister(personneId,tenant){
    const r=await executerRequete(`
      SELECT s.association_id,s.theme_code,s.actif
      FROM diaspora_subscriptions s JOIN tenants t ON t.id=s.tenant_id
      WHERE t.code=$2 AND t.actif=TRUE AND s.personne_id=$1
      ORDER BY s.association_id NULLS LAST,s.theme_code NULLS LAST`,[personneId,tenant]);
    return r.rows;
  }
  async function listerAssociations(tenant,personneId){
    // Une association suspendue deja suivie demeure visible pour que
    // l'utilisateur puisse la retirer de ses abonnements.
    const r=await executerRequete(`
      SELECT o.id,o.nom,COALESCE(d.statut,'NON_VERIFIEE') AS statut
      FROM organisations o JOIN tenants t ON t.id=o.tenant_id AND t.actif=TRUE
      LEFT JOIN diaspora_association_directory d ON d.tenant_id=t.id AND d.organisation_id=o.id
      WHERE t.code=$1 AND o.type='ASSOCIATION'
        AND (d.statut='VERIFIEE' OR EXISTS(
          SELECT 1 FROM diaspora_subscriptions s
          WHERE s.tenant_id=t.id AND s.personne_id=$2 AND s.association_id=o.id AND s.actif=TRUE))
      ORDER BY o.nom,o.id LIMIT 200`,[tenant,personneId]);
    return r.rows;
  }
  async function modifierTheme(personneId,tenant,theme,actif){
    if(!THEME_SET.has(theme)) return {ok:false,code:'THEME_INVALIDE'};
    if(actif){
      const r=await executerRequete(`
        INSERT INTO diaspora_subscriptions(tenant_id,personne_id,theme_code,actif)
        SELECT t.id,$1,$3,TRUE FROM tenants t WHERE t.code=$2 AND t.actif=TRUE
        AND EXISTS(SELECT 1 FROM relations_personne_organisation m JOIN organisations o
          ON o.id=m.organisation_id AND o.tenant_id=t.id WHERE m.personne_id=$1)
        ON CONFLICT (tenant_id,personne_id,theme_code) WHERE theme_code IS NOT NULL
        DO UPDATE SET actif=TRUE,date_modification=NOW() RETURNING id`,[personneId,tenant,theme]);
      return r.rowCount?{ok:true,actif:true}:{ok:false,code:'ACCES_TENANT_REFUSE'};
    }
    await executerRequete(`
      UPDATE diaspora_subscriptions s SET actif=FALSE,date_modification=NOW()
      FROM tenants t WHERE s.tenant_id=t.id AND t.code=$2
        AND s.personne_id=$1 AND s.theme_code=$3 AND s.actif=TRUE`,[personneId,tenant,theme]);
    return {ok:true,actif:false};
  }
  async function modifierAssociation(personneId,tenant,associationId,actif){
    if(actif){
      const r=await executerRequete(`
        INSERT INTO diaspora_subscriptions(tenant_id,personne_id,association_id,actif)
        SELECT t.id,$1,o.id,TRUE
        FROM tenants t JOIN organisations o ON o.tenant_id=t.id AND o.id=$3 AND o.type='ASSOCIATION'
        JOIN diaspora_association_directory d ON d.tenant_id=t.id AND d.organisation_id=o.id AND d.statut='VERIFIEE'
        WHERE t.code=$2 AND t.actif=TRUE
          AND EXISTS(SELECT 1 FROM relations_personne_organisation m JOIN organisations member_org
            ON member_org.id=m.organisation_id AND member_org.tenant_id=t.id WHERE m.personne_id=$1)
        ON CONFLICT (tenant_id,personne_id,association_id) WHERE association_id IS NOT NULL
        DO UPDATE SET actif=TRUE,date_modification=NOW() RETURNING id`,[personneId,tenant,associationId]);
      return r.rowCount?{ok:true,actif:true}:{ok:false,code:'ASSOCIATION_NON_VERIFIEE_OU_TENANT_REFUSE'};
    }
    await executerRequete(`
      UPDATE diaspora_subscriptions s SET actif=FALSE,date_modification=NOW()
      FROM tenants t WHERE s.tenant_id=t.id AND t.code=$2
        AND s.personne_id=$1 AND s.association_id=$3 AND s.actif=TRUE`,[personneId,tenant,associationId]);
    return {ok:true,actif:false};
  }
  async function listerSuivies(personneId,tenant){
    const r=await executerRequete(`
      SELECT p.id,p.titre,p.contenu,p.categorie,p.priorite,p.date_diffusion_diaspora,
        o.nom AS organisation,o.type AS organisation_type
      FROM publications p JOIN organisations o ON o.id=p.organisation_id AND o.tenant_id=p.tenant_id
      JOIN tenants t ON t.id=p.tenant_id AND t.actif=TRUE
      WHERE t.code=$2 AND p.statut='PUBLIEE' AND p.statut_diffusion_diaspora='DIFFUSEE'
        AND p.audience_type='TOUS'
        AND (o.type<>'ASSOCIATION' OR EXISTS(
          SELECT 1 FROM diaspora_association_directory d
          WHERE d.tenant_id=t.id AND d.organisation_id=o.id AND d.statut='VERIFIEE'))
        AND EXISTS (SELECT 1 FROM diaspora_subscriptions s
          WHERE s.tenant_id=t.id AND s.personne_id=$1 AND s.actif=TRUE
            AND ((s.theme_code IS NOT NULL AND s.theme_code=p.categorie AND
                  s.theme_code IN ('EVENEMENT','FORMATION','EMPLOI','ENTREPRENEURIAT','CULTURE','COMMUNAUTE'))
                 OR (s.association_id IS NOT NULL AND s.association_id=o.id AND o.type='ASSOCIATION')))
      ORDER BY p.date_diffusion_diaspora DESC,p.id DESC LIMIT 60`,[personneId,tenant]);
    return r.rows;
  }
  async function listerRepertoireBureau(tenant){
    const r=await executerRequete(`
      SELECT o.id,o.nom,COALESCE(d.statut,'NON_VERIFIEE') AS statut
      FROM organisations o JOIN tenants t ON t.id=o.tenant_id AND t.actif=TRUE
      LEFT JOIN diaspora_association_directory d ON d.tenant_id=t.id AND d.organisation_id=o.id
      WHERE t.code=$1 AND o.type='ASSOCIATION' ORDER BY o.nom,o.id LIMIT 150`,[tenant]);
    return r.rows;
  }
  async function verifierAssociation({bureauId,associationId,acteurId,tenant,statut}){
    if(!['VERIFIEE','SUSPENDUE'].includes(statut)) return {ok:false,code:'STATUT_INVALIDE'};
    const c=await obtenirClientDatabase();let open=false;
    try{
      await c.query('BEGIN');open=true;
      const r=await c.query(`
        SELECT t.id AS tenant_id FROM tenants t
        JOIN organisations b ON b.tenant_id=t.id AND b.id=$1 AND b.type='SATEER'
        JOIN organisations a ON a.tenant_id=t.id AND a.id=$2 AND a.type='ASSOCIATION'
        WHERE t.code=$3 AND t.actif=TRUE LIMIT 1 FOR UPDATE OF a`,[bureauId,associationId,tenant]);
      if(r.rowCount!==1){await c.query('ROLLBACK');open=false;return {ok:false,code:'ASSOCIATION_HORS_TENANT'};}
      const tenantId=r.rows[0].tenant_id;
      await c.query(`
        INSERT INTO diaspora_association_directory(tenant_id,organisation_id,statut,modifie_par,date_verification)
        VALUES($1::integer,$2::integer,$3::varchar(16),$4::integer,
          CASE WHEN $3::varchar(16)='VERIFIEE' THEN NOW() ELSE NULL END)
        ON CONFLICT(tenant_id,organisation_id) DO UPDATE SET statut=EXCLUDED.statut,
          modifie_par=EXCLUDED.modifie_par,date_modification=NOW(),
          date_verification=CASE WHEN EXCLUDED.statut='VERIFIEE' THEN NOW() ELSE NULL END`,
        [tenantId,associationId,statut,acteurId]);
      await c.query(`INSERT INTO audit_trail(tenant_id,organisation_id,personne_id,action,entity_type,entity_id,details)
        VALUES($1,$2,$3,'DIASPORA_ASSOCIATION_STATUS','organisations',$4,$5::jsonb)`,
        [tenantId,bureauId,acteurId,String(associationId),JSON.stringify({associationId,statut})]);
      await c.query('COMMIT');open=false;
      return {ok:true,statut};
    }catch(e){if(open)await c.query('ROLLBACK').catch(()=>{});throw e;}
    finally{c.release();}
  }
  return Object.freeze({contexteCitoyen,lister,listerAssociations,modifierTheme,modifierAssociation,
    listerSuivies,listerRepertoireBureau,verifierAssociation});
}
module.exports={THEMES,creerServiceOptinDiaspora};
