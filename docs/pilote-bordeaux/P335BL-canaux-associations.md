# P3.3.5BL — Simulation et contrats de communication

## Périmètre

Cette modification consolide uniquement le **harnais de simulation UI** du tableau de bord des associations et des **tests de contrats de sécurité en lecture seule** concernant canaux, abonnements, audience et relais associatifs. Aucun code de production, migration, rôle, boîte courriel ou donnée métier n'est modifié par ce lot.

## Pourquoi le test du dashboard échouait

Le test `scripts/test-bordeaux-associations-dashboard.js` utilise `vm.runInNewContext`. Son objet simulant `window` ne fournissait pas `dispatchEvent` et la VM ne fournissait pas `CustomEvent`. Le tableau de bord emet l'événement `sateer:vice-dashboard-refreshed` au terme du chargement. La simulation provoquait alors une exception, traitée par l'UI comme une erreur de chargement qui masquait les indicateurs. Les deux objets de simulation sont maintenant stubbés, sans modification du produit.

## Limites des validations

Les tests statiques de `test-bordeaux-communication-contracts.js` inspectent les contrats existants, mais ne prouvent ni le comportement complet des API sous sessions authentifiées ni la diffusion en base PostgreSQL. La recette associative persistante `scripts/association-relay-demo.js` est explicitement exclue : elle écrit des fixtures synthétiques dans `sateer_test` et désactive son nettoyage automatique. Une campagne distincte devra démontrer ciblage et relais avec un environnement réinitialisable ou un nettoyage vérifié.

## Cycle de livraison

Tests locaux conformes → commit ciblé (3 fichiers) → push GitHub sans `--force` → comparaison exacte SHA local / distant. Aucun autre changement en attente n'est ajouté à l'index.
