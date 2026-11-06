#!/usr/bin/env python3
"""SATEER Bordeaux: safe, repeatable frontend references normalization.
Only known exact UI structures are modified. No DB changes.
"""
from pathlib import Path
import sys, re

ROOT = Path.cwd()
CHANGED = []
CHECK_ONLY = '--check' in sys.argv


def change(file, src, dst):
    if src == dst:
        print(f'REF_OK: {file} (déjà conforme)')
        return
    if CHECK_ONLY:
        print(f'REF_A_CORRIGER: {file}')
        CHANGED.append(file)
    else:
        Path(file).write_text(dst, encoding='utf-8')
        CHANGED.append(file)
        print(f'REF_CORRIGEE: {file}')


def read(file):
    p = Path(file)
    if not p.is_file():
        raise SystemExit(f'STOP: composant manquant: {file}')
    return p.read_text(encoding='utf-8')

# Citizen: same source is used by all authorized citizens; do not patch accounts separately.
f = 'public/consulat.js'
s = read(f)
if 'Dossier n°${demande.id}' in s:
    change(f, s, s)
else:
    old='''        sousTitre.textContent =
            demande.categorie;'''
    new='''        // Identifiant fourni par l'API : même traitement pour tous les citoyens.
        sousTitre.textContent = `Dossier n°${demande.id} · ${demande.categorie || "—"}`;'''
    if s.count(old)!=1:
        raise SystemExit('STOP: structure Mon Consulat inconnue; aucune correction aveugle')
    change(f, s, s.replace(old,new,1))

# Agent unit workspace: same JS for every professional bureau.
f = 'public/unit-workspace.js'
s = read(f)
if 'Dossier n°${demande.id}' not in s:
    old='''                `${citizen || "Usager"} · ${demande.statut || "—"}`'''
    new='''                `Dossier n°${demande.id} · ${citizen || "Usager"} · ${demande.statut || "—"}`'''
    anchor='''        addDetailLine(
            detail,
            "Usager",'''
    if s.count(old)!=1 or s.count(anchor)!=1:
        raise SystemExit('STOP: structure Bureau inconnue; aucune correction aveugle')
    s=s.replace(old,new,1)
    s=s.replace(anchor, '''        addDetailLine(detail, "N° de dossier", `n°${demande.id}`);
'''+anchor,1)
    change(f, read(f), s)
else:
    if 'addDetailLine(detail, "N° de dossier", `n°${demande.id}`)' not in s:
        raise SystemExit('STOP: bureau porte une référence en liste mais pas dans le détail')
    change(f, s,s)

# Vice: two lists (recent requests, urgent requests). Same UI regardless of Vice account.
f = 'public/dashboard-vice-consul.js'
s=read(f)
marker='SATEER_REF_PILOTE_BORDEAUX'
if marker in s:
    if s.count(marker)!=2:
        raise SystemExit('STOP: correctif Vice partiel / conflit, arrêt')
    change(f,s,s)
else:
    old='''            informations.appendChild(
                titre
            );'''
    new='''            informations.appendChild(
                titre
            );
            // SATEER_REF_PILOTE_BORDEAUX : référence stable sur toutes les listes.
            const numeroDossier = Number(demande.id);
            if (Number.isSafeInteger(numeroDossier) && numeroDossier > 0) {
                const referenceDossier = document.createElement("span");
                referenceDossier.className = "dashboard-reference";
                referenceDossier.style.display = "block";
                referenceDossier.style.fontSize = "0.85rem";
                referenceDossier.style.fontWeight = "600";
                referenceDossier.textContent = `Dossier n°${numeroDossier}`;
                informations.appendChild(referenceDossier);
            }'''
    if s.count(old)!=2 or s.count('''            titre.textContent =
                demande.objet;''')!=2:
        raise SystemExit('STOP: listes Vice modifiées/inconnues; aucune correction aveugle')
    change(f,s,s.replace(old,new,2))

# Institution: four publications must display the API's publication.id.
f = 'public/publication-institutionnelle.js'
s=read(f)
if 'Publication n°${publicationId}' in s:
    change(f,s,s)
else:
    old='''            const title = document.createElement("h3"); title.textContent = publication.titre || "Information";
            const details = document.createElement("p");'''
    new='''            // Numéro fourni par l'API. Aucun HTML injecté ni droit modifié.
            const publicationId = String(publication.id ?? "").trim();
            const referenceValide = /^[1-9]\\d*$/.test(publicationId);
            const reference = referenceValide ? document.createElement("span") : null;
            if (reference) {
                reference.className = "com-pill";
                reference.textContent = `Publication n°${publicationId}`;
            }
            const title = document.createElement("h3"); title.textContent = publication.titre || "Information";
            const details = document.createElement("p");'''
    old_append='''            article.append(title, details);'''
    new_append='''            if (reference) article.append(reference);
            article.append(title, details);'''
    if s.count(old)!=1 or s.count(old_append)!=1 or 'async function lireJsonRelais(response)' not in s:
        raise SystemExit('STOP: liste Publications inconnue / relais non corrigé')
    change(f,s,s.replace(old,new,1).replace(old_append,new_append,1))

if not CHECK_ONLY:
    print('REFERENCE_UI_OK: ' + ', '.join(CHANGED or ['aucune modification, déjà cohérent']))
else:
    print('REFERENCES_A_CORRIGER: '+ ', '.join(CHANGED or ['aucune']))
