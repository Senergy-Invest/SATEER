"use strict";
/** D2B-A : notifications opt-in uniquement au moment d'une approbation Diaspora.
 * Atomicite : le client PostgreSQL est celui de la transition D2A ouverte.
 * Garde-fous : source et public autorises, abonnement actif, 3 alertes/24h,
 * pas de doublon meme si personne suit a la fois l'association et le theme.
 */
async function notifierAbonnesDiaspora(client,publicationId){
  if(!client||typeof client.query!=='function')throw new TypeError('CLIENT_TRANSACTIONNEL_REQUIS');
  if(!Number.isSafeInteger(publicationId)||publicationId<=0)throw new TypeError('PUBLICATION_INVALIDE');
  // Serialize les approbations pour que le quota 24h reste fiable meme en concurrence.
  const lock=await client.query(`
    SELECT pg_advisory_xact_lock(hashtextextended('diaspora-fanout:' || p.tenant_id::text,0))
    FROM publications p WHERE p.id=$1`,[publicationId]);
  if(lock.rowCount!==1)throw new Error('PUBLICATION_FANOUT_INTROUVABLE');
  const result=await client.query(`
    INSERT INTO notifications(tenant_id,personne_id,organisation_id,type,titre,message,
      reference_type,reference_id,canal,metadata)
    SELECT DISTINCT p.tenant_id,s.personne_id,p.organisation_id,
      'DIASPORA_ABONNEMENT',p.titre,
      CASE WHEN EXISTS(SELECT 1 FROM diaspora_sponsored_publications sp
          WHERE sp.publication_id=p.id AND sp.tenant_id=p.tenant_id)
        THEN 'Communication sponsorisée : une publication correspond à vos choix volontaires.'
        ELSE 'Une information correspondant à vos abonnements Diaspora a été validée.' END,
      'PUBLICATION',p.id,'DIASPORA',
      jsonb_build_object('experience','DIASPORA','sourceOrganisationId',p.organisation_id,
       'sponsorise',EXISTS(SELECT 1 FROM diaspora_sponsored_publications sp
         WHERE sp.publication_id=p.id AND sp.tenant_id=p.tenant_id))
    FROM publications p JOIN organisations o ON o.id=p.organisation_id AND o.tenant_id=p.tenant_id
    JOIN tenants t ON t.id=p.tenant_id AND t.actif=TRUE
    JOIN diaspora_subscriptions s ON s.tenant_id=t.id AND s.actif=TRUE
    LEFT JOIN diaspora_publication_geo_targets geo_target
      ON geo_target.publication_id=p.id AND geo_target.tenant_id=p.tenant_id
         AND geo_target.organisation_id=p.organisation_id
    WHERE p.id=$1 AND p.statut='PUBLIEE' AND p.statut_diffusion_diaspora='DIFFUSEE'
      AND p.audience_type='TOUS'
      -- Une zone configurée exige un opt-in géographique exact.
      -- Aucun suivi implicite par localisation réelle ou adresse personnelle.
      AND (geo_target.publication_id IS NULL OR EXISTS (
        SELECT 1 FROM diaspora_geo_preferences gp
        JOIN territories area ON area.id=gp.territory_id AND area.actif=TRUE
        WHERE gp.tenant_id=p.tenant_id AND gp.personne_id=s.personne_id
          AND gp.actif=TRUE AND gp.territory_id=geo_target.territory_id))
      -- Le consentement commercial ne peut être déduit des suivis ordinaires.
      AND (NOT EXISTS (SELECT 1 FROM diaspora_sponsored_publications sp
        WHERE sp.publication_id=p.id AND sp.tenant_id=p.tenant_id)
        OR EXISTS (SELECT 1 FROM diaspora_sponsor_optins so
          WHERE so.tenant_id=p.tenant_id AND so.personne_id=s.personne_id AND so.actif=TRUE))
      -- Les alertes sponsorisées ont un quota distinct d'une seule par 24 heures.
      AND (NOT EXISTS (SELECT 1 FROM diaspora_sponsored_publications sp
        WHERE sp.publication_id=p.id AND sp.tenant_id=p.tenant_id)
        OR (SELECT COUNT(*) FROM notifications promo
         WHERE promo.tenant_id=p.tenant_id AND promo.personne_id=s.personne_id
           AND promo.type='DIASPORA_ABONNEMENT' AND promo.metadata->>'sponsorise'='true'
           AND promo.date_creation>=NOW()-INTERVAL '24 hours') < 1)
      AND (o.type<>'ASSOCIATION' OR EXISTS(
        SELECT 1 FROM diaspora_association_directory d
        WHERE d.tenant_id=p.tenant_id AND d.organisation_id=o.id AND d.statut='VERIFIEE'))
      AND ((s.theme_code IS NOT NULL AND s.theme_code=p.categorie AND
           s.theme_code IN ('EVENEMENT','FORMATION','EMPLOI','ENTREPRENEURIAT','CULTURE','COMMUNAUTE'))
        OR (s.association_id IS NOT NULL AND s.association_id=o.id AND o.type='ASSOCIATION'))
      AND EXISTS(SELECT 1 FROM relations_personne_organisation m
        JOIN organisations member_org ON member_org.id=m.organisation_id AND member_org.tenant_id=p.tenant_id
        WHERE m.personne_id=s.personne_id)
      AND NOT EXISTS(SELECT 1 FROM notifications n
        WHERE n.tenant_id=p.tenant_id AND n.personne_id=s.personne_id
          AND n.reference_type='PUBLICATION' AND n.reference_id=p.id
          AND n.type IN ('DIASPORA_ABONNEMENT','PUBLICATION_CANAL'))
      AND (SELECT COUNT(*) FROM notifications recent
        WHERE recent.tenant_id=p.tenant_id AND recent.personne_id=s.personne_id
          AND recent.type='DIASPORA_ABONNEMENT'
          AND recent.date_creation>=NOW()-INTERVAL '24 hours') < 3
    ON CONFLICT DO NOTHING
    RETURNING id`,[publicationId]);
  return result.rowCount;
}
module.exports={notifierAbonnesDiaspora};
