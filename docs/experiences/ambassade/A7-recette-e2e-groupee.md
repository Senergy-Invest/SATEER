# Ambassade — A7 : campagne de recette intégrée, sans nouveau moteur

Base : `work/ambassade-mvp`, SHA `decbe018f3b7950e39e977e51c0587b9a0c41f10`.

## Objectif

Réexécuter le parcours SATEER déjà validé à Bordeaux sur une organisation de test de **type `AMBASSADE`** : contexte authentifié, bureaux, demande citoyenne, routage interne P6, prise en charge, réponse, indicateurs de l'Ambassade, publication institutionnelle avec une permission fictive et lecture par une audience autorisée. Les refus sans session, sans permission, hors organisation ou hors tenant sont testés. Les écrans communs restent servis par le serveur réel de recette.

## Changement ciblé

Le fichier `scripts/p6-routing-api-test.js` reçoit un mode opt-in `SATEER_P6_AMBASSADE_TEST=1`. Sans ce drapeau, le test P6 historique conserve son type `TEST_SYNTHETIQUE` et ses permissions d'origine. Avec le drapeau, seule **la fixture** prend le type `AMBASSADE` ; le responsable fictif de recette reçoit les permissions de statistiques et communication nécessaires à ses tests. Un helper indépendant exerce les API existantes.

L'API Ambassade A5 est montée uniquement durant le harnais local (variable de recette). Aucun `server.js` ou module métier n'est modifié, aucune nouvelle table ni migration. Le test P6 actuel simule une demande via le canal historique `MON_CONSULAT` : il démontre que le moteur de workflow fonctionne avec le type AMBASSADE, **mais il ne constitue pas un canal citoyen `MON_AMBASSADE` déployé**. L'adaptation de l'expérience citoyenne doit être testée séparément avant le pilote opérationnel.

## Garanties

- Base `sateer_test`, cluster PostgreSQL de recette `7699611241381229531`, hôte PostgreSQL épinglé par le harnais `::1:5432`.
- Serveur HTTP synthétique sur `127.0.0.1`, port éphémère. Aucun redémarrage des serveurs 3000/3100/3200.
- Les opérations applicatives passent par le client transactionnel P6 ; les `COMMIT` internes sont convertis en savepoints ; `ROLLBACK` global obligatoire avec vérification des résidus sur une seconde connexion.
- Tous les comptes, demandes, permissions, publications et organisations de test sont fictifs et n'existent que durant la transaction de recette.
- Aucune attribution réelle, connexion à une boîte e-mail, transfert vers un consulat, tutelle officielle ou publication officielle.
- Un seul commit ciblé après tests et un seul push GitHub vérifié par SHA.

## Tests

1. Tests unitaires de structure du harnais A7 et parcours UI A6.
2. `npm test` et les non-régressions A1–A5, A2.5–A4d.
3. Recettes A3d, P3.1 sur `sateer_test` avec nettoyage.
4. `SATEER_P6_AMBASSADE_TEST=1 SATEER_ENABLE_AMBASSADE_OPERATIONS=1 SATEER_TEST_WORKFLOW=1` : parcours HTTP/RBAC/PostgreSQL avec fixture AMBASSADE, publication, analytics et test de refus inter-organisations.
5. Même harnais P6 sans mode Ambassade : vérification du chemin Bordeaux hérité.
6. Vérifications Git ciblées, commit, push non forcé, SHA distant et rapport ZIP Finder.

## Limites résiduelles avant le pilote institutionnel

- Configuration des bureaux, compétences, rôles et autorités **validée par l'Ambassade** ; les fixtures ne doivent pas être copiées en production.
- Canal et entrée citoyenne « Mon Ambassade » : aucune décision de routage transversale ne doit être déduite d'un mot-clé sans qualifier l'intention et la compétence.
- Transferts Ambassade ↔ Consulat : nécessitent convention, autorisation des deux organisations, traçabilité et audit.
- Source e-mail réelle et décision IA : pas intégrées ; qualification de l'intention avant le thème, validation humaine par défaut.
- Reporting ministériel réel : annuaire et rapports officiels manquants. Ne pas afficher les fixtures comme des statistiques.
