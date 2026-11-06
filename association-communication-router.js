"use strict";

const express = require("express");
const crypto = require("node:crypto");
const { executerRequete, obtenirClientDatabase } = require("./database");
const { exigerSession } = require("./auth-http");
const { exigerPermission } = require("./auth-authorization");
const {
  obtenirPermissionsEffectivesDatabase,
  listerPublicationsVisiblesPourPersonneDatabase
} = require("./services-database");

const router = express.Router();
const VALID_TENANT = /^[A-Za-z0-9_-]{1,30}$/;
const VALID_ID = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;

function scope(req, res, next) {
  const organisationId = Number(req.params.organisationId);
  const tenantCode = String(req.body?.tenantCode || req.query?.tenant || "").trim();
  if (!VALID_ID(organisationId) || !VALID_TENANT.test(tenantCode)) {
    return res.status(400).json({ statut: "CONTEXTE_INVALIDE" });
  }
  req.associationScope = { organisationId, tenantCode };
  next();
}

async function verifierMembre(req, res, next) {
  try {
    const { organisationId, tenantCode } = req.associationScope;
    const result = await executerRequete(`
      SELECT 1
      FROM relations_personne_organisation rel
      JOIN organisations org ON org.id=rel.organisation_id
      JOIN tenants t ON t.id=org.tenant_id
      WHERE rel.personne_id=$1 AND rel.organisation_id=$2 AND t.code=$3 AND org.type='ASSOCIATION'
      LIMIT 1
    `, [req.auth.personneId, organisationId, tenantCode]);
    if (!result.rowCount) return res.status(403).json({ statut: "PERSONNE_HORS_ORGANISATION" });
    next();
  } catch (error) {
    console.error("Association membership check:", error);
    return res.status(500).json({ statut: "ERREUR_RELATION_ASSOCIATION" });
  }
}

async function verifierTypeOrganisation(organisationId, tenantCode, type) {
  const result = await executerRequete(`
    SELECT org.id, org.nom, org.type, t.id AS tenant_id
    FROM organisations org JOIN tenants t ON t.id=org.tenant_id
    WHERE org.id=$1 AND t.code=$2 AND org.type=$3
  `, [organisationId, tenantCode, type]);
  return result.rows[0] || null;
}

async function auditer(client, { tenantId, organisationId, personneId, action, entityType, entityId, details }) {
  await client.query(`
    INSERT INTO audit_trail (tenant_id, organisation_id, personne_id, action, entity_type, entity_id, details)
    VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
  `, [tenantId, organisationId, personneId, action, entityType, String(entityId), JSON.stringify(details || {})]);
}

async function ouvrirRelation(client, { tenantId, sourceOrganisationId, targetOrganisationId, personneId, sourceType, relationId }) {
  const result = await client.query(`
    INSERT INTO organisation_relationships
      (tenant_id, source_organisation_id, target_organisation_id, type, statut, actif, metadata, date_debut, date_fin)
    VALUES ($1,$2,$3,'COMMUNITY_MEMBER','ACTIVE',TRUE,
      jsonb_build_object('source','ASSOCIATION_COMMUNICATION','relationId',$4::integer,'acceptedBy',$5::integer),
      CURRENT_TIMESTAMP,NULL)
    ON CONFLICT (tenant_id,source_organisation_id,target_organisation_id,type)
    DO UPDATE SET statut='ACTIVE', actif=TRUE, date_debut=CURRENT_TIMESTAMP, date_fin=NULL,
      date_modification=CURRENT_TIMESTAMP,
      metadata=organisation_relationships.metadata || EXCLUDED.metadata
    RETURNING id
  `, [tenantId, sourceOrganisationId, targetOrganisationId, relationId, personneId]);
  await auditer(client, {
    tenantId, organisationId: targetOrganisationId, personneId,
    action: "ORGANISATION_RELATION_ACTIVATED", entityType: "organisation_relationships",
    entityId: result.rows[0].id, details: { sourceOrganisationId, targetOrganisationId, sourceType, relationId }
  });
  return Number(result.rows[0].id);
}

// Consulate workspace: connected associations, pending links and same-tenant
// association organizations available for an in-app invitation.
router.get("/:organisationId/association-partners",
  ...exigerPermission("MANAGE_ORGANISATION_RELATIONSHIPS", "ORGANISATION"), scope,
  async (req, res) => {
    try {
      const { organisationId, tenantCode } = req.associationScope;
      if (!(await verifierTypeOrganisation(organisationId, tenantCode, "CONSULAT")))
        return res.status(404).json({ statut: "ORGANISATION_EMETTRICE_INTROUVABLE" });
      const result = await executerRequete(`
        SELECT org.id, org.nom,
          rel.id AS relation_id, rel.statut AS relation_statut,
          rel.actif AS relation_active, rel.date_debut, rel.date_fin,
          invite.id AS invitation_id, invite.statut AS invitation_statut,
          request.id AS demande_id, request.statut AS demande_statut
        FROM organisations org
        JOIN tenants t ON t.id=org.tenant_id
        LEFT JOIN organisation_relationships rel
          ON rel.tenant_id=t.id AND rel.source_organisation_id=org.id
          AND rel.target_organisation_id=$1 AND rel.type='COMMUNITY_MEMBER'
        LEFT JOIN LATERAL (
          SELECT i.id,i.statut FROM organisation_invitations i
          WHERE i.tenant_id=t.id AND i.organisation_source_id=$1
            AND i.organisation_acceptee_id=org.id AND i.type_relation='COMMUNITY_MEMBER'
          ORDER BY i.date_creation DESC LIMIT 1
        ) invite ON TRUE
        LEFT JOIN LATERAL (
          SELECT jr.id,jr.statut FROM organisation_join_requests jr
          WHERE jr.tenant_id=t.id AND jr.organisation_demandeuse_id=org.id
            AND jr.organisation_cible_id=$1 AND jr.type_relation='COMMUNITY_MEMBER'
          ORDER BY jr.date_creation DESC LIMIT 1
        ) request ON TRUE
        WHERE t.code=$2 AND org.type='ASSOCIATION'
        ORDER BY org.nom,org.id
      `, [organisationId, tenantCode]);
      return res.set("Cache-Control", "private, no-store").json({ statut: "ASSOCIATIONS_CHARGEES", associations: result.rows });
    } catch (error) {
      console.error("Load association partners:", error);
      return res.status(500).json({ statut: "ERREUR_ASSOCIATIONS" });
    }
  });

