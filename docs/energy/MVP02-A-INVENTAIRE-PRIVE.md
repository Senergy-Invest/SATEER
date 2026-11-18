# SATEER Energy — MVP02-A : inventaire privé du responsable

**Base figée :** `work/energy-mvp01` au commit `5b5d617f272fbfe0ccf3cf68d93c05c24e563494` (GitHub vérifié le 17/11/2026). **Statut initial du lot :** implémentation à installer et tester sur le Mac. La recette persistante et la validation visuelle n'ont PAS encore eu lieu.

## Livrable vertical

- À partir de chaque `EnergyCase` privé MVP01, créer **un site d'inventaire** dont le nom, le pays et le type sont repris du dossier existant et non fournis comme autorité par le client.
- Déclarer les espaces du site : bâtiments, extérieurs, étages, pièces, zones. Hiérarchie acyclique par création seule, parents du même site, avec règles de parent autorisé. Aucun renommage/partage/suppression à ce stade.
- Déclarer les équipements **dans une zone de ce site** : famille, libellé, quantité, puissance unitaire optionnelle en watts, provenance `DECLAREE`. Aucune mesure vérifiée, économie calculée ou badge d'audit.
- Identifiants UUID stables pour site, zone et ligne d'équipement. Déclarations journalisées en événements `InventorySiteCreated.v1`, `InventoryZoneDeclared.v1`, `InventoryEquipmentDeclared.v1` avec transaction.
- Éviter doublons en cas de réessai avec clé d'idempotence propre aux zones/équipements. Réutiliser une clé avec un autre contenu donne 409.
- Chaque lecture et écriture est limitée au **tenant Energy autorisé par configuration**, à l'appartenance Core et à la **personne de la session**; références inter-tenant, inter-owner et inter-site interdites aussi par clés étrangères composites.
- Interface `/inventaire-energie.html?tenant=...&case=...` accessible depuis les dossiers de SUNU Courant, **seulement après activation explicite du lot**. Aucun moteur scientifique ni portail institutionnel dupliqué.

## Frontières

- Core existant = authentification, personne, organisations, tenants. Le routeur inventory est monté derrière `exigerSession` existant, comme MVP01 ; les identités client ne sont pas acceptées.
- `EnergyCase` MVP01 reste la source canonique du dossier et de son propriétaire. Le site d'inventaire ne constitue pas un nouveau dossier.
- Première tranche = **inventaire du propriétaire**. Contributions par invitation temporaire, consentement explicite, permissions par ressource, validation/rejet par responsable et provenance contributeur **NON IMPLÉMENTÉS** (MVP02-B). Ne pas appeler cette tranche « inventaire participatif terminé ».
- Équipement déclaré = ligne de comptage **sans passeport d'actif certifié** ; identité durable et historique de vie de l'équipement traités au MVP02A selon la roadmap REV3, sur ce même référentiel (pas un inventaire bis).
- Absence de capteur, photo, facture, localisation précise, pièce d'identité et données financières. Pas d'envoi à SENELEC, AEME, ASER, ANER ni Invest.

## Sécurité / SQL

- Migration versionnée `database/051_energy_inventory.sql` **non appliquée par le lot A** ; garde `current_database()='sateer_test'`.
- API `/api/energy/inventory` uniquement si `PGDATABASE=sateer_test`, `SATEER_ENABLE_ENERGY_MVP01=1` **et** `SATEER_ENABLE_ENERGY_MVP02=1`.
- Test intégré utilise `pg_temp` et `SAVEPOINT` sous transaction externe, puis `ROLLBACK`. Base locale et cluster épinglés. Ne pas le présenter comme test avec vraie session : un contrôle Core bout en bout reste nécessaire en recette persistante.
- Le navigateur doit attendre la migration et le démarrage explicite avec la variable de lot ; le lot A ne redémarre aucun serveur.
- Pas de commit/push avant validation fonctionnelle et visuelle, conformément à la doctrine SATEER.

## Conditions de sortie et suite

1. Vérifications du SHA local/distant et du worktree; tests unitaires, PostgreSQL/HTTP rollback, Core/P1/Ambassade/Diaspora ; rapport unique Finder.
2. Lot B : recette avec Core authentifié sur tables temporaires ou persistent lorsque autorisé, puis migration 051 appliquée sur `sateer_test` seulement sur confirmation humaine explicite et preuve du cluster ; validation du parcours navigateur sur serveur dédié.
3. MVP02-B : invitations limitées par capacité/ressource, contrôle du responsable sur les contributions, audit et révocation.
4. Commit/push GitHub cible avec SHA distant vérifié seulement après validation. Réviser statut du Capability Registry et note de reprise Codex après publication.
