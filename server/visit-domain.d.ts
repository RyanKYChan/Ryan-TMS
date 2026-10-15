import type { TruckVisit, VisitStatus } from '../client/src/types';
export const visitLabels:Record<VisitStatus,string>;
export const visitExportColumns:[string,string][];
export const visitAnnouncementFields:string[];
export function visitMatrix(visits:TruckVisit[],fields?:string[],options?:{includeTime?:boolean;isoDates?:boolean}):string[][];
