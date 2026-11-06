"use strict";
// Moteur P3.1: organismes destinataires, sans logique consulaire ou association codée en dur.
const { executerRequete, obtenirClientDatabase } = require("./database");
const { notifierAbonnesPublication } = require("./communication-notifications");

async function verifierOrganisationCible(tenantCode, organisationId, cibleId) {
  const r = await executerRequete(`
    SELECT 1
    FROM tenants t
    JOIN organisations src ON src.tenant_id=t.id AND src.id=$2
    JOIN organisation_relationships rel ON rel.tenant_id=t.id
      AND rel.target_organisation_id=src.id AND rel.source_organisation_id=$3
      AND rel.actif=TRUE AND rel.statut='ACTIVE'
      AND (rel.date_fin IS NULL OR rel.date_fin > CURRENT_TIMESTAMP)
    JOIN organisations dest ON dest.id=rel.source_organisation_id
      AND dest.tenant_id=t.id
    WHERE t.code=$1 LIMIT 1`, [tenantCode,organisationId,cibleId]);
  return r.rowCount > 0;
}

async function creerPublicationMultiOrganisationsDatabase({tenantCode,organisationId,personneId,titre,contenu,categorie,priorite,medias,communicationChannelId,cibles}) {
  // Une seule instruction SQL, atomique: une publication ne peut exister sans ses cibles.
  const client=await obtenirClientDatabase();
  try {
  await client.query('BEGIN');
  const r=await client.query(`
    WITH scope AS (
      SELECT t.id AS tenant_id
      FROM tenants t JOIN organisations puborg ON puborg.tenant_id=t.id
      WHERE t.code=$1 AND puborg.id=$2
    ), cibles_autorisees AS (
      SELECT DISTINCT r.source_organisation_id AS organisation_id
      FROM organisation_relationships r
      JOIN scope s ON r.tenant_id=s.tenant_id
      JOIN organisations cible ON cible.id=r.source_organisation_id AND cible.tenant_id=s.tenant_id
      WHERE r.target_organisation_id=$2
        AND r.source_organisation_id=ANY($10::bigint[])
        AND r.actif=TRUE AND r.statut='ACTIVE'
        AND (r.date_fin IS NULL OR r.date_fin > CURRENT_TIMESTAMP)
    ), nouvelle_publication AS (
      INSERT INTO publications (
        tenant_id,organisation_id,publie_par,titre,contenu,categorie,priorite,
        audience_type,audience_valeur,medias,statut,statut_diffusion_diaspora,
        communication_channel_id
      ) SELECT s.tenant_id,$2,$3,$4,$5,$6,$7,'ORGANISATIONS',NULL,$8::jsonb,
          'PUBLIEE','NON_DEMANDEE',$9::bigint
        FROM scope s
        WHERE cardinality($10::bigint[]) BETWEEN 1 AND 30
          AND (SELECT COUNT(*) FROM cibles_autorisees)=cardinality($10::bigint[])
          AND ($9::bigint IS NULL OR EXISTS (
            SELECT 1 FROM communication_channels ch WHERE ch.id=$9
              AND ch.tenant_id=s.tenant_id AND ch.organisation_id=$2
              AND ch.actif=TRUE AND ch.visibility='PUBLIC'
          ))
        RETURNING id,tenant_id,organisation_id,publie_par,titre,contenu,
          categorie,priorite,audience_type,audience_valeur,medias,statut,
          date_publication,communication_channel_id
    ), cibles_ecrites AS (
      INSERT INTO communication_publication_targets (
        tenant_id,publication_id,organisation_id,target_organisation_id
      ) SELECT p.tenant_id,p.id,p.organisation_id,c.organisation_id
        FROM nouvelle_publication p CROSS JOIN cibles_autorisees c
      RETURNING publication_id
    )
    SELECT p.*, (SELECT COUNT(*)::int FROM cibles_ecrites) AS nombre_destinataires
    FROM nouvelle_publication p
  `,[tenantCode,organisationId,personneId,titre,contenu,categorie,priorite,
     JSON.stringify(medias||[]),communicationChannelId,cibles]);
  if(!r.rows[0]){await client.query('ROLLBACK');return null;}
  if(r.rows[0].communication_channel_id!=null)await notifierAbonnesPublication(client,r.rows[0].id);
  await client.query('COMMIT');
  return r.rows[0];
  } catch(error) {
    await client.query('ROLLBACK').catch(()=>{});
    throw error;
  } finally { client.release(); }
}
module.exports={verifierOrganisationCible,creerPublicationMultiOrganisationsDatabase};
