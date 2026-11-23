'use strict';
/** Moteur réel Apple Vision, image synthétique uniquement. Aucune écriture. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createMacVisionOCR}=require('../../energy/equipment-label-vision');
const {candidate}=require('../../energy/energy-meter-photo-domain');
(async()=>{
 const bytes=fs.readFileSync(path.join(__dirname,'../../fixtures/afficheur-synthetique-emeter2.png'));
 const lines=await createMacVisionOCR().recognize(bytes,'image/png');
 const c=candidate(lines,'KWH');
 assert.equal(c.statut,'OCR_INDEX_A_CONFIRMER','PAS_DE_SUGGESTION_SUR_PHOTO_SYNTHETIQUE');
 assert.equal(c.valeurProposee,'12345.67','INDEX_SYNTHETIQUE_INCORRECT');
 console.log('PASS | Apple Vision reconnait l index synthétique, sans écriture : 12345.67 KWH');
})().catch(e=>{console.error('STOP | OCR_REEL_SYNTHETIQUE : '+(e.code||e.message));process.exitCode=1;});
