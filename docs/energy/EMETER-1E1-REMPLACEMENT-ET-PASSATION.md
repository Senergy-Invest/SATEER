# SATEER Energy — E-METER-1E1 : remplacement historisé d'un compteur

## Statut réel

**CANDIDAT R1**, non livré sur GitHub au moment de sa préparation. Ne pas le présenter comme validé ou opérationnel sans preuves : rapport Mac, migration 065 persistante autorisée, essais HTTP A/B, transaction contrôlée, recette visuelle, commit et SHA distant.

## Point de départ

Branche `work/energy-mvp01`, commit verrouillé `0aa547d21468abae6c3166b3a1c9846c87781180`, clôture 1D1. Audit E-METER-1E0 reçu le 22 novembre 2026 : PostgreSQL `sateer_test`, cluster `7699611241381229531`, un point, un compteur actif, huit relevés et deux événements `IMPORT_CSV_V1`, lecture seule conforme. Document REV2 local non suivi conservé hors commit.

## Contrat fonctionnel

- Un propriétaire Core choisit un site et un point avec exactement un compteur actif ; aucun rôle C1 collaborateur n'est inventé.
- Le formulaire saisit le nouveau compteur, son premier registre, un motif explicite de 12 à 400 caractères et une confirmation. Le serveur conserve la date réelle de la transaction comme *date de déclaration de la transition* ; ce n'est pas une vérification de la date d'intervention physique.
- Transaction indivisible sous verrou `FOR UPDATE OF s` de `energy_inventory_sites` : revalidation tenant/site/point/compteur actif, contrôle que les anciennes dates de relevés ne dépassent pas la transition, retrait de l'ancien, création du nouveau, premier registre et trois événements d'audit. Toute erreur après `UPDATE` déclenche `ROLLBACK`.
- Un seul appareil actif par point, garanti par `uq_meter_active_per_point`. Ancien appareil et anciens registres/relevés conservés. Aucun index n'est copié dans le registre neuf. Jamais de calcul d'énergie, certification ou tarif.
- Idempotency-Key UUID : même clé et même contenu dans le même site/propriétaire → même compteur retourné ; contenu différent → `CLE_REUTILISEE`. L'interface conserve la clé pour réessayer un appel réseau incertain.
- Motif et référence de l'ancien et du nouveau inscrits dans `MeterDeviceReplaced.v1`. L'événement est journalisé avec l'auteur Core dans `energy_meter_events`.

## Évolution SQL nécessaire

La migration additive `065_energy_meter_replacement.sql` étend **uniquement** le CHECK `energy_meter_events_action_check` de quatre valeurs à cinq. Elle refuse tout cluster/base non prévus ou contrat de contrainte inconnu. Les tables et contraintes 061 précédentes ne sont pas réécrites ; rien n'est supprimé. L'installation R1 ne l'applique **pas durablement** : seul son essai sous transaction puis `ROLLBACK` est effectué. Une autorisation humaine distincte et un paquet de migration contrôlé sont nécessaires avant les essais HTTP d'écriture.

## Structure technique

- `energy/energy-meter-replacement-domain.js` : validation stricte des données et listes blanches.
- `energy/energy-meter-replacement-store.js` : SQL paramétré, verrou site, intégrité, idempotence et transaction.
- `energy/energy-meter-replacement-http.js` : route GET de disponibilité et POST de remplacement, session Core, tenant, propriétaire, Origin.
- `public/energie-remplacement.{html,js,css}` : formulaire privé, contexte 1A et historique sans mutation cachée ; aucune intervention électrique.
- `database/065_energy_meter_replacement.sql` : catalogue d'événements.
- `scripts/test-energy-emeter1e1.js` et `scripts/maintenance/emeter1e1-pg-dryrun.js` : tests de domaine, HTTP, ordre transactionnel/rollback simulé et migration réellement testée avec ROLLBACK.

## Limites et prochaines preuves

- R1 n'est **pas** un remplacement de compteur exécuté sur le Mac. Les tests du store utilisent des doubles SQL pour certaines vérifications ; la vraie transaction sur la base de recette demande une autorisation de migration et un scénario contrôlé.
- Ne jamais prendre les huit relevés historiques comme jeu à modifier : un remplacement fictif ajouterait un nouvel appareil actif et des événements append-only persistants. Demander explicitement l'accord avant cet acte.
- Vérifier en réel : refus A/B, refus anonyme/Origin, double clic et reprise réseau, erreur injectée après retrait avec rollback, compteurs ancien/nouveau et historiques exacts, page en session privée.
- Avant toute publication, exécuter régressions Bordeaux/Ambassade/Diaspora et revue de sécurité ; rapport ZIP unique et Finder ; commit ciblé, push normal, vérification du SHA GitHub distant.
- Les compteurs remplacés ne sont pas un instrument de calcul automatique : E-METER-3 traitera plus tard la consommation en respectant les frontières physiques et les ruptures d'index.
