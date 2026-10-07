import type { Load, Unit, Project } from '../client/src/types';
type Totals={cost:number;revenue:number;margin:number;missingCost:number;missingRevenue:number};
export function cents(value:string|undefined|null):number|null;
export function financeReport(project:Project,loads:Load[],units:Unit[]):{rows:(Totals & {id:string|null;reference:string;carrier:string;load:Load|null;units:Unit[]})[];totals:Totals;unbuilt:number};
