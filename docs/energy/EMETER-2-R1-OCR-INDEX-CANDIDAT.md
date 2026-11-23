# E-METER-2 R1 — OCR indicatif des index de compteurs

## Statut
**Candidat local** préparé après l'audit R0 du 23/11/2026, SHA verrouillé `48c9fa4e953ae8b9de2a28ee8c6ef6e6373144e6`. Ne pas le dire livré avant recette Mac, HTTP A/B, reconnaissance synthétique Apple Vision, revue visuelle et commit/push explicitement autorisés.

## Conception
- Réutilise le binaire Apple Vision de MVP02A2 exclusivement comme reconnaissance de texte. Extraction de nombres conçue séparément dans `energy-meter-photo-domain.js`.
- Mission E-PARTICIPATION-1 `A_FAIRE` et titulaire Core authentifié requis. SQL `BEGIN READ ONLY`, chaîne C1 active, registre du compteur encore actif. Aucun nouveau droit propriétaire.
- Le navigateur convertit l'image en PNG par canvas (élimination des EXIF), taille traitée max 3 Mo, serveur vérifie le format réel avec `formatImage`. La photo est envoyée pour traitement **en mémoire** et n'est pas conservée par SATEER dans cette tranche.
- OCR indicatif : un seul candidat distinct, unité attendue, refus de plusieurs nombres, séparateurs ambigus, tensions et numéros de série. Pas de certification ni preuve photo conservée.
- **Double action humaine** : `Lire l'index sur la photo`, puis `Reprendre cet index après vérification visuelle`. La soumission de mission `A_FAIRE -> A_REVOIR` reste celle d'EP1, et l'intégration au registre canonique reste réservée au coordinateur.
- Aucun INSERT, aucune nouvelle migration ni modification des anciennes mesures. Les 9 relevés préexistants restent la référence du R0.
- Seul le drapeau `SATEER_ENABLE_ENERGY_METER_2_R1=1` active l'API sur `sateer_test`, conjointement avec tous les drapeaux EP1 existants. Une instance sans ce drapeau conserve la page EP1 sans contrôles photo.

## Limites à traiter plus tard
- Ce n'est pas un moteur OCR garanti pour tous les afficheurs (analogiques à aiguilles, OLED/LCD, reflets, cadrages flous, décimales, langue et unités). Un chiffre ambigu doit être saisi manuellement, jamais deviné.
- Le statut de la mission peut changer pendant l'analyse ; les droits sont revérifiés après l'OCR et le POST EP1 revalide au moment de la soumission.
- La photo n'est pas un justificatif stocké ni une preuve contractuelle ; politique de conservation et chiffrement photo éventuels à décider ultérieurement. Sans nouveau besoin validé, **ne pas copier le coffre photos d'équipement**.
- Le contrôle d'abus est une limitation de requêtes **en mémoire par instance**, non un quota distribué de production.
- Les tests unitaires et les mises en page ne prouvent pas la reconnaissance réelle sur les images de compteurs. La recette synthétique et la revue mobile devront être indépendamment effectuées avant toute clôture GitHub.

## Critères de recette
1. Tests du contrat, test OCR local synthétique, gestion photo invalide, unité incompatible, plusieurs chiffres, refus A/B, refus tenant et Origin.
2. Aucun nouveau relevé, aucune nouvelle mission pendant la pose de R1. SQL lecture seule et comparaison de l'empreinte R0.
3. Sur une mission *nouvelle* explicitement autorisée dans une étape ultérieure : photo fictive, proposition OCR visible mais non envoyée, correction humaine, soumission normale et validation du propriétaire.
4. Commit/push ciblés uniquement après validation, SHA distant vérifié, rapport ZIP Finder.