router.post("/:organisationId/association-partners/invitations",
  ...exigerPermission("MANAGE_ORGANISATION_RELATIONSHIPS", "ORGANISATION"), scope,
  async (req, res) => {
    const { organisationId, tenantCode } = req.associationScope;
    const associationId = Number(req.body?.associationOrganizationId);
    if (!VALID_ID(associationId)) return res.status(400).json({ statut: "ASSOCIATION_INVALIDE" });
    const issuer = await verifierTypeOrganisation(organisationId, tenantCode, "CONSULAT");
    const association = await verifierTypeOrganisation(associationId, tenantCode, "ASSOCIATION");
    if (!issuer || !association) return res.status(404).json({ statut: "ORGANISATION_INTROUVABLE" });

    const client = await obtenirClientDatabase();
    try {
      await client.query("BEGIN");
      const existing = await client.query(`
        SELECT id,statut,actif FROM organisation_relationships
        WHERE tenant_id=$1 AND source_organisation_id=$2 AND target_organisation_id=$3
          AND type='COMMUNITY_MEMBER' FOR UPDATE
      `, [issuer.tenant_id, associationId, organisationId]);
      if (existing.rows[0]?.statut === "ACTIVE" && existing.rows[0]?.actif)
        return await (async () => { await client.query("ROLLBACK"); return res.status(409).json({ statut: "RELATION_DEJA_ACTIVE" }); })();
      const pending = await client.query(`
        SELECT id FROM organisation_invitations
        WHERE tenant_id=$1 AND organisation_source_id=$2 AND organisation_acceptee_id=$3
          AND type_relation='COMMUNITY_MEMBER' AND statut='EN_ATTENTE'
        LIMIT 1 FOR UPDATE
      `, [issuer.tenant_id, organisationId, associationId]);
      if (pending.rowCount) {
        await client.query("ROLLBACK");
        return res.status(409).json({ statut: "INVITATION_DEJA_EN_ATTENTE" });
      }
      const token = crypto.randomBytes(32).toString("base64url");
      const invitation = await client.query(`
        INSERT INTO organisation_invitations
          (tenant_id,organisation_source_id,organisation_acceptee_id,email,nom_organisation,
           type_relation,token,statut,invitee_par_personne_id,metadata)
        VALUES ($1,$2,$3,$4,$5,'COMMUNITY_MEMBER',$6,'EN_ATTENTE',$7,$8::jsonb)
        RETURNING id,statut,date_creation
      `, [issuer.tenant_id, organisationId, associationId,
        `organisation-${associationId}@invitations.sateer.invalid`, association.nom, token,
        req.auth.personneId, JSON.stringify({ parcours: "ASSOCIATION_CONNECTEE", emailEnvoye: false })]);
      await auditer(client, {
        tenantId: issuer.tenant_id, organisationId, personneId: req.auth.personneId,
        action: "ASSOCIATION_INVITED", entityType: "organisation_invitations",
        entityId: invitation.rows[0].id, details: { associationId }
      });
      await client.query("COMMIT");
      return res.status(201).json({ statut: "INVITATION_CREEE", invitation: invitation.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Invite association:", error);
      return res.status(500).json({ statut: "ERREUR_INVITATION" });
    } finally { client.release(); }
  });

router.delete("/:organisationId/association-partners/:relationId",
  ...exigerPermission("MANAGE_ORGANISATION_RELATIONSHIPS", "ORGANISATION"), scope,
  async (req, res) => {
    if (!VALID_ID(req.params.relationId)) return res.status(400).json({ statut: "RELATION_INVALIDE" });
    const { organisationId, tenantCode } = req.associationScope;
    const client = await obtenirClientDatabase();
    try {
      await client.query("BEGIN");
      const result = await client.query(`
        UPDATE organisation_relationships rel
        SET actif=FALSE,statut='REVOKED',date_fin=CURRENT_TIMESTAMP,date_modification=CURRENT_TIMESTAMP
        FROM tenants t
        WHERE rel.id=$1 AND rel.target_organisation_id=$2 AND rel.type='COMMUNITY_MEMBER'
          AND rel.tenant_id=t.id AND t.code=$3 AND rel.actif=TRUE AND rel.statut='ACTIVE'
        RETURNING rel.id,rel.tenant_id,rel.source_organisation_id
      `, [req.params.relationId, organisationId, tenantCode]);
      if (!result.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ statut: "RELATION_ACTIVE_INTROUVABLE" });
      }
      const row = result.rows[0];
      await client.query(`
        UPDATE communication_publication_relay_authorizations
        SET revoked_at=CURRENT_TIMESTAMP,revoked_by_personne_id=$3
        WHERE tenant_id=$1 AND source_organisation_id=$2 AND target_organisation_id=$4 AND revoked_at IS NULL
      `, [row.tenant_id, organisationId, req.auth.personneId, row.source_organisation_id]);
      await auditer(client, {
        tenantId: row.tenant_id, organisationId, personneId: req.auth.personneId,
        action: "ASSOCIATION_RELATION_REVOKED", entityType: "organisation_relationships",
        entityId: row.id, details: { associationId: row.source_organisation_id }
      });
      await client.query("COMMIT");
      return res.json({ statut: "RELATION_REVOQUEE", relationId: Number(row.id) });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Revoke association relation:", error);
      return res.status(500).json({ statut: "ERREUR_REVOCATION_RELATION" });
    } finally { client.release(); }
  });

