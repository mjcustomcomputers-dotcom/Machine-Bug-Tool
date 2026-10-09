// Native-only right-click specification; no renderer IPC and no source text.
export const MPC_CONTEXT_MENU_VERSION='MPC_TEXT_CONTEXT_MENU_1';
const permittedFlags=flags=>flags&&typeof flags==='object'&&!Array.isArray(flags)?flags:{};
const hasSelection=value=>typeof value==='string'&&value.length>0;
const passwordField=value=>typeof value==='string'&&/(?:^|-)password$/iu.test(value);

/** Chromium supplies the capabilities for the actual context-clicked field.
 * Never make read-only output editable or offer copy/cut on password inputs.
 * This has no privileged operation beyond the built-in Electron edit roles. */
export function workspaceContextMenuSpec(params,{trustedOrigin=null}={}){
  if(!params||typeof params!=='object'||Array.isArray(params))return [];
  const flags=permittedFlags(params.editFlags),editable=params.isEditable===true,
    password=passwordField(params.inputFieldType)||passwordField(params.formControlType),selection=hasSelection(params.selectionText);
  const preview=typeof trustedOrigin==='string'&&/^http:\/\/127\.0\.0\.1:\d+$/u.test(trustedOrigin)&&
    params.mediaType==='image'&&typeof params.srcURL==='string'&&
    params.srcURL.startsWith(`blob:${trustedOrigin}/`);
  const canCopy=!password&&(flags.canCopy===true||(selection&&flags.canCopy!==false));
  const canCut=editable&&!password&&flags.canCut===true;
  const canPaste=editable&&flags.canPaste===true;
  const canSelectAll=flags.canSelectAll===true||editable||selection;
  const textContext=editable||selection||flags.canCopy===true||flags.canSelectAll===true;
  if(!textContext&&!preview)return [];
  const actions=[];
  if(textContext){
    if(editable)actions.push(
      {label:'Undo',role:'undo',enabled:flags.canUndo===true},
      {label:'Redo',role:'redo',enabled:flags.canRedo===true},
      {type:'separator'}
    );
    if(editable)actions.push({label:'Cut',role:'cut',enabled:canCut});
    actions.push({label:'Copy',role:'copy',enabled:canCopy});
    if(editable)actions.push({label:'Paste',role:'paste',enabled:canPaste});
    actions.push({type:'separator'},{label:'Select All',role:'selectAll',enabled:canSelectAll});
  }
  if(preview){
    if(actions.length)actions.push({type:'separator'});
    actions.push({label:'Copy preview image',command:'COPY_PREVIEW_IMAGE'});
  }
  return actions;
}
