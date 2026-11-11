"use strict";
/**
 * Frontiere de composition P6/P7/Bordeaux : branchement des modules pilotes.
 * Ce fichier est un adaptateur de demarrage, PAS un moteur d'experiences,
 * PAS un mecanisme d'activation par organisation, et PAS une isolation runtime.
 *
 * Il ne contient ni requete SQL ni permission metier. L'ordre d'enregistrement
 * des routes et les guards restent exactement ceux du server.js d'origine.
 */

// Injection limitee pour tester les enregistrements sans Express ni PostgreSQL.
function createPilotModuleRegistry(options = {}) {
  const load = options.load || require;
  const env = options.env || process.env;

  function installEmailDemo(app, exigerSession) {
    // Equivalent au guard historique dans server.js.
    if (env.PGDATABASE !== 'sateer_test') return false;
    const { createEmailDemoRouter } = load('./bordeaux-email-demo-http');
    app.use('/api/bordeaux-email-demo', exigerSession, createEmailDemoRouter());
    return true;
  }

  function installCitizenIntake(app, exigerSession) {
    const { installRoutingRoutes, routeNewCitizenCase } = load('./pilot-routing-rules');
    installRoutingRoutes(app, exigerSession);
    const { setup } = load('./pilot-procedures-http');
    setup(app, exigerSession);
    // P335AK : simulation du catalogue, fermée par défaut, jamais officielle.
    if (env.PGDATABASE === 'sateer_test' &&
        env.SATEER_ENABLE_BORDEAUX_PROCEDURE_RECETTE === '1') {
      const { createRouter } = load('./pilot-procedures-recette-http');
      app.use('/api/bordeaux-procedures-recette', exigerSession, createRouter());
    }
    return { routeNewCitizenCase };
  }

  function installCaseDispatch(app, exigerSession) {
    if (env.PGDATABASE !== 'sateer_test') return false;
    const { createCaseDispatchRouter } = load('./pilot-case-dispatch-http');
    app.use('/api/bordeaux-case-dispatch', exigerSession, createCaseDispatchRouter());
    return true;
  }

  function installStaffAdministration(app) {
    load('./pilot-office-agent-directory').installOfficeAgentDirectory(app);
    load('./pilot-staff-invitations').installStaffInvitations(app);
  }

  return Object.freeze({ installEmailDemo, installCitizenIntake, installStaffAdministration, installCaseDispatch });
}

module.exports = Object.freeze({ ...createPilotModuleRegistry(), createPilotModuleRegistry });
