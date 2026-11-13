# SATEER — ADR-001 : frontière de composition Bordeaux / Core

## Décision

Isoler le **branchement** des modules pilotes dans `pilot-module-registry.js`, sans réorganiser leurs responsabilités internes, migrer les tables, ou changer l'ordre des routes.

La création de demandes, le routage automatique, les routes P7, l'annuaire des agents et les invitations des collaborateurs demeurent inchangés. L'email Bordeaux demeure une démonstration autorisée uniquement si `PGDATABASE=sateer_test` ; les guards internes restent en place.

## Pourquoi

`server.js` chargeait directement cinq modules pilotes. Une frontière d'intégration permet de tester et de faire évoluer le branchement sans disperser ces imports dans le bootstrap.

## Ce que le correctif ne fait pas

- Il **ne prouve pas** l'isolation des données ou des permissions.
- Il ne crée pas un registre d'expériences activables par organisation.
- Il ne rend pas P6/P7 indépendants de `services-database.js` / PostgreSQL.
- Il n'introduit pas de microservices, de configuration distante ou d'activation de fonctionnalités métier.
- Il ne traite pas le reporting ministériel ni la messagerie réelle.

## Contrats à développer ensuite

1. Catalogue / activations par organisation, séparés des abonnements personnels.
2. Accès au Core via interfaces de service documentées, sans accès SQL direct croisé.
3. Tests dynamiques d'autorisations et de cloisonnement sur `sateer_test`.
4. Isolation des moteurs spécialisés lorsque les contraintes le justifient.

## Recette

- Exécuter `node --check server.js`.
- Exécuter `node scripts/test-pilot-module-registry.js` : tests purement synthétiques.
- Vérifier la différence Git et confirmer que les quatre points d'intégration restent au même emplacement.
- Exécuter ultérieurement les tests E2E existants uniquement dans l'environnement de recette sécurisé, après vérification des effets de bord et des scripts de test.
