'use strict';
/** Port OCR local. Aucun appel réseau, aucun enregistrement de texte brut, durée et taille bornées. */
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
function createMacVisionOCR({binary=path.join(os.homedir(),'.sateer-recette','energy-mvp02a2','vision-ocr'),timeoutMs=22000}={}){
 return Object.freeze({
  async recognize(bytes,mime){
   if(process.platform!=='darwin')throw Object.assign(Error('MOTEUR_REQUIERT_MACOS'),{code:'MOTEUR_OCR_INDISPONIBLE'});
   if(!Buffer.isBuffer(bytes)||bytes.length>3*1024*1024||!['image/png','image/webp'].includes(mime))throw Error('PHOTO_NON_ADMISE');
   const s=fs.lstatSync(binary);
   if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o022)!==0||(s.mode&0o111)===0)throw Error('OCR_BINAIRE_NON_SECURISÉ');
   return new Promise((resolve,reject)=>{
    const child=spawn(binary,[],{stdio:['pipe','pipe','pipe'],env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin'},windowsHide:true});
    let out='',errLen=0,finished=false;
    const timer=setTimeout(()=>child.kill('SIGKILL'),timeoutMs);
    function settle(e,v){if(finished)return;finished=true;clearTimeout(timer);if(e)reject(e);else resolve(v);}
    child.on('error',()=>settle(Error('OCR_PROCESSUS_INDISPONIBLE')));
    child.stdout.on('data',chunk=>{out+=chunk.toString('utf8');if(out.length>25000)child.kill('SIGKILL');});
    child.stderr.on('data',chunk=>{errLen+=chunk.length;if(errLen>4096)child.kill('SIGKILL');});
    child.on('close',code=>{if(code!==0)return settle(Error('OCR_ECHEC_LOCAL'));
      try{const data=JSON.parse(out);if(!Array.isArray(data.lines)||data.lines.length>60||data.lines.some(x=>typeof x!=='string'||x.length>250))throw Error();settle(null,data.lines);}catch(_){settle(Error('OCR_SORTIE_INVALIDE'));}
    });
    child.stdin.on('error',()=>{});child.stdin.end(bytes);
   });
  }
 });
}
module.exports={createMacVisionOCR};
