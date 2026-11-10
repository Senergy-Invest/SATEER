# SATEER Bordeaux — P3.3.5AS · Consolidation de la simulation

## Périmètre

La validation, la publication, l'aperçu citoyen et le retrait de la fiche `[DEMO BORDEAUX]` ont été observés manuellement dans la simulation locale (`3300`). Il ne s'agit **pas** d'une publication institutionnelle.

- La navigation de la page de simulation revient désormais explicitement au tableau de bord Vice-Consul et au catalogue **sur l'instance principale 3200**, avec organisation 70 et tenant `P6V_3B5AC5AB9DB04657`.
- Les pages locales de pilotage et de catalogue proposent un lien vers la simulation lorsque le contexte Bordeaux est indiqué dans l'URL. Les autres organisations, tenants, ports et pages n'affichent pas ce lien.
- La route de diagnostic P335AQ `/api/bordeaux-procedures-recette/diagnostic` et ses deux fichiers publics temporaires sont retirés des sources. La suppression prend effet sur le serveur **après redémarrage** du seul processus 3300.
- L'API de simulation reste derrière la session, la permission `MANAGE_PUBLICATIONS`, le rôle `VICE_CONSUL_RECETTE_*`, le filtre de boucle locale et la confirmation explicite. Les opérations `VALIDER`, `PUBLIER`, `RETIRER` ne modifient pas le catalogue officiel et restent en RAM.

## Limites

Le serveur 3300 utilise les routes habituelles de SATEER pour la connexion : l'authentification peut écrire des sessions et des journaux dans `sateer_test`. Cela ne signifie pas que **toutes** ses routes sont en lecture seule. Garder cette instance uniquement pour la recette locale, avec un compte et une base fictifs ; l'arrêter lorsqu'elle n'est plus nécessaire.

Le contrôle groupé vérifie les réponses HTTP **anonymes** et les tests unitaires. Il ne récupère ni mots de passe ni cookies de navigateur. La recette authentifiée a été observée manuellement, mais n'est pas rejouée automatiquement par ce paquet.

## Versionnement

Ne pas utiliser `git add .`. Plusieurs sources et routes de l'application restent modifiées en dehors de ce lot, notamment `server.js`, `pilot-module-registry.js` et les écrans de pilotage. Regrouper les commits selon leurs frontières après revue du rapport P335AS et de leurs dépendances, sans commiter isolément un branchement qui exige des modules non suivis.
