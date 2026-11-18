# SUNU Courant — MVP02A-1 : passeport individuel, photos privées et QR

**Date :** 18 novembre 2026. **Base obligatoire :** `work/energy-mvp01` SHA `e56a2931ecada2729aae1334aba2aa36a2e91f78` (MVP02-UX1). **Périmètre :** recette locale technique exclusivement. La preuve finale (tests, confirmation visuelle, SHA distant) est dans le rapport ZIP du script `EXECUTER_MVP02A1.sh`, et ne doit pas être inférée de ce document.

## Capacités de la tranche

- Chaque ligne d'inventaire (`energy_inventory_equipements`, quantité N) reste une **déclaration groupée**. La création d'un passeport est **explicite pour un numéro individuel** entre 1 et N ; trois lampes ne deviennent pas trois appareils certifiés. Unicité `(inventaire_equipement_id,numero_individuel)`.
- L'identifiant de passeport `public_id` est stable et indépendant du fabricant/numéro de série. La fiche conserve des données déclarées, jamais une certification.
- Les photos `APPAREIL` ou `ETIQUETTE` sont facultatives et reformatées dans le navigateur ; JPEG brut, PDF, EXIF/XMP et images hors limite sont refusés. Stockage AES-256-GCM avec AAD propriétaire/passeport/photo/type/MIME, sous-clé HKDF différente du coffre d'identité, disque privé `~/.sateer-energy-private/sateer_test/equipment-photos`, métadonnées en PostgreSQL. Au maximum quatre photos actives par passeport ; suppression logique et effacement du blob chiffré tentés après commit.
- QR local standard **version 5-L** (URL ASCII jusqu'à 106 octets), généré dans le navigateur sans service tiers. Le code ne contient qu'une URL avec un token opaque de 20 octets aléatoires ; aucun profil, appareil ou puissance. La consultation exige une session Core active ET un rattachement Energy ET l'appartenance au propriétaire. En recette, l'adresse `localhost:3474` n'est pas un lien accessible depuis un autre téléphone sans configuration réseau : ce n'est pas un QR public universel. La conversion du générateur en une capacité technique généralisable et la résolution des QR hors localhost restent à industrialiser.
- Endpoints privés sous `/api/energy/passports`, activés uniquement si `PGDATABASE=sateer_test` et `SATEER_ENABLE_ENERGY_MVP01=1`, `...MVP02=1`, `...MVP02A1=1`. Session Core et rattachement tenant contrôlés en serveur. Origine POST/DELETE stricte. Aucun partage, transfert vers institution ou Invest, ni lecture publique.
- Pages `fiche-equipement.html` et `equipement-qr.html`. Le navigateur inventaire reste fonctionnel si la capacité passeport n'est pas activée.

## Réutilisation et frontières

- Auth/Core, propriétaire, tenant et site proviennent des systèmes existants ; pas de deuxième compte/permission.
- Le fichier est une preuve déclarée non vérifiée. Photo n'est pas mesure, photographie de plaque n'est pas extraction validée.
- Contrat de passeport et d'événements pour futur Equipment Registry transversal ; ne pas créer de nouveau registre en Maintenance, Industrie ou Automobile.
- **MVP02A-2** : lecture assistée de plaque, marque/modèle/puissance candidates avec validation humaine, provenance et versionnement ; aucune requête IA externe dans MVP02A-1.
- **MVP02-B** : invitations temporaires et validation du responsable, pas encore livrées. Un QR ne remplace pas le contrôle des droits.

## Points d'attention pour la production

- En MVP, le token QR est stocké en base comme valeur aléatoire à forte entropie, jamais comme autorisation autonome ; prévoir rotation/révocation/URL publique stable et tests de scanners mobiles pour un déploiement réel.
- Chiffrement dépend du fichier Core `SATEER_IDENTITY_KEY_FILE` (ou de sa valeur locale de recette), jamais inclus dans Git/ZIP ; rotation et sauvegarde des clés devront être conçues. Les photos chiffrées sur disque exigent sauvegarde/restauration et politique de conservation.
- Suppression photo : l'enregistrement DB est masqué immédiatement ; une erreur disque pourrait laisser un blob chiffré orphelin. Prévoir un job de réconciliation sécurisé avant usage non fictif.
- Limites : pas de révision de fiche, pas de nouvelle affectation/propriété, pas de lien de remplacement, pas de validation terrain, pas de reconnaissance automatique, pas de garantie de conformité. QR version fixe pour la recette seulement.
- Images de recette fictives seulement. Pas de photo d'enfants/personnes, d'adresse, de facture ou de plaque d'identité.

## Clôture

1. Tests unitaires QR/SQL/AES/HTTP, E2E PostgreSQL en transaction rollback, sessions Core sur instance 3474, non-régression P1/Bordeaux/Ambassade/Diaspora.
2. Confirmation visuelle du compte A, photo, QR, refus de B, liste du groupe N, mobile, erreurs.
3. Commit ciblé, push non forcé, SHA local/distant identiques, rapport unique Finder, point de reprise exact.
