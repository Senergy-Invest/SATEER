# Transmission Codex et développeurs humains — REV3 ACTIVE

**Pointeur canonique** : `docs/energy/INDEX-ACTIF-REV3.md`. Les documents REV2 archivés dans le ZIP ne sont plus les décisions actives.

# SATEER Energy — Reprise pour développeur humain / Codex

Date : 2026-11-16. **Cette REV2 est une décision métier documentée, pas une preuve de fonctionnalité livrée.**

## Point de reprise figé

- Dépôt : `Senergy-Invest/SATEER`.
- Base P1 validée : branche `work/presentation-v1` commit `d2eb6ee673145cea5a5c5f23fe9d1329a81bbee7` (SHA distant vérifié lors de P1).
- Branche Energy cible : `work/energy-mvp01`, worktree local indépendant `~/SATEER-energy-mvp01`, **à vérifier : non présumer sa création**.
- Référentiel métier : `docs/energy/REFERENTIEL-REV2-VALIDE.md`; roadmap : `docs/energy/ROADMAP-MVP-REV2.md`; responsabilités : `docs/energy/MATRICE-MOTEURS-RESPONSABILITES.md`; décisions : `docs/energy/REGISTRE-DECISIONS-REV2.csv`.
- Source héritée `~/SATEER/public/sateer-energy.html` = ancien HTML non suivi, ne pas effacer ni écraser ; sa copie de conservation est distincte des moteurs.
- Consulat Bordeaux, Ambassade, Diaspora et P1 sont des worktrees à préserver ; ne pas nettoyer, rebaser, pull, fusionner ni modifier leurs fichiers pour lancer Energy.

## Avant chaque lot

1. Vérifier branche, remote, upstream, SHA locaux/distants, état des fichiers de TOUS les worktrees concernés, preuves des dernières validations.
2. Lire documents ci-dessus ET les contrats du lot précédent. Faire une liste courte des hypothèses non résolues, sans rouvrir les décisions métier déjà validées.
3. Identifier la fonctionnalité utilisateur, les rôles, le modèle canonique, les interfaces des moteurs et les contrôles des données. Tests d'abord pour les règles sensibles.
4. Implémenter uniquement la tranche verticale autorisée. Pas de deuxième Core, Communication, Workflow, simulation ou base parallèle.
5. Tests unitaires, contrats, sécurité, PostgreSQL transaction+rollback selon cas, non-régression des pilotes, UI ; générer un seul rapport dans `~/Downloads`, sélectionner automatiquement avec `open -R`.
6. Après validation fonctionnelle/visuelle explicite, `git add` ciblé, commit lisible, push normal **sans force**, vérification `SHA_LOCAL == SHA_DISTANT`. Consigner commit, tests, migrations et limites.
7. Prochain lot : ne pas coder si le dernier n'a pas sa preuve GitHub, et ne pas inférer l'état réel depuis la seule documentation.

## Reprise immédiate

**Priorité 00C** : intégrer REV2 sur branche Energy isolée (premier commit documentaire) via paquet Terminal contrôlé. **Priorité 01** : formulaire Besoin énergétique et EnergyCase (pas de finance) ; architecture Academy/Operations déjà prévue mais leurs fonctionnalités pas encore implémentées.

## Règles de vérité

- Décision validée = document et registre, approuvé par porteur.
- Implémentation validée = code + tests + recette humaine requise + preuve de commit local/distant.
- Test de simulation = preuve limitée au périmètre simulé, pas validation institutionnelle réelle.
- Partenariat AEME/ANER/ASER/SENELEC = jamais affirmé sans convention ou accord.


## Ajouts REV3 obligatoires

- Equipment Passport (stable, versionné), Maintenance Engine et adaptateurs Industrial / Automotive : **un référentiel Equipment**, pas un modèle par industrie.
- Veille stratégique et opportunités (politiques, projets, aides, fonds, AO), quotidien/hebdo avec traçabilité ; collecte et intelligence séparées des tâches Communication.
- Opportunity Matching utilise un **registre de capacités attestées par des tests et commits** et uniquement des projets que le contexte autorise ; jamais fouille libre de tables, dossiers, secrets ou fichiers.
- Deux sorties : **opportunité traitable** (avec preuves) ou **capacité manquante** (proposition à évaluer). Aucune candidature, offre, publication de projet, engagement, transaction ou transmission institutionnelle sans validation humaine.
- Pour chaque MVP : `git branch`, upstream, SHA local/distant, tests, modules touchés, contrat versionné, incidents, migration, source autorisée, statut libéré.
- Le lot REV3 est **documentaire** ; aucun agent autonome / scheduler / API nouveaux n'est créé par ce paquet.
- Passer à Codex seulement après un état local/distant vérifié et lecture du rapport et de l'index REV3.

## Reprise précise après 00D

Prochain lot : MVP01 (besoin/energy case) dans le worktree Energy, en tenant compte des contrats Equipment/Opportunity sans implémenter prématurément Maintenance, Automotive ou Agent. Aucune modification de Bordeaux/Ambassade/Diaspora/P1, pas de Codex requis pour continuer via Terminal.
