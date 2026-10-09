import manual from '../lib/field-manual.json';

function Inline({text}:{text:string}) {
  return <>{text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part,i)=>
    part.startsWith('**')&&part.endsWith('**')?<strong key={i}>{part.slice(2,-2)}</strong>:
    part.startsWith('`')&&part.endsWith('`')?<code key={i} style={{overflowWrap:'anywhere',background:'#eeeeee',color:'#171717',padding:'2px 4px',borderRadius:4}}>{part.slice(1,-1)}</code>:
    <span key={i}>{part}</span>)}</>;
}
export default function FieldManual({content=manual.text,sectionId="field-manual",downloadPath="/mpc-field-manual.md",label="Complete business-logic field manual"}:{content?:string,sectionId?:string,downloadPath?:string,label?:string}={}){
  return <section id={sectionId} aria-label={label} style={{marginTop:64,borderTop:'2px solid #888',paddingTop:32,overflowWrap:'anywhere'}}>
    <p><a href={downloadPath} download>Download the complete original text</a></p>
    {content.split(/(```[\s\S]*?```)/g).flatMap(part=>part.startsWith('```')?[part]:part.split(/\n\s*\n/)).map((block,i)=>{
      if(block.startsWith('```'))return <pre key={i} style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',background:'#f1f1f1',color:'#171717',padding:16,borderRadius:6}}><code>{block.slice(block.indexOf('\n')+1,-3)}</code></pre>;
      if(block.trim()==='---')return <hr key={i} style={{margin:'32px 0'}}/>;
      const lines=block.split('\n');
      if(lines.every(line=>/^#{1,6} /.test(line)))return <div key={i}>{lines.map((line,j)=>{
        const match=line.match(/^(#{1,6}) (.*)$/)!;
        return match[1].length<=2?<h2 key={j} style={{fontSize:24,fontWeight:700,margin:'28px 0 16px'}}><Inline text={match[2]}/></h2>:<h3 key={j} style={{fontSize:20,fontWeight:650,margin:'24px 0 12px'}}><Inline text={match[2]}/></h3>;
      })}</div>;
      return <p key={i} style={{whiteSpace:'pre-wrap',margin:'14px 0',lineHeight:1.7}}><Inline text={block}/></p>;
    })}
  </section>;
}
