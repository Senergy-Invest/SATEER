# A4d — Recette horizontale API + interface du Ministère

**Statut : scénario 100 % synthétique, sans fournisseur institutionnel ou base de données.**

Le test `scripts/test-ministry-worldwide-http-ui-integration.js` exécute **le vrai routeur A4b**, **le vrai composeur de reporting A4a** et **le vrai script d'interface A4c** ensemble sur un serveur Express éphémère lié à `127.0.0.1`. Les seuls objets synthétiques sont la session injectée dans le processus de test, le décideur d'autorisation et le fournisseur de lots. Il ne monte pas la route sur un serveur SATEER existant.

Tests : 401 sans session, 403 sans RBAC, 200 lorsque le routeur est autorisé, projection filtrée, séparation `(tenantCode, organisationId)`, couverture de non-déploiement, absence de données privées, cache désactivé, rendu DOM en texte uniquement, absence de chiffres lorsque le fournisseur répond 503, et 404 sur POST.

La page A4c opérationnelle reste liée au fournisseur `chargerLotNonConfigure` de A4b : sans annuaire ni reports institutionnels validés, l'interface indique « sources non configurées ». **Ne jamais présenter les données du test comme de vraies statistiques ministérielles.**

La campagne groupée reprend aussi les tests du graphe, de l'authentification et des permissions sur `sateer_test` avec transaction annulée, ainsi que Communication P3.1. Aucun changement de schema, de permissions, de dossiers, de relation de tutelle, de serveur ou de branche Bordeaux.

Une analyse de préparation non nominative est également exécutée par `scripts/audit-ministry-worldwide-readiness.js`, sans mutation PostgreSQL : elle renseigne les quantités de postes et droits déjà présents dans `sateer_test`.
