"use strict";
/** D2B-B — consentement territorial explicite, sans suivi GPS, adresse ni inférence.
 * Une cible géographique contrôle les NOTIFICATIONS volontaires uniquement.
 * Le fil général D1 reste public aux membres autorisés du tenant.
 * MVP : égalité exacte des ID de territoire (pas d'héritage ville/département).
 */
const TYPES = Object.freeze(['VILLE', 'DEPARTEMENT', 'REGION']);
function creerServiceGeoDiaspora({executerRequete, obtenirClientDatabase}) {
  if(typeof executerRequete!=='function'||typeof obtenirClientDatabase!=='function')
    throw new TypeError('DEPENDANCES_GEO_REQUISES');

  async function chercherTerritoires(q) {
    if(typeof q!=='string'||q.length>70) throw new TypeError('RECHERCHE_INVALIDE');
    const filtre=q.trim().slice(0,60).replace(/[~%_]/g,'~$&');
    const r=await executerRequete(`
      SELECT v.id,v.nom,v.type,c.code_iso2 AS pays
      FROM territories v JOIN countries c ON c.id=v.country_id AND c.actif=TRUE
      WHERE v.actif=TRUE AND v.type IN ('VILLE','DEPARTEMENT','REGION')
        AND ($1::text='' OR v.nom ILIKE '%' || $1::text || '%' ESCAPE '~')
      ORDER BY v.nom,v.id LIMIT 50`,[filtre]);
    return r.rows;
  }

  async function listerPreferences(personneId,tenant) {
    const r=await executerRequete(`
      SELECT v.id,v.nom,v.type,c.code_iso2 AS pays,g.actif
      FROM diaspora_geo_preferences g JOIN tenants t ON t.id=g.tenant_id AND t.actif=TRUE
      JOIN territories v ON v.id=g.territory_id
      JOIN countries c ON c.id=v.country_id
      WHERE t.code=$2 AND g.personne_id=$1
      ORDER BY v.nom,v.id`,[personneId,tenant]);
    return r.rows;
  }
  async function modifierPreference(personneId,tenant,territoryId,actif) {
    if(actif){
      const r=await executerRequete(`
        INSERT INTO diaspora_geo_preferences(tenant_id,personne_id,territory_id,actif)
        SELECT t.id,$1::integer,v.id,TRUE FROM tenants t
        JOIN territories v ON v.id=$3::integer AND v.actif=TRUE
          AND v.type IN ('VILLE','DEPARTEMENT','REGION')
        JOIN countries c ON c.id=v.country_id AND c.actif=TRUE
        WHERE t.code=$2::text AND t.actif=TRUE
          AND EXISTS(SELECT 1 FROM relations_personne_organisation m
            JOIN organisations o ON o.id=m.organisation_id AND o.tenant_id=t.id
            WHERE m.personne_id=$1::integer)
        ON CONFLICT(tenant_id,personne_id,territory_id)
        DO UPDATE SET actif=TRUE,date_modification=NOW() RETURNING territory_id`,
        [personneId,tenant,territoryId]);
      return r.rowCount?{ok:true,actif:true}:{ok:false,code:'TERRITOIRE_NON_AUTORISE'};
    }
    await executerRequete(`
      UPDATE diaspora_geo_preferences g SET actif=FALSE,date_modification=NOW()
      FROM tenants t WHERE g.tenant_id=t.id AND t.code=$2::text
        AND g.personne_id=$1::integer AND g.territory_id=$3::integer AND g.actif=TRUE`,
      [personneId,tenant,territoryId]);
    return {ok:true,actif:false};
  }

  // Transaction et verrou publication : impossible de modifier la cible après
  // SOUMISE, même pendant une approbation concurrente par le Bureau SATEER.
  async function definirCible({organisationId,publicationId,territoryId,acteurId,tenant}) {
    const client=await obtenirClientDatabase();let begun=false;
    try {
      await client.query('BEGIN');begun=true;
      const r=await client.query(`
        SELECT p.id,p.tenant_id,p.organisation_id,p.statut,p.statut_diffusion_diaspora,
          p.audience_type,p.medias
        FROM publications p JOIN organisations o
          ON o.id=p.organisation_id AND o.tenant_id=p.tenant_id
        JOIN tenants t ON t.id=p.tenant_id AND t.actif=TRUE
        WHERE p.id=$1::integer AND p.organisation_id=$2::integer AND t.code=$3::text
        FOR UPDATE OF p`,[publicationId,organisationId,tenant]);
      if(r.rowCount!==1){await client.query('ROLLBACK');begun=false;return {ok:false,code:'PUBLICATION_HORS_PERIMETRE'};}
      const p=r.rows[0];
      if(p.statut!=='PUBLIEE'||p.statut_diffusion_diaspora!=='NON_DEMANDEE'
        ||p.audience_type!=='TOUS'||!Array.isArray(p.medias)||p.medias.length!==0){
        await client.query('ROLLBACK');begun=false;return {ok:false,code:'CIBLAGE_NON_MODIFIABLE'};
      }
      if(territoryId!==null){
        const found=await client.query(`
          SELECT v.id FROM territories v JOIN countries c ON c.id=v.country_id AND c.actif=TRUE
          WHERE v.id=$1::integer AND v.actif=TRUE AND v.type IN ('VILLE','DEPARTEMENT','REGION')`,[territoryId]);
        if(found.rowCount!==1){await client.query('ROLLBACK');begun=false;return {ok:false,code:'TERRITOIRE_INVALIDE'};}
        await client.query(`
          INSERT INTO diaspora_publication_geo_targets
            (publication_id,tenant_id,organisation_id,territory_id,defini_par)
          VALUES($1::integer,$2::integer,$3::integer,$4::integer,$5::integer)
          ON CONFLICT(publication_id) DO UPDATE SET territory_id=EXCLUDED.territory_id,
            defini_par=EXCLUDED.defini_par,date_modification=NOW()`,
          [publicationId,p.tenant_id,organisationId,territoryId,acteurId]);
      } else {
        await client.query(`DELETE FROM diaspora_publication_geo_targets
          WHERE publication_id=$1::integer AND tenant_id=$2::integer AND organisation_id=$3::integer`,
          [publicationId,p.tenant_id,organisationId]);
      }
      await client.query(`
        INSERT INTO audit_trail(tenant_id,organisation_id,personne_id,action,entity_type,entity_id,details)
        VALUES($1::integer,$2::integer,$3::integer,'DIASPORA_GEO_TARGET',
          'publications',$4::text,$5::jsonb)`,
        [p.tenant_id,organisationId,acteurId,String(publicationId),JSON.stringify({territoryId})]);
      await client.query('COMMIT');begun=false;
      return {ok:true,territoryId};
    } catch(err){if(begun)await client.query('ROLLBACK').catch(()=>{});throw err;}
    finally {client.release();}
  }
  return Object.freeze({chercherTerritoires,listerPreferences,modifierPreference,definirCible});
}
module.exports={creerServiceGeoDiaspora,TYPES};
