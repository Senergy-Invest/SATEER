# ADR-007 — Lecture HTTP du réseau institutionnel (A3c)

Statut : prototype **désactivé par défaut**, recette uniquement.

- Source canonique : `organisation_relationships`, **sans table ni moteur de hiérarchie parallèle**.
- Seul `GET /api/institution-network/:organisationId?tenant=CODE` est prévu.
- Double garde de montage : `PGDATABASE=sateer_test` et `SATEER_ENABLE_INSTITUTION_NETWORK_READ=1`.
- Session validée par le serveur SATEER. `req.auth.personneId` demeure la source d'identité, jamais `req.query`.
- Le code tenant résout un identifiant actif en PostgreSQL. Le service A3b refuse les relations hors tenant.
- Seule une permission **existante et explicitement attribuée** `VIEW_INSTITUTION_NETWORK`, de portée ORGANISATION, sur la racine permet la lecture. A3c **ne crée, n'attribue ni ne migre cette permission** : si elle est absente, l'API refuse l'accès.
- Le périmètre visible est la racine et ses descendants structurés ; aucune organisation non descendante n'apparaît.
- Projection limitée à `{id, nom, type}`, profondeur et arêtes parent/enfant/type ; ni personnel, dossiers, correspondances, données privées, statistiques ni permissions.
- Une relation de tutelle **n'hérite d'aucune permission sur le contenu métier**.
- Aucune mutation HTTP, aucun endpoint administratif, aucun lien de tutelle créé et aucun flux inter-tenant.
- L'interface ministérielle mondiale nécessitera un annuaire validé et des agrégats publiés sous autorisation : **ne pas lire directement les données privées des tenants**.

## Tests

1. Test synthétique Express : absence de session, contexte erroné, mauvais tenant, permission refusée, panne, absence de POST, projection minimale, garde du montage.
2. Contrats A1–A3b et vérifications statiques.
3. Audit PostgreSQL A3b puis essai du service A3b avec requêtes réelles en transaction `READ ONLY` sur le cluster `sateer_test` autorisé.
4. Non-régression HTTP P3.1 transactionnelle et nettoyage vérifié.

Ce lot ne prouve pas encore une session institutionnelle réelle dotée de la future permission ministérielle ni un dashboard opérationnel. Ces étapes requièrent un protocole d'habilitation et une recette institutionnelle distincts.
