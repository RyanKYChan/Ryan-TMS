import type { Unit, Load, Stage } from './types';
export const packingStages:Stage[];
export const priorityRank:Record<'normal'|'high'|'urgent',number>;
export function packingProgress(listId:string,units:Unit[],loads:Load[],now?:number):{
  units:Unit[];counts:Record<Stage,number>;queues:Record<'noCarrier'|'noLoad'|'noEtd'|'pickupDue'|'overdue'|'missingActual'|'noRoute',Unit[]>;
  carriers:{name:string;units:Unit[];counts:Record<Stage,number>}[];
  loads:{load:Load;units:Unit[];totalAssigned:number}[];
  schedule:{field:'etd'|'eta';date:string;loadRef:string;units:Unit[]}[];
  actuals:{field:'atd'|'ata';date:string;unit:Unit}[];
  total:number;pending:number;departed:number;arrived:number;deliveredPercent:number;noMovement:boolean;
};
