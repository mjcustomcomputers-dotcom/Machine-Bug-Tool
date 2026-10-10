// Keep a visible user choice separate from the host's time-bounded capture consent.
// The native host independently checks exact IDs and the current project.
export const SCREEN_SOURCE_REFRESH_AFTER_MS=285_000;
export function screenSourceStartGate({sourceIds,selectedId,consent,listedAt,now}={}){
  if(!Array.isArray(sourceIds)||sourceIds.length===0)return {allowed:false,code:'SCREEN_CHOOSE_SOURCE'};
  if(typeof listedAt!=='number'||!Number.isFinite(listedAt)||listedAt<=0||
    typeof now!=='number'||!Number.isFinite(now)||now<listedAt||
    now-listedAt>=SCREEN_SOURCE_REFRESH_AFTER_MS)return {allowed:false,code:'SCREEN_REFRESH_SOURCE_LIST'};
  if(typeof selectedId!=='string'||!selectedId||!sourceIds.includes(selectedId))
    return {allowed:false,code:'SCREEN_CHOOSE_SOURCE'};
  if(consent!==true)return {allowed:false,code:'SCREEN_PERMISSION_REQUIRED'};
  return {allowed:true,code:null};
}
