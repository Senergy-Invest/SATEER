# SATEER Ambassade — A9 / A10 : intention explicite et recette de clôture

## Statut

**Livraison conditionnelle.** Ce document décrit les contrats mis en place. La validation
E2E, les marqueurs de succès et les SHA doivent être constatés dans le rapport de campagne
Mac; aucun statut PASS ne peut être déclaré à partir du présent document seul.

## Intention avant thème

Pour `MON_AMBASSADE` seulement, l'utilisateur choisit obligatoirement son intention avant
son thème. Les valeurs canoniques sont :

| Intention | Thème (exemples) | Comportement à la création |
| --- | --- | --- |
| `INFORMATION` | `PASSEPORT`, `ETAT_CIVIL`, `AUTRE` | Question enregistrée, **pas** de dossier de pièces |
| `DEMARCHE` | `PASSEPORT`, `ETAT_CIVIL`, `RENDEZ_VOUS` | Demande d'action enregistrée, qualification requise |
| `INCERTAIN` | Tous | Situation à clarifier par agent habilité |

Le thème reste descriptif. **Aucune** catégorie ni mot du message ne provoque de routage
automatique, y compris `PASSEPORT`. L'API rejette une intention absente ou inconnue avec
HTTP 400 `INTENTION_AMBASSADE_INVALIDE`. L'intention est insérée dans
`demande_history.metadata` pour l'action `CREATION` (clés `intention` et `source`),
dans le **même CTE PostgreSQL atomique** que `demandes`, via le Core existant.
La création restitue aussi `demande.intention` à l'appelant.

## Frontières et permissions

- Core : session, personne, tenant, rattachement à l'organisation; garde serveur du vrai type `AMBASSADE`.
- Workflow : demande canonique, historique, qualification humaine, orientation manuelle, réponse agent.
- Communication : publications institutionnelles existantes, hors mutation A9.
- P6 Consulat : **strictement inchangé**; règles `MON_CONSULAT` jamais utilisées par `MON_AMBASSADE`. L'historique de création garde `metadata = {}` (JSONB non-null) si aucune intention Ambassade n'est fournie.
- Le formulaire `MON_CONSULAT` et `SATEER` n'affiche pas de champ intention obligatoire.
- L'auteur seul lit son détail via les permissions existantes; les agents n'acquièrent aucun nouveau droit.

## Recette technique attendue

`SATEER_P6_AMBASSADE_TEST=1 node scripts/p6-routing-api-test.js` exécute A7, A8 et A9
sur le même client PostgreSQL et la transaction de fixture isolée, avec rollback suivi
par **une nouvelle connexion** vérifiant l'absence de données synthétiques résiduelles.
A9 vérifie : 3 intentions, question `INFORMATION` sur passeport, `CREATION.metadata`,
HTTP 400 sans intention ou intention inconnue, refus 401/403/422, cloisonnement,
lecture citoyenne, visibilité dans file de qualification, absence de routage automatique,
et orientation manuelle autorisée. Marqueur exact : `A9_AMBASSADE_INTENTIONS_E2E_PASS`.
A8 garde le marqueur `A8_AMBASSADE_CITOYEN_MANUEL_E2E_PASS`.
Les campagnes de non-régression requises sont P6 Bordeaux, A3d, Communication P3.1,
`npm test` et les contrats statiques A8/A9.

## Dette et limites explicites

- Les citoyens externes **non rattachés** à l'organisation Ambassade restent sans parcours
  d'inscription autonome. Il est interdit de leur attribuer une permission agent ou
  `VIEW_ORGANISATION` / `CREATE_UNIT` pour contourner cette limite.
- Pas de lecture de boîte e-mail réelle, de routage interpostes, de tutelle ou délégation
  officielle, de connecteur institutionnel, d'IA de classification, de visa ou délivrance
  automatisée, de mise en production. Autorisation et conventions réelles requises.
- Avertissement `pg` concernant des requêtes parallèles dans un harnais transactionnel :
  dette à diagnostiquer séparément; aucune mise à jour `pg` ni affirmation de compatibilité pg@9.
- **Prêt pour une démonstration technique seulement si tous les tests du rapport passent.**
  **Non prêt pour une ouverture publique ou la production** indépendamment de ces tests.
