# SATEER Bordeaux — tests des migrations du catalogue

Les migrations `database/042_procedure_catalogue_validation_explicite.sql` et `database/043_permission_manage_procedures.sql` définissent les colonnes d'approbation et la permission d'édition des brouillons. Elles **n'attribuent aucun droit à un compte** et **ne valident aucune fiche officielle**.

Depuis la racine du dépôt :

```bash
node scripts/maintenance/test-migrations-catalogue-static.js "$PWD"
node scripts/maintenance/test-migrations-catalogue-postgres.js "$PWD"
```

Le premier test ne contacte pas PostgreSQL. Le second exige un serveur local sur `::1:5432`, la base `sateer_test`, le paquet `pg` du dépôt, `pg_dump`, `psql` et le droit PostgreSQL `CREATEDB`. Il consulte `sateer_test` en lecture seule, restaure **seulement son schéma** dans une base temporaire nommée aléatoirement, retire les trois colonnes sur cette copie, applique 042 puis 043 deux fois, vérifie la structure et l'absence de rôles attribués, puis supprime la base temporaire.

**Limite** : ce test utilise le schéma courant de `sateer_test`. Il ne prouve pas qu'une base vierge peut rejouer toute la suite 001…043 à partir de zéro ; cela nécessite un test du système complet de migrations et de leurs dépendances. Il ne vérifie pas non plus l'authentification HTTP ni les données historiques. Si la base temporaire ne peut être supprimée, le test échoue en indiquant son nom : faire vérifier avant toute intervention manuelle.

La suite de consolidation consiste à tester les parcours fonctionnels (workflow, supervision, courriers, catalogue), revoir les dépendances, puis créer des commits thématiques. **Point de reprise :** fiche fictive de passeport en brouillon, validation et publication explicitement limitées à la recette, simulation de réponse e-mail et lien public vers Mon Consulat. Ne pas confondre la recette et la validation par une autorité réelle.
