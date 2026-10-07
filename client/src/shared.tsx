import { Children, cloneElement, isValidElement, useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { X, ArrowUpRight } from 'lucide-react';
import type { Stage } from './types';
export const stageLabels:Record<Stage,string>={unscheduled:'Unscheduled',scheduled:'Scheduled',ready:'Ready to go',in_transit:'In transit',delivered:'Delivered'};
export const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone;
export function formatDate(s:string,withTime=false){return s?new Date(s).toLocaleString('en-GB',{day:'2-digit',month:'short',...(withTime?{hour:'2-digit',minute:'2-digit'}:{})}):'—';}
export function toInput(s:string){if(!s)return '';const d=new Date(s);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
export function toIso(s:string){return s?new Date(s).toISOString():'';}
export async function api<T=unknown>(url:string,method='GET',body?:unknown):Promise<T>{
  const res=await fetch(url,{method,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await res.json();if(!res.ok)throw new Error(data.error||'Request failed.');return data;
}
export function Badge({stage}:{stage:Stage}){return <span className={`badge ${stage}`}><i/>{stageLabels[stage]}</span>;}
export function Modal({title,subtitle,onClose,children,wide=false,drawer=false}:{title:string;subtitle?:string;onClose:()=>void;children:ReactNode;wide?:boolean;drawer?:boolean}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const d=ref.current;d?.showModal();return()=>d?.close();},[]);
  return <dialog ref={ref} className={`modal ${wide?'wide':''} ${drawer?'drawer':''}`} onCancel={e=>{e.preventDefault();onClose();}}>
    <div className="modal-heading"><div><div className="eyebrow">RYAN / OPERATIONS</div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={20}/></button></div>
    {children}
  </dialog>;
}
export function Field({label,children}:{label:string;children:ReactNode}){
  const id=useId();
  function link(nodes:ReactNode):ReactNode{
    return Children.map(nodes,node=>{
      if(!isValidElement<{children?:ReactNode;id?:string;'aria-labelledby'?:string}>(node))return node;
      if(['input','select','textarea'].includes(String(node.type)))return cloneElement(node,{id,'aria-labelledby':`${id}-label`});
      if(typeof node.type==='function')return cloneElement(node,{id,'aria-labelledby':`${id}-label`});
      if(node.props.children)return cloneElement(node,{},link(node.props.children));return node;
    });
  }
  return <div className="field"><label id={`${id}-label`} htmlFor={id}>{label}</label>{link(children)}</div>;
}
export function Empty({icon,heading,body,action,onAction}:{icon:ReactNode;heading:string;body:string;action?:string;onAction?:()=>void}){
  return <div className="empty"><div className="empty-icon">{icon}</div><h3>{heading}</h3><p>{body}</p>{action&&<button className="primary" onClick={onAction}>{action}<ArrowUpRight size={16}/></button>}</div>;
}
