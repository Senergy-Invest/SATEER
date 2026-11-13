"use strict";

// P3.3.3A : API institutionnelle de configuration d'experiences.
// Ce module ne monte aucune route tout seul. L'authentification est obligatoire
// sur le montage du routeur; une seconde verification de req.auth est imposee.
// Les permissions sont dediees, organisationnelles, et DENY par defaut.
const {
  creerRegistreExperiencesOrganisation,
  AccesExperienceRefuse,
  CibleExperienceIntrouvable
} = require("./organisation-experience-registry");

const TENANT_CODE = /^[A-Z][A-Z0-9_-]{1,49}$/;
const EXPERIENCE_CODE = /^[A-Z][A-Z0-9_]{1,99}$/;

function entierStrict(value) {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function erreurHttp(res, http, statut) {
  return res.status(http).json({ statut });
}

function creerRoutesExperiencesOrganisation({ router, requete, verifierPermission, origineAutorisee } = {}) {
  if (!router || typeof router.get !== "function" || typeof router.put !== "function") {
    throw new TypeError("router Express requis");
  }
  if (typeof requete !== "function" || typeof verifierPermission !== "function") {
    throw new TypeError("dependances de securite obligatoires");
  }

  const registre = creerRegistreExperiencesOrganisation({
    requete,
    autoriser: async ({ acteur, organisationId, action }) => {
      // Le code tenant est valide, puis resolu en identifiant depuis PostgreSQL.
      // Le moteur RBAC prouve l'appartenance effective a cette organisation.
      if (!acteur || !Number.isSafeInteger(acteur.personneId)
        || !TENANT_CODE.test(acteur.tenantCode || "")) return false;
      const resultat = await verifierPermission({
        personneId: acteur.personneId,
        organisationId,
        tenantCode: acteur.tenantCode,
        permissionCode: action,
        uniteId: null
      });
      // Jamais de delegation d'unite pour l'activation institutionnelle.
      return resultat?.succes === true && resultat?.autorise === true
        && resultat?.portee === "ORGANISATION";
    }
  });

  async function contexte(req, res, modification = false) {
    if (!req.auth || !Number.isSafeInteger(Number(req.auth.personneId))
      || Number(req.auth.personneId) <= 0) {
      erreurHttp(res, 401, "AUTHENTIFICATION_REQUISE");
      return null;
    }
    const organisationId = entierStrict(req.params.organisationId);
    const tenantCode = req.query?.tenant;
    const codeExperience = req.params.codeExperience;
    if (!organisationId || typeof tenantCode !== "string" || !TENANT_CODE.test(tenantCode)
      || (modification && (typeof codeExperience !== "string" || !EXPERIENCE_CODE.test(codeExperience)))) {
      erreurHttp(res, 400, "CONTEXTE_INVALIDE");
      return null;
    }
    if (modification) {
      // Cookie SameSite=Strict ne remplace pas un controle explicite d'origine.
      if (typeof origineAutorisee !== "string" || !origineAutorisee
        || req.get("origin") !== origineAutorisee) {
        erreurHttp(res, 403, "ORIGINE_NON_AUTORISEE");
        return null;
      }
      if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)
        || Object.keys(req.body).length !== 1
        || !["ACTIVE", "INACTIVE"].includes(req.body.statut)) {
        erreurHttp(res, 400, "STATUT_INVALIDE");
        return null;
      }
    }
    const tenant = await requete(
      "SELECT id FROM tenants WHERE code = $1 AND actif = TRUE LIMIT 1",
      [tenantCode]
    );
    if (tenant.rows.length !== 1 || !Number.isSafeInteger(Number(tenant.rows[0].id))) {
      erreurHttp(res, 404, "TENANT_INTROUVABLE");
      return null;
    }
    return {
      acteur: { personneId: Number(req.auth.personneId), tenantCode },
      tenantId: Number(tenant.rows[0].id),
      organisationId,
      tenantCode,
      codeExperience
    };
  }

  function traitementErreur(res, erreur) {
    if (erreur instanceof AccesExperienceRefuse) return erreurHttp(res, 403, "ACCES_REFUSE");
    if (erreur instanceof CibleExperienceIntrouvable) return erreurHttp(res, 404, "CIBLE_INTROUVABLE");
    if (erreur instanceof TypeError) return erreurHttp(res, 400, "PARAMETRES_INVALIDES");
    console.error("Erreur API experiences institutionnelles :", erreur);
    return erreurHttp(res, 500, "ERREUR_EXPERIENCES_ORGANISATION");
  }

  router.get("/:organisationId", async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const c = await contexte(req, res);
      if (!c) return;
      const experiences = await registre.lister(c);
      return res.status(200).json({ statut: "EXPERIENCES_ORGANISATION", experiences });
    } catch (erreur) { return traitementErreur(res, erreur); }
  });

  router.put("/:organisationId/:codeExperience", async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const c = await contexte(req, res, true);
      if (!c) return;
      const activation = await registre.definirStatut({ ...c, statut: req.body.statut });
      return res.status(200).json({ statut: "ACTIVATION_ORGANISATION_MISE_A_JOUR", activation });
    } catch (erreur) { return traitementErreur(res, erreur); }
  });

  return router;
}

module.exports = { creerRoutesExperiencesOrganisation };
