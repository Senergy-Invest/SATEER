"use strict";
/** D2B-C1 : opt-in commercial independant des themes et des zones.
 * Sponsor = organisation authentifiee source. Pas de marque tierce ni de paiement.
 * Le marquage est bloque a partir de la soumission au Bureau SATEER.
 */
function creerServiceSponsorDiaspora({executerRequete,obtenirClientDatabase}){
 if(typeof executerRequete!=='function'||typeof obtenirClientDatabase!=='function')throw new TypeError('DEPENDANCES_SPONSOR_REQUISES');
 async function lireConsentement(personneId,tenant){
  const r=await executerRequete(`SELECT COALESCE(s.actif,FALSE) AS actif,s.date_consentement,s.date_retrait
    FROM tenants t LEFT JOIN diaspora_sponsor_optins s ON s.tenant_id=t.id AND s.personne_id=$1::integer
    WHERE t.code=$2::text AND t.actif=TRUE LIMIT 1`,[personneId,tenant]);
  return {actif:r.rows[0]?.actif===true,dateConsentement:r.rows[0]?.date_consentement||null,dateRetrait:r.rows[0]?.date_retrait||null};
 }
 async function modifierConsentement(personneId,tenant,actif){
  if(typeof actif!=='boolean')return {ok:false,code:'CONSENTEMENT_INVALIDE'};
  const c=await obtenirClientDatabase();let open=false;
  try{
   await c.query('BEGIN');open=true;
   const t=await c.query(`SELECT t.id FROM tenants t WHERE t.code=$2::text AND t.actif=TRUE
    AND EXISTS(SELECT 1 FROM relations_personne_organisation r
      JOIN organisations o ON o.id=r.organisation_id AND o.tenant_id=t.id
      WHERE r.personne_id=$1::integer) FOR SHARE OF t`,[personneId,tenant]);
   if(t.rowCount!==1){await c.query('ROLLBACK');open=false;return{ok:false,code:'ACCES_TENANT_REFUSE'};}
   const tenantId=t.rows[0].id;
   await c.query(`INSERT INTO diaspora_sponsor_optins(tenant_id,personne_id,actif,date_consentement,date_retrait,date_modification)
     VALUES($1::integer,$2::integer,$3::boolean,CASE WHEN $3::boolean THEN NOW() ELSE NULL END,
       CASE WHEN $3::boolean THEN NULL ELSE NOW() END,NOW())
     ON CONFLICT(tenant_id,personne_id) DO UPDATE SET
       actif=EXCLUDED.actif, date_modification=NOW(),
       date_consentement=CASE WHEN EXCLUDED.actif AND NOT diaspora_sponsor_optins.actif
        THEN NOW() ELSE diaspora_sponsor_optins.date_consentement END,
       date_retrait=CASE WHEN NOT EXCLUDED.actif THEN NOW() ELSE NULL END`,[tenantId,personneId,actif]);
   await c.query(`INSERT INTO audit_trail(tenant_id,personne_id,action,entity_type,entity_id,details)
    VALUES($1::integer,$2::integer,'DIASPORA_SPONSOR_CONSENT','personnes',$3::text,$4::jsonb)`,
    [tenantId,personneId,String(personneId),JSON.stringify({actif,consentVersion:'D2BC1',canal:'DIASPORA'})]);
   await c.query('COMMIT');open=false;return{ok:true,actif};
  }catch(e){if(open)await c.query('ROLLBACK').catch(()=>{});throw e;}
  finally{c.release();}
 }
 async function definirSponsorisation({organisationId,publicationId,acteurId,tenant,sponsorise}){
  if(typeof sponsorise!=='boolean')return{ok:false,code:'MARQUAGE_INVALIDE'};
  const c=await obtenirClientDatabase();let open=false;
  try{
   await c.query('BEGIN');open=true;
   const r=await c.query(`SELECT p.id,p.tenant_id,p.organisation_id,p.statut,p.statut_diffusion_diaspora,
       p.audience_type,p.medias,p.categorie
     FROM publications p JOIN organisations o ON o.id=p.organisation_id AND o.tenant_id=p.tenant_id
     JOIN tenants t ON t.id=p.tenant_id AND t.actif=TRUE
     WHERE p.id=$1::integer AND p.organisation_id=$2::integer AND t.code=$3::text
     FOR UPDATE OF p`,[publicationId,organisationId,tenant]);
   if(r.rowCount!==1){await c.query('ROLLBACK');open=false;return{ok:false,code:'PUBLICATION_HORS_PERIMETRE'};}
   const p=r.rows[0];
   if(p.statut!=='PUBLIEE'||p.statut_diffusion_diaspora!=='NON_DEMANDEE'||p.audience_type!=='TOUS'||
      !Array.isArray(p.medias)||p.medias.length!==0){
     await c.query('ROLLBACK');open=false;return{ok:false,code:'MARQUAGE_NON_MODIFIABLE'};
   }
   if(sponsorise){
    await c.query(`INSERT INTO diaspora_sponsored_publications(publication_id,tenant_id,organisation_id,sponsor_organisation_id,defini_par)
     VALUES($1::integer,$2::integer,$3::integer,$3::integer,$4::integer)
     ON CONFLICT(publication_id) DO UPDATE SET defini_par=EXCLUDED.defini_par,
       date_declaration=NOW()`,[publicationId,p.tenant_id,organisationId,acteurId]);
   }else{
    await c.query(`DELETE FROM diaspora_sponsored_publications
      WHERE publication_id=$1::integer AND tenant_id=$2::integer AND organisation_id=$3::integer`,
      [publicationId,p.tenant_id,organisationId]);
   }
   await c.query(`INSERT INTO audit_trail(tenant_id,organisation_id,personne_id,action,entity_type,entity_id,details)
    VALUES($1::integer,$2::integer,$3::integer,'DIASPORA_SPONSOR_MARK','publications',$4::text,$5::jsonb)`,
    [p.tenant_id,organisationId,acteurId,String(publicationId),JSON.stringify({sponsorise,sponsorOrganisationId:organisationId})]);
   await c.query('COMMIT');open=false;return{ok:true,sponsorise};
  }catch(e){if(open)await c.query('ROLLBACK').catch(()=>{});throw e;}
  finally{c.release();}
 }
 async function listerMarquages(ids,tenant){
  if(!Array.isArray(ids)||ids.length===0)return[];
  const valid=ids.filter(x=>Number.isSafeInteger(x)&&x>0).slice(0,100);
  if(!valid.length)return[];
  const r=await executerRequete(`SELECT p.id,o.nom AS sponsor_nom FROM diaspora_sponsored_publications sp
    JOIN publications p ON p.id=sp.publication_id AND p.tenant_id=sp.tenant_id AND p.organisation_id=sp.organisation_id
    JOIN organisations o ON o.id=sp.sponsor_organisation_id AND o.tenant_id=sp.tenant_id
    JOIN tenants t ON t.id=sp.tenant_id AND t.actif=TRUE
    WHERE t.code=$1::text AND p.id=ANY($2::integer[])`,[tenant,valid]);
  return r.rows;
 }
 return Object.freeze({lireConsentement,modifierConsentement,definirSponsorisation,listerMarquages});
}
module.exports={creerServiceSponsorDiaspora};
