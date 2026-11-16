# SUNU Courant — MVP01-A : première tranche de code, non encore livrée

Référence figée : `work/energy-mvp01` commit `f4fd5d8eb62bd3398fcb06a7ad387920cd6ebbb3` (documentation REV3).

## Responsabilités

- SUNU Courant : formulaire de besoin énergétique, accessible par URL directe uniquement en recette.
- `energy-case-domain.js` : validation de saisie pure, indépendante d'Express/PostgreSQL.
- `energy-case-http.js` : API de dossiers personnels sous session Core et tenant Energy autorisé (pas un tenant consulaire/ambassade).
- `energy-case-store.js` : stockage transactionnel et événement de création; pas de duplication du moteur Workflows existant.
- `050_energy_cases.sql` : nouvelles tables de domaine, AUCUNE migration appliquée par MVP01-A.
- Les profils PART/PRO/ORG sont une **déclaration de besoin**, pas une attribution de droits organisationnels. Aucun traitement pour compte d'une institution à ce stade.
- Pas de facturation, simulation, calcul, évaluation, export, publication, Invest ou décision institutionnelle à MVP01-A.

## Sécurité

- `server.js` n'installe les routes que si `PGDATABASE=sateer_test` et `SATEER_ENABLE_ENERGY_MVP01=1`.
- L'API exige `req.auth.personneId` de la session Core, un tenant Energy explicitement choisi via `SATEER_ENERGY_TENANT_CODE`, et une appartenance au tenant calculée côté serveur par le Core.
- Les requêtes SQL lient toujours `(tenant, propriétaire)`; aucune demande inter-tenant ou dossier d'autre personne n'est visible.
- L'API POST impose un header `Idempotency-Key` UUID, un Origin correspondant à `SATEER_PUBLIC_ORIGIN`, le consentement de recette et un schéma strict. La clé évite les doubles créations et la transaction couvre création + événement.
- L'expérience n'active pas les cartes Energy de P1, conformément à son état de recette.
- Aucune autorisation de publication ou usage professionnel ne découle du profil déclaré.

## Tests à effectuer

1. Tests unitaires/domaines, routes simulées, contrôles négatifs (13 scénarios). Les tests de l'adaptateur SQL réel restent à faire.
2. `npm test`, P1, Ambassade A1, Diaspora D1 et D3 (Origin test local).
3. **MVP01-B** (après validation de ce lot) : précontrôle PostgreSQL cluster de recette, contrôle de migration 050, application autorisée, recette HTTP authentifiée, preuve d'isolation inter-comptes, rollback des fixtures, validation visuelle.
4. **Après tests E2E et validation humaine**, commit ciblé puis push GitHub, vérification SHA distant, mise à jour reprise Codex. Ne pas committer un simple succès des tests statiques comme fonctionnalité terminée.

## Limite actuelle importante

La création d'un nouveau tenant Energy et son rattachement à des comptes de recette ne sont pas inclus. Il faut les concevoir et autoriser avant toute migration/exécution E2E. Ne pas détourner un tenant `AMBVIS_*`, `P6V_*` ou Diaspora existant pour les données Energy.
