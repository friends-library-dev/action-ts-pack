module.exports=(()=>{"use strict";var e={896:(e,r,t)=>{const s=t(747);const o=t(417);const{parentPort:a}=t(13);const n={hashFile:(e,r)=>new Promise((t,a)=>{const n=o.createHash(e);s.createReadStream(r).on("error",a).pipe(n).on("error",a).on("finish",()=>{const{buffer:e}=new Uint8Array(n.read());t({value:e,transferList:[e]})})}),hash:async(e,r)=>{const t=o.createHash(e);if(Array.isArray(r)){for(const e of r){t.update(e)}}else{t.update(r)}const{buffer:s}=new Uint8Array(t.digest());return{value:s,transferList:[s]}}};a.on("message",async e=>{try{const{method:r,args:t}=e;const s=n[r];if(s===undefined){throw new Error(`Unknown method '${r}'`)}const{value:o,transferList:i}=await s(...t);a.postMessage({id:e.id,value:o},i)}catch(r){const t={message:r.message,stack:r.stack};for(const[e,s]of Object.entries(r)){if(typeof s!=="object"){t[e]=s}}a.postMessage({id:e.id,error:t})}})},417:e=>{e.exports=require("crypto")},747:e=>{e.exports=require("fs")},13:e=>{e.exports=require("worker_threads")}};var r={};function __nccwpck_require__(t){if(r[t]){return r[t].exports}var s=r[t]={exports:{}};var o=true;try{e[t](s,s.exports,__nccwpck_require__);o=false}finally{if(o)delete r[t]}return s.exports}__nccwpck_require__.ab=__dirname+"/";return __nccwpck_require__(896)})();