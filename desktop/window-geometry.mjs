// Electron workArea coordinates already use device-independent pixels (DIP).
// Fit the outer window, including its native frame, without applying scaleFactor.
export function initialWorkspaceWindowBounds(workArea){
  if(!workArea||!['x','y','width','height'].every(key=>Number.isSafeInteger(workArea[key]))||
    workArea.width<1||workArea.height<1)throw new TypeError('MPC_WORKSPACE_DISPLAY_WORK_AREA_INVALID');
  const marginX=Math.min(16,Math.floor((workArea.width-1)/2));
  const marginY=Math.min(16,Math.floor((workArea.height-1)/2));
  const width=Math.min(1440,workArea.width-2*marginX);
  const height=Math.min(940,workArea.height-2*marginY);
  return {
    x:workArea.x+Math.floor((workArea.width-width)/2),
    y:workArea.y+Math.floor((workArea.height-height)/2),
    width,height,
    minWidth:Math.min(980,width),
    minHeight:Math.min(680,height),
  };
}
