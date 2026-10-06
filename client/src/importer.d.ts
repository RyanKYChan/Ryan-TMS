export const columns: [string,string][];
export type Grid = {headers:string[];mapping:string[];rows:string[][];hasHeaders:boolean};
export type ImportPreview = {unit:Record<string,string>;errors:string[];index:number;existing:boolean};
export function parseGrid(raw:string):string[][];
export function inspectGrid(raw:string):Grid;
export function parseDate(value:string,order?:string):string;
export function parsePrice(value:string):string;
export function previewRows(grid:string[][],mapping:string[],existing?:{vin:string}[],order?:string):ImportPreview[];
