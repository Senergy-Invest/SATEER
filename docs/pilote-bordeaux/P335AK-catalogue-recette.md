# P3.3.5AK — Catalogue de RECETTE isolé

## Périmètre

- Fonctionnalité temporaire, **fermée par défaut**, disponible seulement lorsque `PGDATABASE=sateer_test` ET `SATEER_ENABLE_BORDEAUX_PROCEDURE_RECETTE=1`.
- Source des fiches : SELECT depuis le catalogue existant, uniquement les brouillons dont le titre commence par `[DEMO BORDEAUX]`, `actif=false`, `validation_explicite=false`, `valide_par IS NULL`.
- Transitions **en mémoire uniquement** : `BROUILLON -> VALIDEE -> PUBLIEE -> VALIDEE` (retrait). Perdues à chaque redémarrage.
- Les fiches réelles restent intactes. Aucune requête `INSERT`, `UPDATE`, `DELETE` ni nouvelle table.
- L'API officielle `/api/pilot-procedures` et la page `/catalogue-demarches.html` restent inchangées.
- Ce dispositif ne constitue **PAS** une validation institutionnelle, ni une publication réellement accessible aux citoyens. C'est une prévisualisation côté testeur.

## Isolation et droits

- Requêtes acceptées seulement depuis la boucle locale `127.0.0.1` (en-tête Host et adresse TCP contrôlés), avec `Origin` vérifié pour les actions.
- Toutes les routes requièrent `exigerSession` existant, l'appartenance active à l'organisation 70 et au tenant explicite.
- Une action est réservée à un compte ayant un rôle `VICE_CONSUL_RECETTE_*` actif ET la permission organisationnelle `MANAGE_PUBLICATIONS`.
- Les autres membres de l'organisation peuvent consulter l'aperçu de RECETTE uniquement après simulation de publication. Ne rien assimiler à une diffusion officielle.
- `SATEER_PUBLIC_ORIGIN` doit correspondre exactement à l'origine de l'instance de test, p. ex. `http://127.0.0.1:3300`.

## Mise en place

1. Exécuter `INSTALLER.sh`, puis examiner son rapport. Il ne redémarre aucun serveur et ne touche ni Git (index/commit) ni PostgreSQL.
2. Quand la revue sera acceptée, démarrer une instance locale dédiée avec les variables d'environnement ci-dessus ; NE PAS arrêter le serveur 3200 existant sans accord.
3. Ouvrir `/bordeaux-catalogue-recette.html` sur le port local de recette, avec A01 connecté.
4. Vérifier publication simulée et aperçu citoyen. Redémarrer l'instance pour vérifier le retour au brouillon.
5. Retirer le drapeau et arrêter l'instance de recette à la fin.

## Limites assumées

- Pas de persistance de la simulation entre redémarrages.
- Ne remplace pas un vrai test E2E multi-comptes, ni un circuit validé par l'autorité consulaire.
- Ne change pas les permissions historiques trop larges de l'API institutionnelle ; ce chantier RBAC reste à tester séparément.
- Aucun commit automatique tant que le smoke HTTP authentifié n'est pas vérifié.
