const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const checks = [];

function check(label, ok) {
  checks.push({ label, ok: Boolean(ok) });
}

function routeBlock(method, route) {
  const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    "app\\." + method + "\\(\\s*[\"']" + escaped +
    "[\"']([\\s\\S]*?)(?=\\n\\);)",
    "m"
  );
  const match = server.match(re);
  return match ? match[0] : '';
}

const sessionRoutes = [
  ['get', '/api/mon-sateer/:personneId'],
  ['get', '/api/mon-consulat/:personneId'],
  ['post', '/api/ia-citoyen'],
  ['post', '/api/assistant/message'],
  ['post', '/api/demandes'],
  ['get', '/api/demandes/:demandeId'],
  ['get', '/api/agent/demandes'],
  ['get', '/api/secretariat/demandes'],
  ['post', '/api/secretariat/demandes/:demandeId/orientation'],
  ['post', '/api/agent/demandes/:demandeId/prise-en-charge'],
  ['post', '/api/agent/demandes/:demandeId/reponse'],
  ['get', '/api/organisations/:organisationId/units/overview'],
  ['get', '/api/organisations/:organisationId/units/:unitId/workspace'],
  ['get', '/api/organisations/:organisationId/units/:unitId/inbox'],
  ['post', '/api/organisations/:organisationId/units/:unitId/cases/:demandeId/route'],
  ['post', '/api/organisations/:organisationId/units/:unitId/cases/:demandeId/take'],
  ['post', '/api/organisations/:organisationId/units/:unitId/cases/:demandeId/respond'],
  ['get', '/api/permissions']
];

for (const [method, route] of sessionRoutes) {
  const block = routeBlock(method, route);
  check(`Route déclarée : ${method.toUpperCase()} ${route}`, Boolean(block));
  check(`Session requise : ${method.toUpperCase()} ${route}`, block.includes('exigerSession'));
}

const permissionRoutes = [
  ['get', '/api/organisations/:organisationId/structure', 'VIEW_ORGANISATION', 'ORGANISATION'],
  ['post', '/api/organisations/:organisationId/units', 'CREATE_UNIT', 'ORGANISATION'],
  ['patch', '/api/organisations/:organisationId/units/:unitId', 'UPDATE_UNIT', 'UNIT'],
  ['post', '/api/organisations/:organisationId/units/:unitId/move', 'MOVE_UNIT', 'UNIT'],
  ['post', '/api/organisations/:organisationId/units/:unitId/disable', 'DISABLE_UNIT', 'UNIT'],
  ['get', '/api/organisations/:organisationId/units/:unitId/members', 'VIEW_UNIT_MEMBERS', 'UNIT'],
  ['post', '/api/organisations/:organisationId/units/:unitId/members', 'ASSIGN_MEMBER', 'UNIT'],
  ['patch', '/api/organisations/:organisationId/units/:unitId/members/:relationId', 'CHANGE_MEMBER_ROLE', 'UNIT'],
  ['post', '/api/organisations/:organisationId/units/:unitId/members/:relationId/disable', 'REMOVE_MEMBER', 'UNIT'],
  ['get', '/api/organisations/:organisationId/unit-capabilities', 'VIEW_ORGANISATION', 'ORGANISATION'],
  ['get', '/api/organisations/:organisationId/units/:unitId/capabilities', 'VIEW_UNIT', 'UNIT'],
  ['post', '/api/organisations/:organisationId/units/:unitId/capabilities', 'CONFIGURE_UNIT_CAPABILITIES', 'UNIT'],
  ['patch', '/api/organisations/:organisationId/units/:unitId/capabilities/:capabilityId', 'CONFIGURE_UNIT_CAPABILITIES', 'UNIT'],
  ['post', '/api/organisations/:organisationId/units/:unitId/capabilities/:capabilityId/disable', 'CONFIGURE_UNIT_CAPABILITIES', 'UNIT'],
  ['get', '/api/organisations/:organisationId/roles', 'VIEW_ORGANISATION', 'ORGANISATION'],
  ['post', '/api/organisations/:organisationId/roles', 'MANAGE_ROLES', 'ORGANISATION'],
  ['patch', '/api/organisations/:organisationId/roles/:roleId', 'MANAGE_ROLES', 'ORGANISATION'],
  ['post', '/api/organisations/:organisationId/roles/:roleId/disable', 'MANAGE_ROLES', 'ORGANISATION'],
  ['post', '/api/organisations/:organisationId/roles/:roleId/activate', 'MANAGE_ROLES', 'ORGANISATION'],
  ['get', '/api/organisations/:organisationId/roles/:roleId/permissions', 'VIEW_ORGANISATION', 'ORGANISATION'],
  ['post', '/api/organisations/:organisationId/roles/:roleId/permissions', 'MANAGE_ROLE_PERMISSIONS', 'ORGANISATION'],
  ['patch', '/api/organisations/:organisationId/roles/:roleId/permissions/:permissionId', 'MANAGE_ROLE_PERMISSIONS', 'ORGANISATION'],
  ['post', '/api/organisations/:organisationId/roles/:roleId/permissions/:permissionId/disable', 'MANAGE_ROLE_PERMISSIONS', 'ORGANISATION'],
  ['get', '/api/organisations/:organisationId/dashboard-operationnel', 'VIEW_OPERATIONAL_DASHBOARD', 'ORGANISATION'],
  ['get', '/api/organisations/:organisationId/dashboard-strategique', 'VIEW_STRATEGIC_DASHBOARD', 'ORGANISATION'],
  ['get', '/api/organisations/:organisationId/dashboards/acces', null, null],
  ['get', '/api/organisations/:organisationId/dashboard-operationnel/delegations', 'MANAGE_OPERATIONAL_DASHBOARD_ACCESS', 'ORGANISATION'],
  ['post', '/api/organisations/:organisationId/dashboard-operationnel/delegations', 'MANAGE_OPERATIONAL_DASHBOARD_ACCESS', 'ORGANISATION'],
  ['delete', '/api/organisations/:organisationId/dashboard-operationnel/delegations/:personneId', 'MANAGE_OPERATIONAL_DASHBOARD_ACCESS', 'ORGANISATION'],
  ['get', '/api/organisations/:organisationId/ecosysteme', 'VIEW_ORGANISATION', 'ORGANISATION']
];

