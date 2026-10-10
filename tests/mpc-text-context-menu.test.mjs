import assert from 'node:assert/strict';
import test from 'node:test';
import {workspaceContextMenuSpec,MPC_CONTEXT_MENU_VERSION} from '../desktop/text-context-menu.mjs';
const origin='http://127.0.0.1:54545';
const menu=(params,opts)=>workspaceContextMenuSpec(params,opts);
const item=(rows,role)=>rows.find(row=>row.role===role);

test('native right-click menu includes Cut, Copy, Paste, Select All for editable chat and evidence',()=>{
  const rows=menu({isEditable:true,inputFieldType:'plainText',selectionText:'some text',editFlags:{
    canUndo:true,canRedo:false,canCut:true,canCopy:true,canPaste:true,canSelectAll:true}});
  assert.equal(MPC_CONTEXT_MENU_VERSION,'MPC_TEXT_CONTEXT_MENU_1');
  assert.deepEqual(rows.filter(row=>row.role).map(row=>row.role),['undo','redo','cut','copy','paste','selectAll']);
  assert.equal(item(rows,'copy').enabled,true);
  assert.equal(item(rows,'paste').enabled,true);
  assert.equal(item(rows,'redo').enabled,false);
  assert.equal(rows.some(row=>row.click),false,'native copy and paste roles use no raw text payload');
});

test('read-only OCR and large output support selecting and copying but never modifying their content',()=>{
  for(const selected of ['', 'Selected OCR text']){
    const rows=menu({isEditable:false,selectionText:selected,editFlags:{
      canCopy:!!selected,canPaste:true,canCut:true,canSelectAll:true}});
    assert.deepEqual(rows.filter(row=>row.role).map(row=>row.role),['copy','selectAll']);
    assert.equal(item(rows,'copy').enabled,!!selected);
    assert.equal(item(rows,'selectAll').enabled,true);
    assert.equal(rows.some(row=>row.role==='paste'||row.role==='cut'),false);
  }
});

test('clipboard operations honor Chromium edit permissions; password and blank views are contained',()=>{
  const restricted=menu({isEditable:true,inputFieldType:'password',selectionText:'never-copy-a-password',
    editFlags:{canCut:true,canCopy:true,canPaste:true,canSelectAll:true}});
  assert.equal(item(restricted,'copy').enabled,false);
  assert.equal(item(restricted,'cut').enabled,false);
  assert.equal(item(restricted,'paste').enabled,true);
  const typedPassword=menu({isEditable:true,formControlType:'input-password',selectionText:'password',editFlags:{canCopy:true,canCut:true,canPaste:true}});
  assert.equal(item(typedPassword,'copy').enabled,false);
  assert.equal(item(typedPassword,'cut').enabled,false);
  assert.equal(item(menu({isEditable:true,editFlags:{canPaste:false,canCopy:false}}),'paste').enabled,false);
  assert.deepEqual(menu({isEditable:false,editFlags:{canSelectAll:false}}),[]);
  assert.deepEqual(menu(null),[]);
});

test('only a masked/local blob image context may offer a direct preview copy',()=>{
  const base={isEditable:false,mediaType:'image',editFlags:{},selectionText:''};
  const local=menu({...base,srcURL:`blob:${origin}/aaa-123`},{trustedOrigin:origin});
  assert.deepEqual(local,[{label:'Copy preview image',command:'COPY_PREVIEW_IMAGE'}]);
  for(const srcURL of ['https://example.com/img.png','blob:https://remote.example/abc',
    `blob:${origin}.evil/abc`, `data:image/png;base64,AABB`]){
    assert.deepEqual(menu({...base,srcURL},{trustedOrigin:origin}),[]);
  }
  assert.deepEqual(menu({...base,srcURL:`blob:${origin}/abc`},{trustedOrigin:'https://example.com'}),[]);
});
