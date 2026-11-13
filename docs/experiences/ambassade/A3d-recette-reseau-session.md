# A3d — Recette intégrée du sous-réseau institutionnel

Statut : test automatisé proposé, sans nouvelle fonctionnalité de production.

## Objectif

Vérifier ensemble les composants existants, plutôt que des simulations séparées :

- la session SATEER (`exigerSession` et lecture SQL réelle de `auth_sessions`) ;
- les affectations organisationnelles et le calcul RBAC existant (`VIEW_INSTITUTION_NETWORK`) ;
- l'adaptateur HTTP A3c et le service réseau A3b ;
- le graphe typé A2.5 sur des liens Ministère → Ambassades → Consulats fictifs ;
- les refus pour les acteurs non habilités, les tenants étrangers et les relations révoquées ;
- l'absence de POST et de données personnelles dans la réponse.

## Sécurité de la recette

Le script `scripts/a3d-session-network-pg-http-test.js` impose **`PGDATABASE=sateer_test`** et l'identifiant du **cluster PostgreSQL de recette** avant toute écriture. Il utilise une transaction unique, des tenants/organisations/personnes/comptes/sessions/rôles/relations entièrement synthétiques et un serveur HTTP éphémère lié à `127.0.0.1`. Les services SATEER sont chargés après injection du client de transaction, afin que toutes les requêtes d'authentification, RBAC et réseau restent sur ce client.

Le code de permission `VIEW_INSTITUTION_NETWORK` est recherché, puis créé seulement **dans la transaction de test** si absent. Deux affectations de rôle factices lui sont associées. La transaction finit obligatoirement par `ROLLBACK` ; une seconde lecture confirme l'absence des tenants de test. Aucun rôle, session ou lien réel n'est créé/altéré.

Le script de recette ne démarre pas `server.js`, ne définit pas `SATEER_ENABLE_INSTITUTION_NETWORK_READ`, n'active aucune route sur un serveur existant et ne modifie ni le pilote Bordeaux ni ses bases.

## Limites

Une recette transactionnelle ne démontre ni une habilitation ministérielle officielle, ni la capacité inter-tenant/fédération mondiale, ni un système de production haute disponibilité. Les relations réelles ne pourront être validées qu'après décision institutionnelle formelle ; les droits de consultation des dossiers demeurent indépendants.
