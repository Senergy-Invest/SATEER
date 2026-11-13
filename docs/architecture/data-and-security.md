# Données, contrats et isolation

## Périmètres d’autorisation

Une opération métier doit être évaluée côté backend à partir de la session et de ses relations : tenant, organisation, expérience, territoire/circonscription, personne, rôle, permission et périmètre de ressource. Un identifiant fourni par l’interface sélectionne une ressource ; il ne prouve pas que l’appelant peut l’utiliser.

Dans le dépôt, `auth-http.js` vérifie la session ; `auth-authorization.js` et les services de permissions calculent des droits. Les API de demandes, dashboards, publications, identité et pièces appliquent ces décisions à des niveaux différents. Tout nouveau parcours doit tester l’accès autorisé et les refus par appel direct à l’API, y compris les accès par ID.

Les relations interorganisationnelles sont des autorisations explicites et datées. Ne pas déduire le droit d’accès du seul fait qu’une organisation existe dans le même tenant.

## Propriété canonique

| Données | Source de vérité actuelle | Règle |
|---|---|---|
| Personnes, organisations, rattachements, rôles, permissions, territoires | Tables Core PostgreSQL | Ne pas répliquer ces références dans des tables moteur sans besoin et lien explicites. |
| Demandes, historique, réponses, routage | Tables métier PostgreSQL et fonctions workflow | Le dossier/historique constitue la trace du traitement ; les dashboards en sont des vues dérivées. |
| Publication, canaux, ciblage, abonnement | `publications`, `communication_channels`, `communication_publication_targets`, `communication_channel_subscriptions` | Visibilité, ciblage, préférences d’abonnement et notification sont des notions distinctes. |
| Métadonnées du coffre et pièces de dossier | Tables `citizen_private_files` et `demande_documents_partages` | Les octets sont chiffrés sur disque ; l’ID et les permissions doivent relier la métadonnée au bon propriétaire et dossier. |
| Notifications | Table `notifications` | Une ligne enregistrée ne prouve pas qu’un e-mail ou une notification externe a été livré. |

## Isolation et dégradation

Les requêtes qui manipulent des données organisationnelles doivent porter les contraintes de tenant et d’organisation pertinentes. Les capacités partagent actuellement un processus Express et un pool PostgreSQL : une erreur ou saturation commune peut affecter plusieurs parcours. Les fichiers chiffrés ajoutent une dépendance de stockage séparée ; les erreurs de stockage ne doivent pas laisser un dossier ou un fichier orphelin.

Pour toute écriture multi-support (base et disque), utiliser des identifiants synthétiques traçables, compenser les écritures partielles et vérifier les résidus après nettoyage. Ne pas prétendre qu’un `ROLLBACK` SQL couvre des appels HTTP ou des connexions distinctes.

## Échanges entre moteurs

Décrire pour chaque interface : propriétaire du contrat, données minimales échangées, autorisations requises, erreurs, idempotence et versionnement si la compatibilité l’exige. P7 appelle actuellement le routage directement ; cette intégration doit rester explicite et ne pas exposer les documents privés au moteur de routage.

Les événements asynchrones sont pertinents lorsqu’ils réduisent un couplage réel (par exemple, demande reçue → notification). Ils ne sont pas requis par principe et ne doivent pas devenir un second registre canonique.
