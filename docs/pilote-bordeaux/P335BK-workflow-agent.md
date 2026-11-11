# Bordeaux P3.3.5BK — workflow agent, preuve transactionnelle

## Périmètre

Transition explicite d'une demande en cours :

- `MESSAGE` : réponse visible citoyen + historique + notification ; conserve `EN_COURS`.
- `DOCUMENT_PRET` : confirmation personnelle explicite, statut documentaire `PRET_A_RETIRER`, conserve `EN_COURS`.
- `DOCUMENT_REMIS` : uniquement après `PRET_A_RETIRER`, trace `REMIS` et clôture la demande (`TRAITEE`).

Les opérations documentaires ne doivent jamais être déduites d'une simple réponse. Les permissions et la capacité du bureau sont vérifiées côté serveur, ainsi que l'organisation et le tenant. L'écran affiche la nature de l'action et demande confirmation pour les deux transitions documentaires.

## Concurrence et transactions

Le CTE `contexte` verrouille la ligne de `demandes` avec `FOR UPDATE OF d` avant d'évaluer les préconditions de transition. Ceci vise à éviter que deux confirmations concurrentes se fondent sur le même état initial. Les mutations réponse / état / historique / notification sont effectuées dans une instruction SQL unique.

Une réponse `MESSAGE` répétée constitue pour l'instant un **nouveau message** : l'API ne garantit pas l'idempotence d'une tentative HTTP perdue/rejouée. Le bouton est désactivé après l'acceptation côté client, mais cela ne constitue pas une clé d'idempotence serveur. Ne pas considérer ce point résolu sans protocole de requête idempotent versionné.

## Tests

`SATEER_TEST_WORKFLOW=1 PGDATABASE=sateer_test PGHOST=::1 PGPORT=5432 node scripts/p6-routing-api-test.js`

Le harnais historique P6 contrôle l'identité de l'instance PostgreSQL, utilise une seule transaction `BEGIN/ROLLBACK`, des comptes et demandes **entièrement synthétiques**, puis vérifie l'absence de résidus après rollback via une nouvelle connexion. Les séquences PostgreSQL peuvent avancer, même après rollback ; les dossiers préexistants ne doivent pas être modifiés.

Les scénarios BK font des requêtes HTTP sur un serveur de test éphémère (et non sur 3200/3300), vérifient `401/403/400/409`, les trois transitions, l'historique, les notifications et la consultation par citoyen. Les tests de refus et de duplication sont **séquentiels** : une vraie charge concurrente à plusieurs connexions reste à tester séparément avant usage institutionnel effectif. Un succès de ces tests ne constitue pas une validation par les autorités du Consulat.

## Git et autres modules

La campagne BK stage uniquement huit fichiers ciblés. Dans `server.js`, elle exclut expressément le bloc non validé `SATEER_ENABLE_ORG_EXP_API`. Les autres modifications locales et non suivies sont préservées. Après confirmation explicite : commit ciblé, `git push` non forcé et vérification du SHA distant. Toute étape non concluante bloque la publication GitHub du workflow.

## Après ce lot

1. Canaux, abonnements et relais associatifs : contrats, autorisations, ciblage et parcours HTTP synthétiques.
2. E-mail entrant réel : uniquement boîte expressément autorisée, sans remplacement de la boîte existante ; classifier **l'intention avant le thème**.
3. Recette de bout en bout des profils et préparation de la démonstration.