// Association workspace: invitation acceptance/refusal.
router.get("/:organisationId/communication-invitations",
  ...exigerPermission("MANAGE_ORGANISATION_RELATIONSHIPS", "ORGANISATION"), scope,
  async (req, res) => {
    const { organisationId, tenantCode } = req.associationScope;
    if (!(await verifierTypeOrganisation(organisationId, tenantCode, "ASSOCIATION")))
      return res.status(404).json({ statut: "ASSOCIATION_INTROUVABLE" });
    const result = await executerRequete(`
      SELECT i.id,i.statut,i.date_creation,issuer.id AS organisation_source_id,issuer.nom AS organisation_source_nom
      FROM organisation_invitations i
      JOIN tenants t ON t.id=i.tenant_id
      JOIN organisations issuer ON issuer.id=i.organisation_source_id AND issuer.tenant_id=t.id
      WHERE i.tenant_id=(SELECT id FROM tenants WHERE code=$2)
        AND i.organisation_acceptee_id=$1 AND i.type_relation='COMMUNITY_MEMBER'
        AND i.statut='EN_ATTENTE'
      ORDER BY i.date_creation DESC
    `, [organisationId, tenantCode]);
    return res.set("Cache-Control", "private, no-store").json({ statut: "INVITATIONS_CHARGEES", invitations: result.rows });
  });

router.post("/:organisationId/communication-invitations/:invitationId/decision",
  ...exigerPermission("MANAGE_ORGANISATION_RELATIONSHIPS", "ORGANISATION"), scope,
  async (req, res) => {
    const { organisationId, tenantCode } = req.associationScope;
    const decision = req.body?.decision;
    if (!VALID_ID(req.params.invitationId) || !["ACCEPTER", "REFUSER"].includes(decision))
      return res.status(400).json({ statut: "DECISION_INVALIDE" });
    const association = await verifierTypeOrganisation(organisationId, tenantCode, "ASSOCIATION");
    if (!association) return res.status(404).json({ statut: "ASSOCIATION_INTROUVABLE" });
    const client = await obtenirClientDatabase();
    try {
      await client.query("BEGIN");
      const invitation = await client.query(`
        SELECT i.id,i.tenant_id,i.organisation_source_id
        FROM organisation_invitations i
        WHERE i.id=$1 AND i.tenant_id=$2 AND i.organisation_acceptee_id=$3
          AND i.type_relation='COMMUNITY_MEMBER' AND i.statut='EN_ATTENTE'
        FOR UPDATE
      `, [req.params.invitationId, association.tenant_id, organisationId]);
      if (!invitation.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ statut: "INVITATION_INTROUVABLE" });
      }
      const row = invitation.rows[0];
      const newStatus = decision === "ACCEPTER" ? "ACCEPTEE" : "REFUSEE";
      await client.query(`
        UPDATE organisation_invitations SET statut=$2::varchar,date_acceptation=CASE WHEN $2::varchar='ACCEPTEE' THEN CURRENT_TIMESTAMP ELSE date_acceptation END
        WHERE id=$1
      `, [row.id, newStatus]);
      if (decision === "ACCEPTER") {
        await ouvrirRelation(client, {
          tenantId: row.tenant_id, sourceOrganisationId: organisationId,
          targetOrganisationId: row.organisation_source_id, personneId: req.auth.personneId,
          sourceType: "INVITATION", relationId: row.id
        });
      }
      await auditer(client, {
        tenantId: row.tenant_id, organisationId, personneId: req.auth.personneId,
        action: decision === "ACCEPTER" ? "ASSOCIATION_INVITATION_ACCEPTED" : "ASSOCIATION_INVITATION_REFUSED",
        entityType: "organisation_invitations", entityId: row.id,
        details: { sourceOrganisationId: row.organisation_source_id }
      });
      await client.query("COMMIT");
      return res.json({ statut: newStatus, associationOrganisationId: organisationId, consulatOrganisationId: Number(row.organisation_source_id) });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Decide association invitation:", error);
      return res.status(500).json({ statut: "ERREUR_DECISION_INVITATION" });
    } finally { client.release(); }
  });

// Existing-organization request: association asks; the institution accepts or refuses.
router.get("/:organisationId/association-join-requests",
  ...exigerPermission("MANAGE_ORGANISATION_RELATIONSHIPS", "ORGANISATION"), scope,
  async (req, res) => {
    const { organisationId, tenantCode } = req.associationScope;
    const result = await executerRequete(`
      SELECT jr.id,jr.statut,jr.message,jr.date_creation,org.id AS association_id,org.nom AS association_nom
      FROM organisation_join_requests jr
      JOIN tenants t ON t.id=jr.tenant_id
      JOIN organisations org ON org.id=jr.organisation_demandeuse_id AND org.tenant_id=t.id AND org.type='ASSOCIATION'
      WHERE jr.organisation_cible_id=$1 AND t.code=$2 AND jr.type_relation='COMMUNITY_MEMBER' AND jr.statut='EN_ATTENTE'
      ORDER BY jr.date_creation
    `, [organisationId, tenantCode]);
    return res.set("Cache-Control", "private, no-store").json({ statut: "DEMANDES_CHARGEES", demandes: result.rows });
  });

router.post("/:organisationId/association-join-requests/:requestId/decision",
  ...exigerPermission("MANAGE_ORGANISATION_RELATIONSHIPS", "ORGANISATION"), scope,
  async (req, res) => {
    const { organisationId, tenantCode } = req.associationScope;
    const decision = req.body?.decision;
    const motif = typeof req.body?.motif === "string" ? req.body.motif.trim().slice(0, 500) : null;
    if (!VALID_ID(req.params.requestId) || !["ACCEPTER", "REFUSER"].includes(decision))
      return res.status(400).json({ statut: "DECISION_INVALIDE" });
    const client = await obtenirClientDatabase();
    try {
      await client.query("BEGIN");
      const request = await client.query(`
        SELECT jr.id,jr.tenant_id,jr.organisation_demandeuse_id
        FROM organisation_join_requests jr JOIN tenants t ON t.id=jr.tenant_id
        WHERE jr.id=$1 AND jr.organisation_cible_id=$2 AND t.code=$3
          AND jr.type_relation='COMMUNITY_MEMBER' AND jr.statut='EN_ATTENTE' FOR UPDATE
      `, [req.params.requestId, organisationId, tenantCode]);
      if (!request.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ statut: "DEMANDE_INTROUVABLE" });
      }
      const row = request.rows[0];
      const status = decision === "ACCEPTER" ? "ACCEPTEE" : "REFUSEE";
      await client.query(`
        UPDATE organisation_join_requests
        SET statut=$2,traitee_par_personne_id=$3,motif_decision=$4,date_decision=CURRENT_TIMESTAMP,date_modification=CURRENT_TIMESTAMP
        WHERE id=$1
      `, [row.id, status, req.auth.personneId, motif]);
      if (decision === "ACCEPTER") {
        await ouvrirRelation(client, {
          tenantId: row.tenant_id, sourceOrganisationId: row.organisation_demandeuse_id,
          targetOrganisationId: organisationId, personneId: req.auth.personneId,
          sourceType: "JOIN_REQUEST", relationId: row.id
        });
      }
      await auditer(client, {
        tenantId: row.tenant_id, organisationId, personneId: req.auth.personneId,
        action: decision === "ACCEPTER" ? "ASSOCIATION_JOIN_REQUEST_ACCEPTED" : "ASSOCIATION_JOIN_REQUEST_REFUSED",
        entityType: "organisation_join_requests", entityId: row.id,
        details: { associationId: row.organisation_demandeuse_id, motif }
      });
      await client.query("COMMIT");
      return res.json({ statut: status, relationOrganisationId: Number(row.organisation_demandeuse_id) });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Decide association join request:", error);
      return res.status(500).json({ statut: "ERREUR_DECISION_DEMANDE" });
    } finally { client.release(); }
  });

