"use strict";

// Fan-out notifications only to active channel subscribers who are independently
// eligible for the publication audience. The caller owns the surrounding SQL
// transaction so publication and notification creation commit together.
async function notifierAbonnesPublication(client, publicationId) {
  const id = Number(publicationId);
  if (!Number.isSafeInteger(id) || id <= 0) return 0;

  // Serialize retries for this publication without adding a second delivery table.
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('communication-publication:' || $1::text, 0))",
    [id]
  );

  const result = await client.query(`
    INSERT INTO notifications (
      tenant_id, personne_id, organisation_id, type, titre, message,
      reference_type, reference_id, canal, metadata
    )
    SELECT pub.tenant_id, sub.personne_id, pub.organisation_id,
      'PUBLICATION_CANAL', pub.titre,
      'Une nouvelle information est disponible dans le canal « ' || ch.nom || ' ».',
      'PUBLICATION', pub.id, ch.code,
      jsonb_build_object('communicationChannelId', ch.id, 'communicationChannelName', ch.nom)
    FROM publications pub
    JOIN communication_channels ch
      ON ch.id=pub.communication_channel_id
     AND ch.tenant_id=pub.tenant_id AND ch.organisation_id=pub.organisation_id
     AND ch.actif=TRUE AND ch.visibility='PUBLIC'
    JOIN communication_channel_subscriptions sub
      ON sub.channel_id=ch.id AND sub.tenant_id=pub.tenant_id
     AND sub.organisation_id=pub.organisation_id AND sub.actif=TRUE
    JOIN personnes p ON p.id=sub.personne_id
    LEFT JOIN territories territory ON territory.id=p.residence_territory_id
    WHERE pub.id=$1 AND pub.statut='PUBLIEE'
      AND (
        pub.audience_type='TOUS'
        OR (pub.audience_type='DEPARTEMENT'
          AND (pub.audience_valeur=territory.nom OR pub.audience_valeur=p.departement))
        OR (pub.audience_type='PROFIL' AND pub.audience_valeur=p.profil)
        OR (pub.audience_type='ASSOCIATION' AND EXISTS (
          SELECT 1
          FROM relations_personne_organisation member
          JOIN organisations association ON association.id=member.organisation_id
            AND association.tenant_id=pub.tenant_id
          JOIN organisation_relationships rel ON rel.source_organisation_id=association.id
            AND rel.target_organisation_id=pub.organisation_id
            AND rel.tenant_id=pub.tenant_id AND rel.actif=TRUE AND rel.statut='ACTIVE'
            AND (rel.date_fin IS NULL OR rel.date_fin>CURRENT_TIMESTAMP)
          WHERE member.personne_id=p.id AND association.id::text=pub.audience_valeur
        ))
        OR (pub.audience_type='ORGANISATIONS' AND EXISTS (
          SELECT 1
          FROM communication_publication_targets target
          JOIN organisations destination ON destination.id=target.target_organisation_id
            AND destination.tenant_id=pub.tenant_id
          JOIN relations_personne_organisation member ON member.organisation_id=destination.id
            AND member.personne_id=p.id
          JOIN organisation_relationships rel ON rel.source_organisation_id=destination.id
            AND rel.target_organisation_id=pub.organisation_id
            AND rel.tenant_id=pub.tenant_id AND rel.actif=TRUE AND rel.statut='ACTIVE'
            AND (rel.date_fin IS NULL OR rel.date_fin>CURRENT_TIMESTAMP)
          WHERE target.publication_id=pub.id AND target.tenant_id=pub.tenant_id
            AND target.organisation_id=pub.organisation_id
        ))
      )
      AND NOT EXISTS (
        SELECT 1 FROM notifications existing
        WHERE existing.tenant_id=pub.tenant_id
          AND existing.personne_id=sub.personne_id
          AND existing.organisation_id=pub.organisation_id
          AND existing.type='PUBLICATION_CANAL'
          AND existing.reference_type='PUBLICATION'
          AND existing.reference_id=pub.id
      )
    RETURNING id
  `, [id]);
  return result.rowCount;
}

module.exports = { notifierAbonnesPublication };
