import type { Unit } from './types';
export const exportColumns:[string,string][];
export const carrierFields:string[];
export const announcementFields:string[];
export function exportDate(value:string,timeZone:string,iso?:boolean):string;
export function exportMatrix(units:Unit[],fields:string[],options?:{timeZone?:string;isoDates?:boolean;headers?:boolean;groupLoads?:boolean}):string[][];
export function matrixText(matrix:string[][],delimiter?:string):string;
export function matrixHtml(matrix:string[][],headers?:boolean):string;
export function exportFilename(name:string,kind?:string):string;