router.get("/:organisationId/available-consulates",
  ...exigerPermission("MANAGE_ORGANISATION_RELATIONSHIPS", "ORGANISATION"), scope,
  async (req, res) => {
    const { organisationId, tenantCode } = req.associationScope;
    if (!(await verifierTypeOrganisation(organisationId, tenantCode, "ASSOCIATION")))
      return res.status(404).json({ statut: "ASSOCIATION_INTROUVABLE" });
    const result = await executerRequete(`
      SELECT cons.id,cons.nom,
        EXISTS(SELECT 1 FROM organisation_relationships rel WHERE rel.tenant_id=t.id
          AND rel.source_organisation_id=$1 AND rel.target_organisation_id=cons.id
          AND rel.type='COMMUNITY_MEMBER' AND rel.actif=TRUE AND rel.statut='ACTIVE') AS connected,
        EXISTS(SELECT 1 FROM organisation_join_requests jr WHERE jr.tenant_id=t.id
          AND jr.organisation_demandeuse_id=$1 AND jr.organisation_cible_id=cons.id
          AND jr.type_relation='COMMUNITY_MEMBER' AND jr.statut='EN_ATTENTE') AS request_pending
      FROM tenants t JOIN organisations cons ON cons.tenant_id=t.id AND cons.type='CONSULAT'
      WHERE t.code=$2 ORDER BY cons.nom,cons.id
    `, [organisationId, tenantCode]);
    return res.json({ statut: "CONSULATS_CHARGES", consulats: result.rows });
  });

