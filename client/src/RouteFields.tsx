import { useId } from 'react';
import { Field } from './shared';
import type { Unit } from './types';

export const routeFields:[string,string][]=[
  ['pol_country','POL country'],['origin','POL city'],['pol_zipcode','POL postcode'],['pol_address','POL address'],
  ['pod_country','POD country'],['destination','POD city'],['pod_zipcode','POD postcode'],['pod_address','POD address'],
];
export function SuggestedInput({field,value,onChange,units,placeholder='',id,'aria-labelledby':labelledBy}:{field:string;value:string;onChange:(value:string)=>void;units:Unit[];placeholder?:string;id?:string;'aria-labelledby'?:string}){
  const generated=useId(),suggestionId=`${id||generated}-suggestions`;
  const suggestions=[...new Set(units.map(u=>String(u[field as keyof Unit]||'')).filter(Boolean))].sort();
  return <><input id={id} aria-labelledby={labelledBy} value={value} onChange={e=>onChange(e.target.value)} maxLength={500} list={suggestionId} placeholder={placeholder}/><datalist id={suggestionId}>{suggestions.slice(0,200).map(v=><option key={v} value={v}/>)}</datalist></>;
}
export function SharedRouteFields({values,onChange,units}:{values:Record<string,string>;onChange:(field:string,value:string)=>void;units:Unit[]}){
  return <div className="form-grid">{routeFields.map(([field,label])=><Field key={field} label={label}><SuggestedInput field={field} value={values[field]||''} onChange={v=>onChange(field,v)} units={units} placeholder="Fill missing cells only"/></Field>)}</div>;
}
