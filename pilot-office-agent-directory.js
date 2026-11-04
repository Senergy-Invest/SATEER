"use strict";
// P6.2: staff-only directory, strictly organization + tenant + unit scoped.
// This endpoint never lists citizens and never changes any assignment.
const { executerRequete } = require('./database');
const { exigerPermission } = require('./auth-authorization');
function validId(x) { const n=Number(x); return Number.isSafeInteger(n) && n>0 ? n : null; }
function installOfficeAgentDirectory(app) {
  app.get('/api/organisations/:organisationId/units/:unitId/eligible-agents',
    ...exigerPermission('ASSIGN_MEMBER', 'UNIT'), async (req,res)=>{
      if (process.env.PGDATABASE !== 'sateer_test') return res.status(503).json({statut:'PILOTE_RESERVE_BASE_TEST'});
      const organisationId=validId(req.params.organisationId), unitId=validId(req.params.unitId);
      const tenant=String(req.query.tenant||'').trim();
      if(!organisationId||!unitId||!/^[A-Z]{2,12}$/.test(tenant)) return res.status(400).json({statut:'CONTEXTE_INVALIDE'});
      try {
        // A non-staff/citizen org relation is NEVER sufficient for eligibility.
        // The selected unit must be active, in this org and in this tenant.
        const data=await executerRequete(`
          SELECT DISTINCT p.id,p.prenom,p.nom
          FROM personnes p
          JOIN relations_personne_organisation r ON r.personne_id=p.id
          JOIN organisations o ON o.id=r.organisation_id
          JOIN tenants t ON t.id=o.tenant_id
          JOIN organisation_units u ON u.organisation_id=o.id AND u.id=$3 AND u.actif=TRUE
          WHERE o.id=$1 AND t.code=$2 AND r.type IN ('AGENT','RESPONSABLE','AGENT_SATEER')
          ORDER BY p.nom,p.prenom,p.id LIMIT 200
        `,[organisationId,tenant,unitId]);
        return res.set('Cache-Control','no-store').json({statut:'AGENTS_ELIGIBLES',personnes:data.rows});
      }catch(e){console.error('P6.2 annuaire affectation',e);return res.status(500).json({statut:'ERREUR_ANNUAIRE_AGENT'});}
    });
}
module.exports={installOfficeAgentDirectory};