router.post("/:organisationId/communication-join-requests",
  ...exigerPermission("MANAGE_ORGANISATION_RELATIONSHIPS", "ORGANISATION"), scope,
  async (req, res) => {
    const { organisationId, tenantCode } = req.associationScope;
    const targetId = Number(req.body?.targetOrganisationId);
    const message = typeof req.body?.message === "string" ? req.body.message.trim().slice(0, 500) : null;
    if (!VALID_ID(targetId)) return res.status(400).json({ statut: "CONSULAT_INVALIDE" });
    const association = await verifierTypeOrganisation(organisationId, tenantCode, "ASSOCIATION");
    const consulate = await verifierTypeOrganisation(targetId, tenantCode, "CONSULAT");
    if (!association || !consulate) return res.status(404).json({ statut: "ORGANISATION_INTROUVABLE" });
    const active = await executerRequete(`
      SELECT 1 FROM organisation_relationships
      WHERE tenant_id=$1 AND source_organisation_id=$2 AND target_organisation_id=$3
        AND type='COMMUNITY_MEMBER' AND statut='ACTIVE' AND actif=TRUE
    `, [association.tenant_id, organisationId, targetId]);
    if (active.rowCount) return res.status(409).json({ statut: "RELATION_DEJA_ACTIVE" });
    const client = await obtenirClientDatabase();
    try {
      await client.query("BEGIN");
      // Serialize requests for this same association/consulate pair.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1::text || ':' || $2::text, 0))",
        [organisationId, targetId]
      );
      const pending = await client.query(`
        SELECT id FROM organisation_join_requests
        WHERE tenant_id=$1 AND organisation_demandeuse_id=$2
          AND organisation_cible_id=$3 AND type_relation='COMMUNITY_MEMBER'
          AND statut='EN_ATTENTE' LIMIT 1
      `, [association.tenant_id, organisationId, targetId]);
      if (pending.rowCount) {
        await client.query("ROLLBACK");
        return res.status(409).json({ statut: "DEMANDE_DEJA_EN_ATTENTE" });
      }
      const result = await client.query(`
        INSERT INTO organisation_join_requests
          (tenant_id,organisation_demandeuse_id,organisation_cible_id,type_relation,statut,message,demandee_par_personne_id)
        VALUES ($1,$2,$3,'COMMUNITY_MEMBER','EN_ATTENTE',$4,$5)
        RETURNING id,statut,date_creation
      `, [association.tenant_id, organisationId, targetId, message, req.auth.personneId]);
      await auditer(client, {
        tenantId: association.tenant_id,
        organisationId: targetId,
        personneId: req.auth.personneId,
        action: "ASSOCIATION_JOIN_REQUEST_CREATED",
        entityType: "organisation_join_requests",
        entityId: result.rows[0].id,
        details: { associationId: organisationId }
      });
      await client.query("COMMIT");
      return res.status(201).json({ statut: "DEMANDE_CREEE", demande: result.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Create association join request:", error);
      return res.status(500).json({ statut: "ERREUR_DEMANDE_ASSOCIATION" });
    } finally { client.release(); }
  });

// Issuer explicitly authorizes or revokes relay of one already-published,
// audience-targeted item to one active connected association.
router.get("/:organisationId/publications/:publicationId/association-relay-authorizations",
  ...exigerPermission("TARGET_COMMUNICATION", "ORGANISATION"), scope,
  async (req, res) => {
    if (!VALID_ID(req.params.publicationId)) return res.status(400).json({ statut: "PUBLICATION_INVALIDE" });
    const { organisationId, tenantCode } = req.associationScope;
    const result = await executerRequete(`
      SELECT target.id AS association_id,target.nom AS association_nom,
        (authorization.id IS NOT NULL AND authorization.revoked_at IS NULL) AS relay_authorized,
        authorization.authorized_by_personne_id,authorization.authorized_at,
        authorization.revoked_by_personne_id,authorization.revoked_at,
        relay.id AS relay_id,relay.relayed_by_personne_id,relay.association_comment,relay.date_relais
      FROM publications pub
      JOIN tenants t ON t.id=pub.tenant_id AND t.code=$3
      JOIN organisations target ON target.tenant_id=t.id AND target.type='ASSOCIATION'
      JOIN organisation_relationships relation ON relation.tenant_id=t.id
        AND relation.source_organisation_id=target.id AND relation.target_organisation_id=$1
        AND relation.type='COMMUNITY_MEMBER' AND relation.actif=TRUE AND relation.statut='ACTIVE'
        AND (relation.date_fin IS NULL OR relation.date_fin>CURRENT_TIMESTAMP)
      LEFT JOIN communication_publication_relay_authorizations authorization
        ON authorization.tenant_id=t.id AND authorization.source_organisation_id=$1
        AND authorization.target_organisation_id=target.id AND authorization.publication_id=pub.id
      LEFT JOIN communication_publication_relays relay
        ON relay.publication_id=pub.id AND relay.target_organisation_id=target.id AND relay.tenant_id=t.id
      WHERE pub.id=$2 AND pub.organisation_id=$1 AND pub.statut='PUBLIEE'
        AND ((pub.audience_type='ASSOCIATION' AND pub.audience_valeur=target.id::text)
          OR (pub.audience_type='ORGANISATIONS' AND EXISTS (
            SELECT 1 FROM communication_publication_targets tgt
            WHERE tgt.tenant_id=t.id AND tgt.organisation_id=$1
              AND tgt.publication_id=pub.id AND tgt.target_organisation_id=target.id
          )))
      ORDER BY target.nom
    `, [organisationId, req.params.publicationId, tenantCode]);
    return res.json({ statut: "AUTORISATIONS_RELAIS_CHARGEES", associations: result.rows });
  });

router.put("/:organisationId/publications/:publicationId/association-relay-authorizations/:associationId",
  ...exigerPermission("TARGET_COMMUNICATION", "ORGANISATION"), scope,
  async (req, res) => {
    const { organisationId, tenantCode } = req.associationScope;
    const publicationId = Number(req.params.publicationId);
    const associationId = Number(req.params.associationId);
    const enabled = req.body?.enabled;
    if (!VALID_ID(publicationId) || !VALID_ID(associationId) || typeof enabled !== "boolean")
      return res.status(400).json({ statut: "AUTORISATION_RELAIS_INVALIDE" });
    const client = await obtenirClientDatabase();
    try {
      await client.query("BEGIN");
      const publication = await client.query(`
        SELECT pub.id,pub.tenant_id,pub.organisation_id,pub.audience_type,pub.audience_valeur,pub.statut
        FROM publications pub JOIN tenants t ON t.id=pub.tenant_id
        WHERE pub.id=$1 AND pub.organisation_id=$2 AND t.code=$3 AND pub.statut='PUBLIEE'
        FOR UPDATE
      `, [publicationId, organisationId, tenantCode]);
      if (!publication.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ statut: "PUBLICATION_INTROUVABLE" });
      }
      const pub = publication.rows[0];
      const target = await client.query(`
        SELECT org.id,org.nom FROM organisations org
        JOIN organisation_relationships rel ON rel.source_organisation_id=org.id
          AND rel.target_organisation_id=$2 AND rel.tenant_id=$3
          AND rel.type='COMMUNITY_MEMBER' AND rel.statut='ACTIVE' AND rel.actif=TRUE
          AND (rel.date_fin IS NULL OR rel.date_fin>CURRENT_TIMESTAMP)
        WHERE org.id=$1 AND org.tenant_id=$3 AND org.type='ASSOCIATION'
          AND (
            ( $4='ASSOCIATION' AND $5=org.id::text )
            OR ($4='ORGANISATIONS' AND EXISTS (
              SELECT 1 FROM communication_publication_targets tgt
              WHERE tgt.publication_id=$6 AND tgt.tenant_id=$3
                AND tgt.organisation_id=$2 AND tgt.target_organisation_id=org.id
            ))
          )
      `, [associationId, organisationId, pub.tenant_id, pub.audience_type, pub.audience_valeur, publicationId]);
      if (!target.rowCount) {
        await client.query("ROLLBACK");
        return res.status(422).json({ statut: "ASSOCIATION_NON_CIBLEE_OU_NON_CONNECTEE" });
      }
      if (enabled) {
        const authorization = await client.query(`
          INSERT INTO communication_publication_relay_authorizations
            (tenant_id,source_organisation_id,target_organisation_id,publication_id,authorized_by_personne_id)
          VALUES ($1,$2,$3,$4,$5)
          ON CONFLICT (publication_id,target_organisation_id)
          DO UPDATE SET authorized_by_personne_id=EXCLUDED.authorized_by_personne_id,
            authorized_at=CURRENT_TIMESTAMP,revoked_by_personne_id=NULL,revoked_at=NULL
          RETURNING id,authorized_at
        `, [pub.tenant_id, organisationId, associationId, publicationId, req.auth.personneId]);
        await auditer(client, {
          tenantId: pub.tenant_id, organisationId, personneId: req.auth.personneId,
          action: "ASSOCIATION_RELAY_AUTHORIZED", entityType: "communication_publication_relay_authorizations",
          entityId: authorization.rows[0].id, details: { publicationId, associationId }
        });
        await client.query("COMMIT");
        return res.json({ statut: "RELAI_AUTORISE", publicationId, associationId });
      }
      const authorization = await client.query(`
        UPDATE communication_publication_relay_authorizations
        SET revoked_at=CURRENT_TIMESTAMP,revoked_by_personne_id=$4
        WHERE tenant_id=$1 AND source_organisation_id=$2 AND target_organisation_id=$3
          AND publication_id=$5 AND revoked_at IS NULL
        RETURNING id
      `, [pub.tenant_id, organisationId, associationId, req.auth.personneId, publicationId]);
      if (authorization.rowCount) await auditer(client, {
        tenantId: pub.tenant_id, organisationId, personneId: req.auth.personneId,
        action: "ASSOCIATION_RELAY_AUTHORIZATION_REVOKED", entityType: "communication_publication_relay_authorizations",
        entityId: authorization.rows[0].id, details: { publicationId, associationId }
      });
      await client.query("COMMIT");
      return res.json({ statut: "RELAI_REVOQUE", publicationId, associationId });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Association relay authorization:", error);
      return res.status(500).json({ statut: "ERREUR_AUTORISATION_RELAIS" });
    } finally { client.release(); }
  });

