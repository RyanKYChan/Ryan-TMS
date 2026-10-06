import type { Grid, ImportPreview } from './importer.js';
export type CarrierGrid=Grid&{groups:string[];hasGaps:boolean};
export function inspectCarrierGrid(raw:string,options?:{headerMode?:string;savedMappings?:Record<string,string>}):CarrierGrid;
export function previewCarrierRows(grid:CarrierGrid,mapping:string[],units:{vin:string;carrier:string}[],carrier:string,order?:string,groupLoads?:boolean):(ImportPreview&{group:string;loadReference:string})[];
