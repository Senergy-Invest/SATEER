# P335BQ — Navigation vers les courriers fictifs de Bordeaux

## Anomalies

1. L'entrée « ✉ Courriers entrants » utilisait uniquement `organisation` et `tenant` dans l'URL du tableau de bord, même lorsque Mon SATEER ouvrait P2 sans ces paramètres. Le lien restait `aria-disabled=true` malgré un dashboard opérationnel autorisé.
2. La page `email-secretariat-demo.html` acceptait seulement `organisation`, alors que certains liens employaient `organisationId`.

## Correction

- Le tableau P2 émet désormais `sateer:vice-dashboard-refreshed` avec `{organisationId, tenant}` **après** chargement autorisé de ses données.
- L'entrée courriers mémorise ce contexte et ne crée le lien qu'avec une organisation et un tenant cohérents. Un conflit entre paramètres URL et contexte chargé désactive le lien.
- La page courriers admet `organisation` et `organisationId`. Toutes les API continuent de vérifier session, permission `VIEW_OPERATIONAL_DASHBOARD`, organisation/tenant et base de test.
- Les numéros de version JS changent pour éviter un affichage Safari d'anciens scripts mis en cache.

## Portée et vérification

Modifications **front-end uniquement**. Aucune nouvelle page, aucune permission accordée, aucun courrier réel, aucun envoi, aucune migration SQL, aucun redémarrage prévu. Test : `node --test scripts/maintenance/test-bordeaux-navigation-courriers.js`. Recette visuelle : depuis un dashboard Vice-Consul ouvert sans paramètres URL, après actualisation des indicateurs, le lien devient cliquable et ouvre l'unique page courriers fictifs ; lors d'un refus d'accès opérationnel, aucune autorisation n'est déduite de l'interface.