router.get("/:organisationId/association-relay-history",
  ...exigerPermission("TARGET_COMMUNICATION", "ORGANISATION"), scope,
  async (req, res) => {
    const { organisationId, tenantCode } = req.associationScope;
    const result = await executerRequete(`
      SELECT relay.id,relay.publication_id,relay.target_organisation_id AS association_id,
        target.nom AS association_nom,pub.titre,pub.contenu,pub.publie_par AS original_author_id,
        original.prenom AS original_author_first_name,original.nom AS original_author_last_name,
        relay.relayed_by_personne_id,relayer.prenom AS relay_author_first_name,relayer.nom AS relay_author_last_name,
        relay.association_comment,relay.date_relais
      FROM communication_publication_relays relay
      JOIN tenants t ON t.id=relay.tenant_id AND t.code=$2
      JOIN organisations target ON target.id=relay.target_organisation_id AND target.tenant_id=t.id
      JOIN publications pub ON pub.id=relay.publication_id AND pub.organisation_id=relay.source_organisation_id
      JOIN personnes original ON original.id=pub.publie_par
      JOIN personnes relayer ON relayer.id=relay.relayed_by_personne_id
      WHERE relay.source_organisation_id=$1 ORDER BY relay.date_relais DESC,relay.id DESC
    `, [organisationId, tenantCode]);
    return res.json({ statut: "RELAIS_CHARGES", relais: result.rows });
  });

router.get("/:organisationId/association-communications",
  exigerSession, scope, verifierMembre,
  async (req, res) => {
    const { organisationId, tenantCode } = req.associationScope;
    const association = await verifierTypeOrganisation(organisationId, tenantCode, "ASSOCIATION");
    if (!association) return res.status(404).json({ statut: "ASSOCIATION_INTROUVABLE" });
    try {
      const links = await executerRequete(`
        SELECT rel.target_organisation_id AS issuer_id,issuer.nom AS issuer_name
        FROM organisation_relationships rel
        JOIN organisations issuer ON issuer.id=rel.target_organisation_id AND issuer.tenant_id=rel.tenant_id
        WHERE rel.tenant_id=$1 AND rel.source_organisation_id=$2 AND issuer.type='CONSULAT'
          AND rel.type='COMMUNITY_MEMBER' AND rel.actif=TRUE AND rel.statut='ACTIVE'
          AND (rel.date_fin IS NULL OR rel.date_fin>CURRENT_TIMESTAMP)
      `, [association.tenant_id, organisationId]);
      const rows = [];
      for (const link of links.rows) {
        const visible = await listerPublicationsVisiblesPourPersonneDatabase(
          Number(req.auth.personneId), Number(link.issuer_id), tenantCode
        );
        for (const publication of visible) {
          if (publication.audience_type === "ASSOCIATION"
              && String(publication.audience_valeur) !== String(organisationId)) continue;
          if (publication.audience_type === "ORGANISATIONS") {
            const targeted = await executerRequete(`
              SELECT 1 FROM communication_publication_targets
              WHERE tenant_id=$1 AND organisation_id=$2 AND publication_id=$3 AND target_organisation_id=$4
            `, [association.tenant_id, link.issuer_id, publication.id, organisationId]);
            if (!targeted.rowCount) continue;
          } else if (publication.audience_type !== "ASSOCIATION") continue;
          const details = await executerRequete(`
            SELECT original.prenom AS author_first_name,original.nom AS author_last_name,
              EXISTS(SELECT 1 FROM communication_publication_relay_authorizations auth
                WHERE auth.tenant_id=$1 AND auth.source_organisation_id=$2 AND auth.target_organisation_id=$3
                  AND auth.publication_id=$4 AND auth.revoked_at IS NULL) AS relay_allowed,
              relay.id AS relay_id,relay.relayed_by_personne_id,relayer.prenom AS relay_author_first_name,
              relayer.nom AS relay_author_last_name,relay.association_comment,relay.date_relais
            FROM publications pub JOIN personnes original ON original.id=pub.publie_par
            LEFT JOIN communication_publication_relays relay
              ON relay.publication_id=pub.id AND relay.target_organisation_id=$3 AND relay.tenant_id=$1
            LEFT JOIN personnes relayer ON relayer.id=relay.relayed_by_personne_id
            WHERE pub.id=$4 AND pub.tenant_id=$1 AND pub.organisation_id=$2 AND pub.statut='PUBLIEE'
          `, [association.tenant_id, link.issuer_id, organisationId, publication.id]);
          if (!details.rowCount) continue;
          rows.push({
            ...publication, issuer_id: Number(link.issuer_id), issuer_name: link.issuer_name,
            ...details.rows[0]
          });
        }
      }
      const permissions = await obtenirPermissionsEffectivesDatabase(
        Number(req.auth.personneId), organisationId, tenantCode
      );
      const canRelay = Boolean(permissions.succes
        && (permissions.permissionsOrganisation || []).includes("RELAY_ASSOCIATION_COMMUNICATION"));
      rows.sort((a, b) => new Date(b.date_publication) - new Date(a.date_publication));
      return res.set("Cache-Control", "private, no-store").json({ statut: "COMMUNICATIONS_CHARGEES", canRelay, publications: rows });
    } catch (error) {
      console.error("Association communication feed:", error);
      return res.status(500).json({ statut: "ERREUR_COMMUNICATIONS_ASSOCIATION" });
    }
  });

