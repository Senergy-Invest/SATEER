# Plan de consolidation Git — sans perte et sans dépendance à l'IA

## Pourquoi

L'audit P3.3.5U a montré beaucoup de fichiers non suivis et de sauvegardes ; certains fichiers sous `.sateer-backups` apparaissent parmi les fichiers suivis modifiés. **Un `.gitignore` ne suffit pas à retirer un fichier déjà suivi par Git.**

## Ordre humain sécurisé

1. **Sauvegarder hors dépôt** le travail courant (copie non publiée, sans secrets transmis) et enregistrer la branche, `HEAD`, l'état de l'index et les changements. Ne pas relancer de vieux kits sur un état non reconnu.
2. **Examiner** `ETAT-GIT-LOCAL.md`, puis `git status --short --untracked-files=all` et `git diff --stat`. Isoler dans la revue les véritables sources de `public/`, les routes, migrations, tests et sauvegardes.
3. **Identifier ce qui est suivi** sous `.sateer-backups/` via `git ls-files '.sateer-backups/**'`. Ne pas supprimer ces sauvegardes sans vérifier leur utilité et leur conservation externe.
4. **Convenir des exclusions Git** (`.gitignore`) et, **seulement après revue/backup**, décider des éventuels retraits *de l'index uniquement* (`git rm --cached`) ; ne jamais le faire automatiquement depuis ce kit.
5. **Regrouper les modifications par contrat métier** : (i) workflow document et journal, (ii) supervision, (iii) courrier/FAQ, (iv) catalogue et droits/migrations, (v) navigation et documentation. Vérifier les dépendances entre lots.
6. **Exécuter les tests pertinents**, puis `git diff --check`, inspecter précisément les changements indexés `git diff --cached --stat` et `git diff --cached` avant **chaque** commit.
7. **Faire les commits ciblés** après revue ; n'utiliser ni `git add .` ni `git add -A` global. Ne pas committer fichiers de sauvegarde, secrets, logs ou bases locales.
8. Actualiser `POINT-DE-REPRISE.md`, avec commit/test et le **retour au catalogue** comme prochaine étape.

## Commandes de lecture utiles

```bash
cd "$HOME/SATEER"
git status --short --untracked-files=all
git diff --stat
git diff --check
git ls-files '.sateer-backups/**'
```

Aucune commande destructrice n'est fournie dans le kit. Éviter de révéler les contenus de `.env`, les secrets des boîtes e-mail, données personnelles ou historiques non anonymisés.
