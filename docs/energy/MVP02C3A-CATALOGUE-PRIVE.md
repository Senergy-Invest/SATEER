# SUNU Courant — MVP02-C3A · Catalogue technique évolutif privé

Base Git **`91d366998ba8bd74b3fa355afec1ebfe3b175871`**, branche `work/energy-mvp01`, tenant de recette `ENERGY_MVP01D_RECETTE`, uniquement base `sateer_test`. Ce document décrit une tranche verticale **candidate**, à valider sur Mac ; il ne constitue pas une validation de production.

## Objectif et doctrine conservée

SUNU Courant garde deux profondeurs : **découverte autonome** (ménage, PME, collecte courte, sans plan obligatoire) et **accompagnement contractuel** (grosses installations, photo/plaques, organisation du site, tableaux, compteurs, circuits, futur jumeau numérique simplifié). On n'impose pas au grand public des sous-familles, modèles ou relevés techniques ; le lien vers le catalogue est facultatif.

**Une référence de modèle n'est pas un appareil physique.** L'inventaire canonique `energy_inventory_equipements` reste inchangé (lignes quantitatives), le passeport `energy_equipment_passports` représente un appareil physique, et `energy_catalog_references` représente une référence technique privée au **site**. Plusieurs passeports peuvent référencer le même modèle ; un même passeport ne peut être lié à deux références distinctes. La liaison n'emporte ni transfert de photos ni mise à jour des valeurs OCR.

## Parcours livré

1. Propriétaire Core du site : ouvre **Mes appareils → Catalogue technique (facultatif)** sur la recette 3480.
2. Saisie **famille existante**, **sous-famille libre**, **désignation libre** et, si connues, marque/modèle/puissance nominale/tension. Exemple : FROID → compresseur frigorifique → compresseur du groupe froid. Aucune puissance exigée.
3. Sélection facultative d'un passeport individuel : lecture **privée** des dernières valeurs **confirmées par l'utilisateur** sur sa plaque, et indication de la présence de photos, sans lire/coller les fichiers AES-GCM. La proposition ne recopie que les champs que le propriétaire soumet explicitement. Toute divergence entre marque/modèle soumis et valeurs de plaque confirmées est bloquée.
4. La référence est initialement `CANDIDATE`. Validation explicite du propriétaire avec marque + modèle connus → `REFERENCE_INTERNE` (ni certification, ni homologation, ni mesure). Refus historisé, sans suppression. L'empreinte SHA-256 stable des champs famille+sous-famille+marque+modèle détecte les doublons **dans le site**, y compris casse/espaces/accents.
5. Association explicite d'une référence revue à un passeport **du même propriétaire, du même tenant et du même site**, avec contrôle des plaques confirmées ; une tentative d'association divergente est rejetée. Pas d'accès à d'autres comptes, photos, QR, mesures ou institutions.

## Limites délibérées et suites

- Pas de reconnaissance automatique de fabricant/modèle par IA ; Apple Vision A2 aide seulement à extraire des valeurs OCR **déclarées** et confirmées.
- Pas de catalogue mondial/CEDEAO mutualisé avant un dispositif distinct de consentement, droit sur les photos, provenance, licences et data quality. L'identification cross-site à l'aide d'une fiche peut devenir un **service** seulement après cadrage.
- Pas de contribution directe d'un occupant au catalogue canonique : C2 permet déjà d'exprimer l'équipement dans son périmètre ; C3A donne au propriétaire la qualification technique. Une proposition avancée par les collaborateurs nécessitera C3B et les droits C1/C2, avec contrôle de qualité.
- Pas de fusion automatique d'appareils au motif qu'ils portent le même modèle ; l'historique de maintenance demeure propre à chaque passeport.
- Pas de compte professionnel institutionnel, ni lien AEME/SENELEC/AÉME/CEDEAO présumé.
- Aucune cartographie d'alimentation n'est induite du modèle : C4 devra relier **lieux**, **usages**, **réseaux électriques et compteurs** séparément, puis construire un éditeur d'esquisses et des vues par responsabilité. Les relations « bâtiment alimenté par plusieurs tableaux » et « compteur couvrant plusieurs bâtiments » sont à supporter.
- Les limites de première tranche (100 références par page, 500 passeports par liste) imposent pagination et recherche pour les grands sites ; pas de promesse de scalabilité vérifiée sans charge.

## Sécurité et preuve

Migration additive `057_energy_catalogue_private.sql` sur cluster PostgreSQL épinglé, après rollback de test et confirmation `AUTORISER_MIGRATION_MVP02C3A`. API `/api/energy/catalogue/v1` : authentification Core, tenant, propriétaire, Origin exact sur POST, UUID et idempotency-key, journal append-only, aucune session côté navigateur. Tests négatifs A/B, refus des doublons et des sources hors périmètre. Pas de reset/clean/stash/pull/force push ; paquet installable depuis le seul SHA GitHub C2, commit ciblé, push avec SHA distant vérifié **uniquement après validation visuelle** `VALIDER_VISUEL_MVP02C3A`. Rapport consolidé dans Downloads et Finder.

## Prochains lots dans l'ordre

**C3B éventuel :** contributions de références techniques depuis les unités C2 et rapprochement humain, sans entrée automatique au catalogue ; ensuite **C4A** : cartes physique/fonctionnelle/électrique, **C4B** : éditeur d'esquisses, **C4C** : tableaux de bord et mobilisation ; les mesures, économies et maintenance industrialisée viendront sur des données qualifiées.
