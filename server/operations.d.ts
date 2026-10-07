import type { Load, Unit, Stage } from '../client/src/types';
export function loadStatus(load:Load,units:Unit[]):Stage;
export function operationalLoads(loads:Load[],units:Unit[]):Load[];
export function scheduleChanges(old:Unit,update:Partial<Unit>):{field:string;before:string;after:string;deltaMinutes:number}[];
