# SATEER Energy — MVP02-UX-1 : parcours citoyen adaptatif

**Date :** 2026-11-18. **Source :** `SATEER-ENERGY-MVP02-UX-PHOTO-QR-CADRAGE-20261118.md` (cadrage utilisateur). **Statut initial :** code candidat, validation locale et SHA distant à confirmer dans le rapport final.

## Pourquoi ce lot

Le MVP01 fournit un `EnergyCase` privé authentifié. Le MVP02-A fournit l'inventaire privé, les zones et les lignes d'équipements avec FKs composite tenant/propriétaire/site, UUID et idempotence. Le premier écran MVP02-A demande de créer manuellement des zones, puis de choisir leur hiérarchie avant de déclarer un équipement : ce parcours technique est insuffisant pour le grand public.

Le MVP02-UX-1 **conserve le modèle et l'API** et modifie uniquement l'expérience de présentation. Il ne rend pas la photo, le scan ou le passeport disponibles.

## Décisions appliquées

- Accueil SUNU Courant en langage quotidien : besoins illustrés, informations de site, détail d'alimentation/compteur facultatif sous section dépliable, valeurs `INCONNUE` / `INCONNU` plutôt que présumer un réseau ou compteur, choix de profil explicite ; les mêmes clés API MVP01 sont préservées.
- Inventaire mobile-first en trois actions : **choisir un appareil**, **nommer/indiquer quantité**, **enregistrer et retrouver**. Catégories illustrées et ordre adapté au `typeSite` déjà stocké et, si accessible, aux besoins `EnergyCase` (ex. pompage, confort). Aucun nouveau questionnaire de profil.
- Le moteur MVP02-A exige un emplacement (`zoneId`). Si aucune zone principale n'existe, le client crée une zone technique racine **après un clic explicite de sauvegarde** et **uniquement après validation de la saisie** ; l'utilisateur ménage ne remplit pas cette structure. Si une racine existe, elle est réutilisée. Le choix d'une zone connue est facultatif.
- La saisie de puissance est facultative et cachée sous « Détails techniques ». Quantité multiple = **une ligne déclarative**, pas plusieurs passeports certifiés.
- Les sites professionnels conservent « Organiser par pièces, bâtiments ou ateliers », section avancée et facultative ; pas de second moteur d'inventaire.
- Appareils conservés et visibles à la réouverture ; une transaction enregistrée par équipement. Pas d'auto-save du texte avant confirmation : « sauvegarde progressive » signifie que **chaque équipement validé persiste individuellement**, sans imposer de compléter tout le site.
- Aucune API de photo, QR, OCR, partage institutionnel ou IA ajoutée ; leur état est explicitement « prochainement ».

## Propriétés techniques

- `public/sunu-courant.html`, `.css` : présentation simplifiée du formulaire MVP01 (aucune nouvelle route).
- `public/inventaire-energie.html`, `.css`, `.js` : façade de saisie sur `/api/energy/inventory`.
- `public/sunu-inventory-ux-model.js` : catalogue de présentation testable sans DOM, adaptable au type de site et aux besoins ; familles mappées au catalogue contractuel MVP02-A. TV et ventilateur restent `AUTRE` tant qu'une famille spécifique n'est pas versionnée ; le nom déclaré est conservé.
- Contrôles d'identité/session/tenant, validation serveur des zones/équipements, transaction, FKs, historique, déduplication = **inchangés**.
- Navigation locale `3473` seulement si instance réelle de recette déjà autorisée ; aucune migration, aucun compte ou nouvelle permission.
- Frontière importante : la zone racine créée automatiquement n'est pas une mesure ou une preuve de bâtiment réellement inspecté. Il s'agit d'un classement déclaratif.

## Limites assumées

- L'esthétique est désormais plus accessible, mais la validation d'usabilité avec des non-techniciens reste à réaliser en situation réelle.
- Les pictogrammes illustrent des catégories, pas des photographies d'appareils réels.
- L'interface affiche la liste des 500 premiers éléments selon la limite actuelle de l'API ; le site signale explicitement un affichage partiel.
- L'API MVP02-A ne fournit pas la modification/suppression de fiches. Ce lot ne prétend pas les avoir ajoutées.
- La photo, la plaque signalétique, le QR SATEER, les étiquettes et les données vérifiées nécessitent **MVP02A** et des droits documentaires propres.
- Les invitations/revues collaboratives nécessitent **MVP02-B**, après MVP02A.
- Aucune éligibilité Ecofridges ni dimensionnement solaire déterminés par le seul inventaire.

## Critères de recette visuelle

1. Compte Energy A sur `http://localhost:3473` : page « Mon besoin » lisible sur smartphone et formulaire fonctionnel sans compteur/facture obligatoire.
2. Cliquer « Inventorier ce site ». Les données existantes (bâtiment/salle/lampe) sont toujours visibles, sans dégradation.
3. Ajouter un réfrigérateur sans puissance ni emplacement explicite ; l'appareil réapparaît après actualisation.
4. Sur un site sans zones, vérifier qu'un appareil peut être enregistré : une zone principale déclarative est créée automatiquement et ne demande pas d'étage.
5. Les « détails techniques » et « organiser les espaces » restent facultatifs ; type de site industriel expose des catégories métier différentes.
6. Sur compte Energy B, aucun inventaire du compte A n'est exposé.
7. « Photos / QR » bien signalés comme **non disponibles**.
8. Contrôler la lisibilité sur téléphone et clavier, y compris l'absence de défilement horizontal.

Le mot de validation `VALIDER_VISUEL_MVP02_UX1` atteste uniquement ces contrôles en recette locale. Il ne constitue **pas** une approbation d'une technologie de photo/QR non livrée, ni une réception de production.

## Suivi Git

Le paquet accepte deux états propres et vérifiés : (a) MVP02-A/B encore non commités avec parent `5b5d617f...`, (b) MVP02-A déjà publié et worktree propre. Dans (a), la clôture regroupe le socle MVP02 et sa refonte dans un commit strict ; dans (b), le commit est limité à la refonte. Dans les deux cas : pas de reset/clean/stash/pull/rebase/force-push ; publication après validation ; SHA distant comparé au SHA local.

**Suite stricte :** MVP02A-1 passeport + preuve photo + QR opaque ; MVP02A-2 lecture d'étiquettes assistée avec confirmation ; puis MVP02-B invitations, contributions et revue responsable.