router.get("/:organisationId/association-channels",
  exigerSession, scope, verifierMembre,
  async (req, res) => {
    const { organisationId, tenantCode } = req.associationScope;
    const association = await verifierTypeOrganisation(organisationId, tenantCode, "ASSOCIATION");
    if (!association) return res.status(404).json({ statut: "ASSOCIATION_INTROUVABLE" });
    const result = await executerRequete(`
      SELECT channel.id,channel.code,channel.nom,channel.description,
        issuer.id AS issuer_id,issuer.nom AS issuer_name,
        EXISTS(SELECT 1 FROM communication_channel_subscriptions sub
          WHERE sub.channel_id=channel.id AND sub.personne_id=$3 AND sub.actif=TRUE) AS notifications_enabled
      FROM organisation_relationships rel
      JOIN organisations issuer ON issuer.id=rel.target_organisation_id AND issuer.tenant_id=rel.tenant_id
      JOIN communication_channels channel ON channel.organisation_id=issuer.id AND channel.tenant_id=rel.tenant_id
        AND channel.actif=TRUE AND channel.visibility='PUBLIC'
      JOIN tenants t ON t.id=rel.tenant_id
      WHERE rel.source_organisation_id=$1 AND t.code=$2 AND issuer.type='CONSULAT'
        AND rel.type='COMMUNITY_MEMBER' AND rel.actif=TRUE AND rel.statut='ACTIVE'
        AND (rel.date_fin IS NULL OR rel.date_fin>CURRENT_TIMESTAMP)
      ORDER BY issuer.nom,channel.nom
    `, [organisationId, tenantCode, req.auth.personneId]);
    return res.json({ statut: "CANAUX_ASSOCIATION_CHARGES", canaux: result.rows });
  });

router.post("/:organisationId/association-channels/:channelId/subscribe",
  exigerSession, scope, verifierMembre,
  async (req, res) => {
    if (!VALID_ID(req.params.channelId)) return res.status(400).json({ statut: "CANAL_INVALIDE" });
    const { organisationId, tenantCode } = req.associationScope;
    const result = await executerRequete(`
      INSERT INTO communication_channel_subscriptions (channel_id,tenant_id,organisation_id,personne_id,actif)
      SELECT channel.id,channel.tenant_id,channel.organisation_id,$4,TRUE
      FROM communication_channels channel
      JOIN organisation_relationships rel ON rel.target_organisation_id=channel.organisation_id
        AND rel.tenant_id=channel.tenant_id AND rel.source_organisation_id=$1
        AND rel.type='COMMUNITY_MEMBER' AND rel.actif=TRUE AND rel.statut='ACTIVE'
        AND (rel.date_fin IS NULL OR rel.date_fin>CURRENT_TIMESTAMP)
      JOIN organisations association ON association.id=rel.source_organisation_id
        AND association.tenant_id=rel.tenant_id AND association.type='ASSOCIATION'
      JOIN tenants t ON t.id=rel.tenant_id AND t.code=$2
      WHERE channel.id=$3 AND channel.actif=TRUE AND channel.visibility='PUBLIC'
      ON CONFLICT (channel_id,personne_id)
      DO UPDATE SET actif=TRUE,date_modification=CURRENT_TIMESTAMP
      RETURNING id
    `, [organisationId, tenantCode, req.params.channelId, req.auth.personneId]);
    if (!result.rowCount) return res.status(404).json({ statut: "CANAL_INACCESSIBLE" });
    return res.json({ statut: "NOTIFICATIONS_ACTIVEES" });
  });

router.delete("/:organisationId/association-channels/:channelId/subscribe",
  exigerSession, scope, verifierMembre,
  async (req, res) => {
    if (!VALID_ID(req.params.channelId)) return res.status(400).json({ statut: "CANAL_INVALIDE" });
    const { organisationId, tenantCode } = req.associationScope;
    await executerRequete(`
      UPDATE communication_channel_subscriptions sub
      SET actif=FALSE,date_modification=CURRENT_TIMESTAMP
      FROM communication_channels channel,tenants t
      WHERE sub.channel_id=channel.id AND sub.organisation_id=channel.organisation_id
        AND sub.tenant_id=channel.tenant_id AND sub.personne_id=$4
        AND channel.id=$3 AND t.id=channel.tenant_id AND t.code=$2
        AND EXISTS(SELECT 1 FROM organisation_relationships rel
          WHERE rel.source_organisation_id=$1 AND rel.target_organisation_id=channel.organisation_id
            AND rel.tenant_id=t.id AND rel.type='COMMUNITY_MEMBER' AND rel.actif=TRUE AND rel.statut='ACTIVE'
            AND (rel.date_fin IS NULL OR rel.date_fin>CURRENT_TIMESTAMP))
    `, [organisationId, tenantCode, req.params.channelId, req.auth.personneId]);
    return res.json({ statut: "NOTIFICATIONS_DESACTIVEES" });
  });

