export type PastedTruck={truck:string;trailer:string;driver:string;driver_phone:string;line:number};
export function parseTruckPaste(input:string,today:string):{rows:PastedTruck[];notes:string;unparsed:{line:number;text:string}[];warnings:string[];arrival:{date:string;time:string}|null};