for (const [method, route, permission, scope] of permissionRoutes) {
  const block = routeBlock(method, route);
  if (permission === null) {
    check(`Session requise : ${method.toUpperCase()} ${route}`, Boolean(block) && block.includes('exigerSession'));
  } else {
    check(
      `Permission ${permission}/${scope} : ${method.toUpperCase()} ${route}`,
      Boolean(block) &&
        block.includes(`exigerPermission("${permission}", "${scope}")`)
    );
  }
}

check(
  'Identité de création de demande issue de req.auth',
  /creerDemandeDatabase\(\s*Number\(req\.auth\.personneId\)/.test(server)
);
check(
  'Identité IA citoyen issue de req.auth',
  /repondreAvecIACitoyen\(\s*Number\(req\.auth\.personneId\)/.test(server)
);
check(
  'Identité de prise en charge issue de req.auth',
  /prendreEnChargeDemandeDatabase\([\s\S]{0,180}Number\(req\.auth\.personneId\)/.test(server)
);
check(
  'Identité de réponse issue de req.auth',
  /repondreDemandeDatabase\([\s\S]{0,180}Number\(req\.auth\.personneId\)/.test(server)
);
check(
  'Inbox agent liée à une unité et à ses capacités',
  routeBlock('get', '/api/agent/demandes').includes('chargerContexteWorkspaceUnite') &&
    routeBlock('get', '/api/agent/demandes').includes('features.canViewInbox')
);
check(
  'Orientation contrôlée par capacité et permission de l’unité source',
  routeBlock('post', '/api/organisations/:organisationId/units/:unitId/cases/:demandeId/route')
    .includes('features.canRouteCases')
);
check(
  'Prise en charge contrôlée par capacité et permission de l’unité',
  routeBlock('post', '/api/organisations/:organisationId/units/:unitId/cases/:demandeId/take')
    .includes('features.canTakeCases')
);
check(
  'Réponse contrôlée par capacité et permission de l’unité',
  routeBlock('post', '/api/organisations/:organisationId/units/:unitId/cases/:demandeId/respond')
    .includes('features.canRespondCases')
);
check(
  'Page de connexion présente',
  fs.existsSync(path.join(root, 'public', 'login.html'))
);
check(
  'Client de session présent',
  fs.existsSync(path.join(root, 'public', 'auth-client.js'))
);
check(
  'Redirection de connexion résolue sur la même origine',
  /new URL\(rawReturnTo, window\.location\.origin\)/.test(
    fs.readFileSync(path.join(root, 'public', 'login.js'), 'utf8')
  )
);

const protectedRoleRoutes = [
  ['patch', '/api/organisations/:organisationId/roles/:roleId'],
  ['post', '/api/organisations/:organisationId/roles/:roleId/disable'],
  ['post', '/api/organisations/:organisationId/roles/:roleId/activate'],
  ['post', '/api/organisations/:organisationId/roles/:roleId/permissions'],
  ['patch', '/api/organisations/:organisationId/roles/:roleId/permissions/:permissionId'],
  ['post', '/api/organisations/:organisationId/roles/:roleId/permissions/:permissionId/disable']
];
for (const [method, route] of protectedRoleRoutes) {
  const block = routeBlock(method, route);
  check(`Rôle institutionnel protégé : ${method.toUpperCase()} ${route}`, block.includes('exigerRoleNonProtege'));
}

check(
  'Accès délégué intégré aux permissions effectives',
  /organisation_dashboard_access_delegations/.test(
    fs.readFileSync(path.join(root, 'services-database.js'), 'utf8')
  ) && /permissionsDelegueesOrganisation/.test(
    fs.readFileSync(path.join(root, 'services-database.js'), 'utf8')
  )
);
check(
  'Migration des dashboards et délégations présente',
  fs.existsSync(path.join(root, 'database', '024_dashboards_consul_viceconsul.sql'))
);
check(
  'Délégation contrôlée côté PostgreSQL',
  /BENEFICIAIRE_NON_AFFECTE_A_L_ORGANISATION/.test(fs.readFileSync(path.join(root, 'database', '024_dashboards_consul_viceconsul.sql'), 'utf8')) &&
    /DELEGANT_NON_AUTORISE/.test(fs.readFileSync(path.join(root, 'database', '024_dashboards_consul_viceconsul.sql'), 'utf8'))
);
check(
  'Délégation nominative limitée au dashboard opérationnel',
  /organisation_dashboard_access_delegations/.test(fs.readFileSync(path.join(root, 'services-database.js'), 'utf8')) &&
    /VIEW_OPERATIONAL_DASHBOARD/.test(fs.readFileSync(path.join(root, 'services-database.js'), 'utf8'))
);
check(
  'Protection SQL des rôles institutionnels',
  /systemProtected/.test(fs.readFileSync(path.join(root, 'database', '024_dashboards_consul_viceconsul.sql'), 'utf8')) &&
    /trg_sateer_permissions_role_protege/.test(fs.readFileSync(path.join(root, 'database', '024_dashboards_consul_viceconsul.sql'), 'utf8'))
);
check(
  'Entrée institutionnelle selon les permissions effectives',
  routeBlock('get', '/api/organisations/:organisationId/dashboards/acces').includes('exigerSession') &&
    /chargerEspacesInstitutionnels/.test(fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8'))
);
check(
  'Espaces institutionnels réellement chargés après Mon SATEER',
  /await chargerEspacesInstitutionnels\(\)/.test(fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8'))
);
check(
  'Permissions et rôles système limités au Consulat pilote',
  /r\.organisation_id = 1/.test(fs.readFileSync(path.join(root, 'database', '024_dashboards_consul_viceconsul.sql'), 'utf8')) &&
    /organisation_id = 1\s+AND code IN \('HEAD_OF_MISSION', 'OPERATIONAL_DEPUTY'\)/.test(fs.readFileSync(path.join(root, 'database', '024_dashboards_consul_viceconsul.sql'), 'utf8'))
);
check(
  'Dashboard stratégique Consul présent',
  fs.existsSync(path.join(root, 'public', 'dashboard-consul.html')) &&
    fs.existsSync(path.join(root, 'public', 'dashboard-consul.js'))
);
check(
  'Interface de délégation opérationnelle présente',
  /gestionAccesDashboard/.test(fs.readFileSync(path.join(root, 'public', 'dashboard-vice-consul.html'), 'utf8')) &&
    /revoquerAccesDashboard/.test(fs.readFileSync(path.join(root, 'public', 'dashboard-vice-consul.js'), 'utf8'))
);
check(
  'API d’état des accès opérationnels protégée par session',
  routeBlock('get', '/api/organisations/:organisationId/dashboard-operationnel/acces').includes('exigerSession')
);


const servicesDb = fs.readFileSync(path.join(root, 'services-database.js'), 'utf8');
const agentUi = fs.readFileSync(path.join(root, 'public', 'agent-demandes.js'), 'utf8');
const secretariatUi = fs.readFileSync(path.join(root, 'public', 'secretariat.js'), 'utf8');
const viceHtml = fs.readFileSync(path.join(root, 'public', 'dashboard-vice-consul.html'), 'utf8');
const viceJs = fs.readFileSync(path.join(root, 'public', 'dashboard-vice-consul.js'), 'utf8');

check(
  'Unit Workspace frontend présent',
  fs.existsSync(path.join(root, 'public', 'unit-workspace.html')) &&
    fs.existsSync(path.join(root, 'public', 'unit-workspace.js'))
);
check(
  'Unit Workspace chargé après le client de session',
  /auth-client\.js[\s\S]*unit-workspace\.js/.test(
    fs.readFileSync(path.join(root, 'public', 'unit-workspace.html'), 'utf8')
  )
);
check(
  'Aucune identité agent codée en dur dans l’ancien point d’entrée',
  !/AGENT_PERSONNE_ID|Awa|Fall/.test(agentUi)
);
check(
  'Aucun code d’unité métier codé en dur dans le backend',
  !server.includes("CONSULAR_SERVICE")
    && !server.includes("PROJECT_OFFICE")
    && !/unit(?:e)?(?:\.code)?\s*(?:===|==|!==|!=)\s*["']SECRETARIAT["']/.test(server)
);
check(
  'Orientations proposées à partir des capacités des unités',
  /RECEIVE_INCOMING/.test(secretariatUi) &&
    /ROUTE_CASES/.test(secretariatUi) &&
    !/CONSULAR_SERVICE|PROJECT_OFFICE|OPERATIONAL_DEPUTY/.test(secretariatUi)
);
check(
  'Structure organisationnelle enrichie des capacités actives',
  /capabilitiesResultat/.test(servicesDb) &&
    /organisation_unit_capabilities/.test(servicesDb)
);
check(
  'Synthèse des unités avec charge et alertes',
  /obtenirUnitesWorkspaceOverviewDatabase/.test(servicesDb) &&
    /urgent_cases/.test(servicesDb) &&
    /members_count/.test(servicesDb)
);
check(
  'Prise en charge découplée de l’ancienne relation AGENT/RESPONSABLE',
  /async function prendreEnChargeDemandeDatabase[\s\S]*?async function repondreDemandeDatabase/.test(servicesDb) &&
    !/relations_personne_organisation|CONSULAR_SERVICE/.test(
      servicesDb.slice(
        servicesDb.indexOf('async function prendreEnChargeDemandeDatabase'),
        servicesDb.indexOf('async function repondreDemandeDatabase')
      )
    )
);
check(
  'Réponse découplée de l’ancienne relation AGENT/RESPONSABLE',
  !/relations_personne_organisation/.test(
    servicesDb.slice(
      servicesDb.indexOf('async function repondreDemandeDatabase'),
      servicesDb.indexOf('async function listerReponsesDemandeCitoyenDatabase')
    )
  ) &&
    /d\.statut = 'EN_COURS'/.test(
      servicesDb.slice(
        servicesDb.indexOf('async function repondreDemandeDatabase'),
        servicesDb.indexOf('async function listerReponsesDemandeCitoyenDatabase')
      )
    )
);
check(
  'Dashboard Vice-Consul sans cartes de services figées',
  /supervisionUnitsGrid/.test(viceHtml) &&
    !/Awa Fall|Voir le Secrétariat|Service consulaire|Bureau de projet/.test(viceHtml)
);
check(
  'Dashboard Vice-Consul construit les cartes depuis l’API des unités',
  /chargerUnitesSupervisees/.test(viceJs) &&
    /units\/overview/.test(viceJs) &&
    /unit-workspace\.html/.test(viceJs)
);
check(
  'Inbox de l’unité inclut les entrées non orientées uniquement si la capacité le permet',
  /features\.canReceiveIncoming/.test(
    routeBlock('get', '/api/organisations/:organisationId/units/:unitId/inbox')
  )
);
check(
  'Routage transactionnel vérifie unité source, destination et capacités',
  /FOR UPDATE/.test(servicesDb) &&
    /DOSSIER_HORS_UNITE_SOURCE/.test(servicesDb) &&
    /DESTINATION_INVALIDE/.test(servicesDb)
);

check(
  'Routage respecte la liste de destinations configurée sur la capacité',
  /allowedDestinationUnitIds/.test(servicesDb) &&
    /allowedDestinationUnitIds/.test(server)
);
check(
  'Synthèse et Workspace masquent les indicateurs sans permission analytics',
  /members_count: canViewMembers \? unite\.members_count : null/.test(server) &&
    /new_cases: contexte\.features\.canViewAnalytics/.test(server)
);

let failed = 0;
for (const result of checks) {
  console.log(`${result.ok ? 'OK' : 'ECHEC'} - ${result.label}`);
  if (!result.ok) failed++;
}
console.log(`\nRésultat : ${checks.length - failed}/${checks.length} contrôles statiques réussis.`);
console.log('Ces contrôles statiques ne remplacent pas les tests HTTP et PostgreSQL d’intégration.');
if (failed) process.exitCode = 1;