router.post("/:organisationId/association-relays",
  ...exigerPermission("RELAY_ASSOCIATION_COMMUNICATION", "ORGANISATION"), scope,
  async (req, res) => {
    const { organisationId, tenantCode } = req.associationScope;
    const publicationId = Number(req.body?.publicationId);
    const comment = req.body?.associationComment == null ? null : String(req.body.associationComment).trim();
    if (!VALID_ID(publicationId) || (comment && comment.length > 1000))
      return res.status(400).json({ statut: "RELAI_INVALIDE" });
    const association = await verifierTypeOrganisation(organisationId, tenantCode, "ASSOCIATION");
    if (!association) return res.status(404).json({ statut: "ASSOCIATION_INTROUVABLE" });
    const client = await obtenirClientDatabase();
    try {
      await client.query("BEGIN");
      const eligible = await client.query(`
        SELECT pub.id,pub.tenant_id,pub.organisation_id AS source_organisation_id,rel.id AS relation_id
        FROM publications pub
        JOIN communication_publication_relay_authorizations auth
          ON auth.tenant_id=pub.tenant_id AND auth.source_organisation_id=pub.organisation_id
          AND auth.publication_id=pub.id AND auth.target_organisation_id=$2 AND auth.revoked_at IS NULL
        LEFT JOIN communication_publication_targets target
          ON target.tenant_id=pub.tenant_id AND target.organisation_id=pub.organisation_id
          AND target.publication_id=pub.id AND target.target_organisation_id=$2
        JOIN organisation_relationships rel
          ON rel.tenant_id=pub.tenant_id AND rel.source_organisation_id=$2
          AND rel.target_organisation_id=pub.organisation_id AND rel.type='COMMUNITY_MEMBER'
          AND rel.actif=TRUE AND rel.statut='ACTIVE'
          AND (rel.date_fin IS NULL OR rel.date_fin>CURRENT_TIMESTAMP)
        WHERE pub.id=$1 AND pub.tenant_id=$3 AND pub.statut='PUBLIEE'
          AND ((pub.audience_type='ORGANISATIONS' AND target.publication_id IS NOT NULL)
            OR (pub.audience_type='ASSOCIATION' AND pub.audience_valeur=$2::text))
        FOR UPDATE OF pub,auth,rel
      `, [publicationId, organisationId, association.tenant_id]);
      if (!eligible.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ statut: "RELAI_NON_AUTORISE_OU_PUBLICATION_INACCESSIBLE" });
      }
      const sourceId = Number(eligible.rows[0].source_organisation_id);
      const inserted = await client.query(`
        INSERT INTO communication_publication_relays
          (tenant_id,source_organisation_id,target_organisation_id,publication_id,relation_id,relayed_by_personne_id,association_comment)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (publication_id,target_organisation_id) DO NOTHING
        RETURNING id,date_relais
      `, [association.tenant_id, sourceId, organisationId, publicationId,
        eligible.rows[0].relation_id, req.auth.personneId, comment || null]);
      if (!inserted.rowCount) {
        await client.query("ROLLBACK");
        return res.status(409).json({ statut: "RELAI_DEJA_EFFECTUE" });
      }
      await auditer(client, {
        tenantId: association.tenant_id, organisationId, personneId: req.auth.personneId,
        action: "ASSOCIATION_COMMUNICATION_RELAYED", entityType: "communication_publication_relays",
        entityId: inserted.rows[0].id, details: { publicationId, sourceOrganisationId: sourceId }
      });
      await client.query("COMMIT");
      // Relay records feed Mon SATEER. No second notification is generated;
      // eligible channel subscribers already receive the original P3.1 alert.
      return res.status(201).json({ statut: "COMMUNICATION_RELAYEE", relais: inserted.rows[0], sourceOrganisationId: sourceId });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Relay association communication:", error);
      return res.status(500).json({ statut: "ERREUR_RELAI" });
    } finally { client.release(); }
  });

router.get("/:organisationId/association-relays",
  exigerSession, async (req, res) => {
    const tenantCode = String(req.query.tenant || "").trim();
    const personId = Number(req.auth.personneId);
    if (!VALID_ID(req.params.organisationId) || !VALID_TENANT.test(tenantCode))
      return res.status(400).json({ statut: "CONTEXTE_INVALIDE" });
    try {
      const result = await executerRequete(`
        SELECT relay.id,relay.publication_id,relay.source_organisation_id,
          issuer.nom AS issuer_name,pub.titre,pub.contenu,pub.categorie,pub.priorite,
          pub.publie_par AS original_author_id,original.prenom AS original_author_first_name,
          original.nom AS original_author_last_name,association.id AS association_id,association.nom AS association_name,
          relayer.prenom AS relay_author_first_name,relayer.nom AS relay_author_last_name,
          relay.association_comment,relay.date_relais,tenant.code AS tenant_code
        FROM relations_personne_organisation membership
        JOIN organisations association ON association.id=membership.organisation_id AND association.type='ASSOCIATION'
        JOIN tenants tenant ON tenant.id=association.tenant_id AND tenant.code=$2
        JOIN organisation_relationships relationship ON relationship.tenant_id=tenant.id
          AND relationship.source_organisation_id=association.id AND relationship.type='COMMUNITY_MEMBER'
          AND relationship.actif=TRUE AND relationship.statut='ACTIVE'
          AND (relationship.date_fin IS NULL OR relationship.date_fin>CURRENT_TIMESTAMP)
        JOIN communication_publication_relays relay ON relay.tenant_id=tenant.id
          AND relay.target_organisation_id=association.id AND relay.source_organisation_id=relationship.target_organisation_id
          AND relay.relation_id=relationship.id
        JOIN communication_publication_relay_authorizations auth ON auth.tenant_id=relay.tenant_id
          AND auth.source_organisation_id=relay.source_organisation_id
          AND auth.target_organisation_id=relay.target_organisation_id AND auth.publication_id=relay.publication_id
          AND auth.revoked_at IS NULL
        JOIN publications pub ON pub.id=relay.publication_id AND pub.tenant_id=relay.tenant_id
          AND pub.organisation_id=relay.source_organisation_id AND pub.statut='PUBLIEE'
        JOIN organisations issuer ON issuer.id=pub.organisation_id AND issuer.tenant_id=tenant.id
        JOIN personnes original ON original.id=pub.publie_par
        JOIN personnes relayer ON relayer.id=relay.relayed_by_personne_id
        LEFT JOIN communication_publication_targets target ON target.tenant_id=pub.tenant_id
          AND target.organisation_id=pub.organisation_id AND target.publication_id=pub.id
          AND target.target_organisation_id=association.id
        WHERE membership.personne_id=$1 AND (
          (pub.audience_type='ORGANISATIONS' AND target.publication_id IS NOT NULL)
          OR (pub.audience_type='ASSOCIATION' AND pub.audience_valeur=association.id::text)
        )
          AND membership.organisation_id=$3
        ORDER BY relay.date_relais DESC,relay.id DESC
      `, [personId, tenantCode, req.params.organisationId]);
      return res.set("Cache-Control", "private, no-store").json({ statut: "RELAIS_ASSOCIATIFS_CHARGES", relais: result.rows });
    } catch (error) {
      console.error("Mon SATEER association relays:", error);
      return res.status(500).json({ statut: "ERREUR_RELAIS_ASSOCIATIFS" });
    }
  });

module.exports = router;
