const clean=(value)=>String(value??'').trim();
const lower=(value)=>clean(value).toLowerCase();
const uniq=(values)=>[...new Set(values.filter(Boolean))];

export function normalizeReferenceCatalog(value){
  const list=Array.isArray(value)?value:[];
  return list.map((item,index)=>{
    if(!item||typeof item!=='object')return null;
    const uri=clean(item.uri??item.referenceUri);
    if(!uri)return null;
    const rawKind=lower(item.kind);
    const kind=rawKind==='character'||rawKind==='style'?rawKind:'generic';
    return{
      kind,
      key:clean(item.key)||`${kind}-${index+1}`,
      name:clean(item.name),
      role:clean(item.role),
      continuityKey:clean(item.continuityKey),
      uri,
    };
  }).filter(Boolean);
}

function promptMatches(prompt,item){
  const haystack=lower(prompt);
  if(!haystack)return false;
  const candidates=[item.name,item.key].map(lower).filter((value)=>value.length>=3);
  return candidates.some((value)=>haystack.includes(value));
}

function protagonistScore(item){
  const role=lower(item.role);
  if(/protagonist|main|lead|host|narrator|hero/.test(role))return 3;
  if(role)return 1;
  return 0;
}

export function selectSceneReferences(contextValue,prompt,inputReferenceUris=[],limit=3){
  const context=contextValue&&typeof contextValue==='object'?contextValue:{};
  const max=Math.max(1,Math.min(3,Number(limit)||3));
  const catalog=normalizeReferenceCatalog(context.referenceCatalog??context.visualReferences);
  const characters=catalog.filter((item)=>item.kind==='character');
  const styles=catalog.filter((item)=>item.kind==='style');
  const matched=characters.filter((item)=>promptMatches(prompt,item));
  const fallbackCharacter=[...characters].sort((a,b)=>protagonistScore(b)-protagonistScore(a))[0]??null;
  const selected=[];
  const push=(item)=>{if(item&&selected.length<max&&!selected.some((candidate)=>candidate.uri===item.uri))selected.push(item);};

  for(const item of matched.slice(0,2))push(item);
  if(!matched.length&&characters.length===1)push(characters[0]);
  else if(!matched.length&&fallbackCharacter)push(fallbackCharacter);

  for(const uri of uniq((Array.isArray(inputReferenceUris)?inputReferenceUris:[]).map(clean))){
    push(catalog.find((item)=>item.uri===uri)??{kind:'generic',key:'input',name:'',role:'',continuityKey:'',uri});
  }

  if(styles.length)push(styles[0]);
  for(const item of catalog)push(item);

  const fallbackUris=uniq((Array.isArray(context.referenceUris)?context.referenceUris:[]).map(clean));
  for(const uri of fallbackUris)push(catalog.find((item)=>item.uri===uri)??{kind:'generic',key:'fallback',name:'',role:'',continuityKey:'',uri});

  return{
    uris:selected.map((item)=>item.uri),
    keys:selected.map((item)=>item.key),
    characterNames:selected.filter((item)=>item.kind==='character').map((item)=>item.name).filter(Boolean),
    styleKeys:selected.filter((item)=>item.kind==='style').map((item)=>item.key),
    matchedCharacterNames:matched.map((item)=>item.name).filter(Boolean),
    catalogSize:catalog.length,
  };
}
