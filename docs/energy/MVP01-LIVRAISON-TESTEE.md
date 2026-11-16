# SATEER Energy / SUNU Courant — MVP01 livré en recette locale

**Référentiel :** `docs/energy/INDEX-ACTIF-REV3.md`, commit parent `f4fd5d8eb62bd3398fcb06a7ad387920cd6ebbb3`.
**Périmètre :** premier dossier énergétique privé, application sur la branche `work/energy-mvp01` ; tenant de recette `ENERGY_MVP01D_RECETTE` dans PostgreSQL `sateer_test` ; **aucun usage institutionnel ou production autorisé**.

## Contrat métier réellement implémenté

- Saisie pour particuliers, professionnels et organisations *déclarées*, sans mandat institutionnel implicite.
- Types de sites incluant bâtiment public, industrie et agriculture ; alimentation pré/postpaiement, solaire, hybride et absence d'alimentation ; compteur facultatif.
- Création d'un `EnergyCase` brouillon, propriétaire tiré de la session Core, identifiant UUID, clé d'idempotence contrôlée, historique de création en transaction.
- Consultation de sa liste et de ses propres dossiers ; refus d'autres tenants, d'autres propriétaires, des sessions manquantes, des champs identitaires clients et des origines non autorisées.
- Interface `/sunu-courant.html?tenant=ENERGY_MVP01D_RECETTE`, mode recette seulement ; API `/api/energy` active uniquement avec `PGDATABASE=sateer_test` et `SATEER_ENABLE_ENERGY_MVP01=1`.
- Pas de routage institutionnel, diagnostic scientifique, simulation, paiement, financement ou envoi de données à un tiers.

## Preuves techniques de recette

- MVP01-A : 16 tests de domaine et API, sécurité et vérification du code.
- MVP01-B : 18 scénarios PostgreSQL/HTTP transactionnels avec rollback.
- MVP01-C : 20 scénarios via les véritables composants Core Auth avec rollback.
- MVP01-D : migration `050_energy_cases.sql` et deux comptes synthétiques autorisés exclusivement sur la base locale de recette ; 11 scénarios HTTP E2E sur serveur réel, tests Core/P1/Ambassade/Diaspora et isolation des propriétaires.
- MVP01-E : contrôle des données de recette en lecture seule, reprise des tests Core/Auth et non-régression, preuve visuelle humaine exigée avant publication Git ; résultat final et SHA distant conservés dans le rapport ZIP de clôture.

## Limites et dette de conception

- Les comptes, tables et dossiers de recette persistent uniquement dans `sateer_test`, pas dans une base de production.
- Le schéma métier MVP01 est volontairement réduit à l'expression du besoin. L'inventaire/site/équipement stable, le rattachement organisationnel autorisé, la qualité des données, l'analyse BEI, le monitoring, Academy et Invest seront livrés par moteurs isolés selon la roadmap REV3.
- `SATEER_PUBLIC_ORIGIN` et le cookie de session sont adaptés à la recette locale ; aucune sécurité de production n'est déclarée.
- Le premier dossier n'a pas encore de gestion de statut au-delà de `BROUILLON` : ne pas le présenter comme un dossier technique validé ou un rapport d'ingénieur.
- Les tests statiques et HTTP de recette ne remplacent pas la revue de sécurité et le déploiement institutionnel.

## Contrat de reprise

L'état de référence est le HEAD distant de `work/energy-mvp01`. Un développeur ou Codex vérifie d'abord `git status`, la branche et `git ls-remote origin refs/heads/work/energy-mvp01` puis lit le présent document, `REPRISE-CODEX-MVP01.md`, la matrice REV3 et le rapport de clôture. Aucune révision de la vision Energy n'est requise sans demande métier nouvelle ou contradiction technique documentée.
