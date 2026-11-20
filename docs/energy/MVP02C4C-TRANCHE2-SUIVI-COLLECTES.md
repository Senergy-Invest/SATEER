# SATEER Energy / SUNU Courant — MVP02-C4C, tranche 2

**Sujet** : liste de suivi des propositions C2 dans le périmètre C1 autorisé.

**Base figée à la préparation** : `work/energy-mvp01`, commit C4C tranche 1 `0bee55bd0c5a1b2ca251cb5a3beecbeba71a4412`. Le paquet est un **candidat** ; aucun commit C4C2 n'est réputé valide avant les tests Mac, la recette utilisateur, la publication autorisée et le SHA distant égal au local.

## But métier réel

Un responsable de bâtiment doit pouvoir retrouver les **propositions d'équipement** déjà enregistrées par C2, voir à quelle unité elles appartiennent, si elles sont `EN_REVUE` ou `A_CORRIGER`, et depuis combien de jours elles ont été modifiées. Un acteur C1 autorisé ne voit pas les propositions d'autres périmètres.

Ce n'est **pas** un planning opérationnel avec dates promises, une évaluation de performance, une preuve de câblage, un relevé électrique, une mesure de kWh ou un audit certifié. Une proposition ancienne n'est pas automatiquement en retard. Ne pas convertir son ancienneté en alerte contractuelle sans un délai réellement configuré et un processus habilité.

## Architecture maintenable, sans dépendance à l'IA

```
Session Auth Core / tenant / organisations (inchangés)
       |
energy-dashboard-http.js       garde GET + validation tenant, UUID, filtre, pagination
       |
energy-dashboard-store.js      obtainSite -> autoriser C1 -> CTE scope -> C2 read-only
       |                           |                   |
       |                           |                   +--> statut / dates C2
       |                           +--> grant C1 actif et auteur/relecteur
       |
energy-dashboard-actions-domain.js          mapping dates/statuts sans scores
       |
energie-actions.html / .js / .css          tableau textuel, filtre, navigation
       |
energie-actions-entry.js                   lien additif depuis tableau C4C1
```

Seules les tables canoniques 051/055/056/059/060 déjà migrées sont consultées. **Aucune nouvelle table ni migration**, pas de copie d'équipement, d'identité ou d'affectation. Le Core reste propriétaire de l'authentification ; les permissions viennent des grants C1 existants. Le serveur utilise **la route C4C v1 existante** : aucune nouvelle activation ou permission d'écriture.

## Contrat HTTP additif

`GET /api/energy/pilotage/v1/sites/:siteId/actions?tenant=...&grantId=...&statut=TOUTES|EN_REVUE|A_CORRIGER&offset=...`

- Le `grantId` est exigé pour un collaborateur non propriétaire, et revérifié auprès des grants `ACTIF` du tenant/site et de l'acteur authentifié. Un compte propriétaire sans `grantId` prend la racine C1 existante.
- L'autorisation C1 précède l'accès à toute proposition. Un périmètre révoqué, site étranger ou absent retourne `404 PERIMETRE_NON_AUTORISE` sans existence oracle.
- Les données sont bornées au **sous-arbre C1** avec FK/site/tenant/propriétaire dans SQL. L'acteur non propriétaire ne reçoit que ses propositions `A_CORRIGER` (en tant qu'auteur) ou `EN_REVUE` dont son grant actif est le relecteur affecté. Le propriétaire voit les propositions du sous-arbre pour superviser, sans être désigné automatiquement comme responsable de chaque proposition.
- `statut` vaut `TOUTES` par défaut, ou `EN_REVUE`, `A_CORRIGER`. Autre valeur = 400. Pagination offset 0..10000, 50 lignes par page, `suivant` explicite. Ordre stable `date_modification ASC, id ASC` ; pas de N+1 côté navigateur.
- Réponse : `actions[]` avec identifiant C2, nom déclaré, famille, unité C1, statut réel, dernière modification ISO, nombre entier de jours depuis cette modification, `pourMoi` indicatif de responsabilité. Pas de nom/email de contributeur ni de document/photo/QR.
- `Cache-Control: private, no-store`, refus si session/tenant non autorisé et route exclusivement GET. Aucune mutation de C2, aucun nouveau droit créé. Une page vide ne veut pas dire absence globale de propositions si la pagination des sites est partielle.

## Fichiers concernés

- Modifiés (contrôle préalable des hashes Git) : `energy/energy-dashboard-store.js`, `energy/energy-dashboard-http.js`, `scripts/test-energy-mvp02c4c.js`, `public/energie-pilotage.html` (simple lien additif, sans remplacement du correctif Core déjà validé).
- Ajoutés : `energy/energy-dashboard-actions-domain.js`, `public/energie-actions.{html,js,css}`, `public/energie-actions-entry.js`, `scripts/test-energy-mvp02c4c2.js`, `scripts/maintenance/test-energy-mvp02c4c2-{pg,http}.js` et cette note.
- Aucun changement de `server.js`, aucune migration, aucun accès direct hors API canonique, aucun backend de consommation.

## Tests et preuve de livraison

1. Branche Energy `work/energy-mvp01`, HEAD local et `ls-remote origin` exactement au SHA C4C1. Aucun diff/index préexistant non autorisé ; l'unique fichier non suivi toléré est le référentiel REV2, explicitement hors commit.
2. Hash Git des fichiers suivis de C4C1 avant remplacement ; ne pas écraser des versions inconnues. Rerun possible si les fichiers correspondent à la version du paquet.
3. Syntaxe Node, tests C4C1+C4C2 (56 tests attendus), puis les **17 régressions** qui couvrent Energy, Core, P1, Ambassade et Diaspora.
4. PostgreSQL `sateer_test` cluster `7699611241381229531`, avec `BEGIN READ ONLY` + retour sans écriture persistante. Aucun script de migration.
5. Instance 3485 réservée et arrêtée par le script ; HTTP A/B fictif : session, isolation, filtre, ancien C4C1, tenant, écran.
6. Recette visuelle : fenêtre connectée, propriétaire A, site de recette, filtres, pagination, navigation C4C1 ; tester l'absence de session dans une fenêtre privée et le bon retour après login, ainsi que la lisibilité sur fenêtre étroite.
7. Saisir PASS **seulement si réellement observé**, note factuelle obligatoire, approbation explicite distincte avant `git commit` et `git push`. Vérifier SHA local égal SHA distant ; rapport ZIP unique, révélation Finder. Aucun `reset`, `clean`, `pull`, `rebase`, `stash` ou force-push.

## Limites et pistes pour C4C futur

Le premier écran sélectionne au plus 50 contextes de site. Les grands sites nécessiteront pagination cursor/chargement incrémental et tests de charge. Pas de tâches programmées, d'échéances garanties, d'alertes automatiques, de KPI énergétiques ni de traduction IA. La suite C4C doit être cadrée **après cette validation**, et E-ARCH ensuite, sans chantier parallèle.

## Reprise par Codex ou développeur humain

Ouvrir ce document, la documentation C4C1, les sources `energy/energy-dashboard-*`, `public/energie-actions*`, `scripts/test-energy-mvp02c4c*.js`, `scripts/maintenance/test-energy-mvp02c4c2-*` dans VS Code. Préserver le contrat API v1 et les guards Core/C1. Une suppression de l'isolation inter-sites, un statut déduit ou une donnée d'énergie non mesurée constituent des anomalies bloquantes. Ne jamais lancer de migration, de push ni modifier des permissions sans validation appropriée.
