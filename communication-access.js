"use strict";

// Contrat transversal des publications canal : un abonné doit également
// disposer d'un rattachement direct à l'émetteur ou d'une relation active
// entre une organisation dont il est membre et l'organisation émettrice.
// Les alias SQL du prédicat ci-dessous sont pub (publication) et p (personne).
// Réutilisé pour le fan-out et pour l'accès en lecture aux publications
// générales reçues par abonnement. Aucune nouvelle table ni migration.
const ELIGIBILITE_ABONNE_SQL = `(
  EXISTS (
    SELECT 1 FROM relations_personne_organisation direct_member
    WHERE direct_member.personne_id=p.id
      AND direct_member.organisation_id=pub.organisation_id
  )
  OR EXISTS (
    SELECT 1 FROM relations_personne_organisation external_member
    JOIN organisations destination
      ON destination.id=external_member.organisation_id
     AND destination.tenant_id=pub.tenant_id
     AND destination.type='ASSOCIATION'
    JOIN organisation_relationships active_link
      ON active_link.source_organisation_id=destination.id
     AND active_link.target_organisation_id=pub.organisation_id
     AND active_link.tenant_id=pub.tenant_id
     AND active_link.type='COMMUNITY_MEMBER'
     AND active_link.actif=TRUE AND active_link.statut='ACTIVE'
     AND (active_link.date_fin IS NULL OR active_link.date_fin>CURRENT_TIMESTAMP)
    WHERE external_member.personne_id=p.id
  )
)`;

// Cette fonction autorise uniquement les publications générales effectivement
// publiées sur un canal PUBLIC actif auquel la personne est abonnée.
// La visibilité des audiences spécifiques ASSOCIATION / ORGANISATIONS est
// toujours déterminée par le moteur de lecture déjà existant.
async function listerIdsPublicationsGeneralesAbonne(clientQuery, personneId, organisationId, tenantCode) {
  const result = await clientQuery(`
    SELECT pub.id
    FROM publications pub
    JOIN tenants t ON t.id=pub.tenant_id
    JOIN personnes p ON p.id=$1
    JOIN communication_channels ch
      ON ch.id=pub.communication_channel_id
     AND ch.tenant_id=pub.tenant_id
     AND ch.organisation_id=pub.organisation_id
     AND ch.actif=TRUE AND ch.visibility='PUBLIC'
    JOIN communication_channel_subscriptions sub
      ON sub.channel_id=ch.id AND sub.tenant_id=pub.tenant_id
     AND sub.organisation_id=pub.organisation_id
     AND sub.personne_id=p.id AND sub.actif=TRUE
    LEFT JOIN territories territory ON territory.id=p.residence_territory_id
    WHERE pub.organisation_id=$2 AND t.code=$3 AND pub.statut='PUBLIEE'
      AND (
        pub.audience_type='TOUS'
        OR (pub.audience_type='DEPARTEMENT'
          AND (pub.audience_valeur=territory.nom OR pub.audience_valeur=p.departement))
        OR (pub.audience_type='PROFIL' AND pub.audience_valeur=p.profil)
      )
      AND ${ELIGIBILITE_ABONNE_SQL}
  `, [personneId, organisationId, tenantCode]);
  return new Set(result.rows.map(row => String(row.id)));
}

module.exports = { ELIGIBILITE_ABONNE_SQL, listerIdsPublicationsGeneralesAbonne };
