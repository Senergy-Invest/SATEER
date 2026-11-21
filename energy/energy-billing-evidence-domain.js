'use strict';
/** E-METER-1B2 : octets opaques non interpretes (ni OCR ni PDF renderer). */
const {formatImage}=require('./equipment-photo-vault');
const MAX_BYTES=5*1024*1024;
function formatEvidence(buffer){
 if(!Buffer.isBuffer(buffer)||buffer.length<64||buffer.length>MAX_BYTES)return null;
 if(formatImage(buffer)==='image/png')return 'image/png';
 if(buffer.subarray(0,5).toString('ascii')==='%PDF-' &&
    /^%PDF-1\.[0-7]/.test(buffer.subarray(0,8).toString('ascii')) &&
    buffer.subarray(Math.max(0,buffer.length-1024)).includes(Buffer.from('%%EOF'))){
  return 'application/pdf';
 }
 return null;
}
function sanitizeName(value,mime){
 const fallback=mime==='application/pdf'?'justificatif.pdf':'justificatif.png';
 if(typeof value!=='string'||value.length>300)return fallback;
 let decoded;try{decoded=decodeURIComponent(value);}catch{decoded=value;}
 const clean=decoded.replace(/[\\/\x00-\x1f\x7f<>"'`]/g,'_').replace(/^\.+/,'').trim().slice(0,100);
 if(!clean)return fallback;
 const suffix=mime==='application/pdf'?'.pdf':'.png';
 return clean.toLowerCase().endsWith(suffix)?clean:clean.replace(/\.[A-Za-z0-9]{1,8}$/,'')+suffix;
}
module.exports={formatEvidence,sanitizeName,MAX_BYTES};
