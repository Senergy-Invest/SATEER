# Pilote Bordeaux — point d'entrée pour l'équipe de maintenance

**Statut : documentation de pilotage, non preuve de conformité ni architecture déjà réalisée.**

Le dépôt est la source de vérité. La présente documentation décrit les contraintes métier et la marche à suivre ; elle ne remplace ni la lecture du code, ni les tests, ni les décisions des responsables du Consulat.

## Lire dans cet ordre

1. [`POINT-DE-REPRISE.md`](POINT-DE-REPRISE.md) : état du pilote, étape en cours, prochaine étape après la consolidation, étapes non oubliées.
2. [`ARCHITECTURE-ET-FRONTIERES.md`](ARCHITECTURE-ET-FRONTIERES.md) : doctrine durable et références du code à vérifier.
3. [`CONTRATS-ET-TESTS.md`](CONTRATS-ET-TESTS.md) : règles métier, invariants et tests de non-régression.
4. [`PLAN-CONSOLIDATION-GIT.md`](PLAN-CONSOLIDATION-GIT.md) : procédure humaine, prudente et reproductible.
5. [`ETAT-GIT-LOCAL.md`](ETAT-GIT-LOCAL.md) : photographie de l'état Git lors de la génération (sans contenu de fichier).

## Règle non négociable

SATEER doit être **compréhensible et maintenable par une équipe humaine dans VS Code**, sans dépendance à Emergent, ChatGPT ou une autre IA. Refuser les dépendances implicites, les copies de logique métier entre expériences, les scripts ponctuels devenus indispensables et les migrations impossibles à rejouer.

### Portée de cette étape

- Concerne **uniquement le pilote Bordeaux**, sans refonte générale de SATEER.
- Aucun changement de traitement de dossiers, de permissions, de données SQL ou d'e-mails.
- Aucun `git add`, `git commit`, `git clean`, `git reset`, `git rm` ni édition automatique du `.gitignore`.
- Ne pas interpréter l'absence de changement dans cette étape comme la fin de la consolidation. Les étapes de revue et de tests restent nécessaires.

## Maintenir ce dossier après chaque lot

Mettre à jour `POINT-DE-REPRISE.md` avant et après chaque chantier : état atteint, preuves, risques, **prochain geste concret**. Mettre à jour les tests/contrats lorsqu'une règle change. Chaque commit doit correspondre à une modification compréhensible avec tests de non-régression.
