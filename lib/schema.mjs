const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const fail=m=>{throw new Error(m)};
export function validate(v,s,path='$'){
 const types=Array.isArray(s.type)?s.type:[s.type];
 const type=v===null?'null':Array.isArray(v)?'array':typeof v==='object'?'object':typeof v;
 if(!types.includes(type)&&!(type==='number'&&Number.isSafeInteger(v)&&types.includes('integer')))fail('ARGUMENT_TYPE_MISMATCH:'+path);
 if(v===null)return;
 if(s.enum&&!s.enum.includes(v))fail('ARGUMENT_ENUM_MISMATCH:'+path);
 if(type==='string'&&([...v].length<(s.minLength??0)||[...v].length>(s.maxLength??200000)))fail('ARGUMENT_LENGTH:'+path);
 if(type==='number'&&(!Number.isFinite(v)||v<(s.minimum??-1e18)||v>(s.maximum??1e18)))fail('ARGUMENT_RANGE:'+path);
 if(type==='array'){if(v.length<(s.minItems??0)||v.length>(s.maxItems??512))fail('ARGUMENT_ARRAY_LENGTH:'+path);v.forEach((x,i)=>validate(x,s.items,path+'['+i+']'))}
 if(type==='object'){
  if(Object.keys(v).length>1024)fail('ARGUMENT_OBJECT_TOO_LARGE:'+path);
  const props=s.properties??{};
  if((s.required??[]).some(k=>!own(v,k)))fail('ARGUMENT_SHAPE_MISMATCH:'+path);
  for(const [k,x]of Object.entries(v)){if(own(props,k))validate(x,props[k],path+'.'+k);else if(s.additionalProperties===false)fail('ARGUMENT_SHAPE_MISMATCH:'+path+'.'+k);else if(typeof s.additionalProperties==='object')validate(x,s.additionalProperties,path+'.'+k)}
 }
}
