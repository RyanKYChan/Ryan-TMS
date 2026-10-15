import { exportDate } from '../client/src/sheet-export.js';
export const visitLabels={planned:'Planned',announced:'Announced',arrived:'At yard',completed:'Completed',cancelled:'Cancelled'};
export const visitExportColumns=[['reference','Visit'],['carrier','Carrier'],['truck','Truck plate'],['trailer','Trailer plate'],['driver','Driver'],['driver_phone','Driver phone'],['yard','Yard'],['destination','Delivery destination'],['etd','ETD'],['eta','ETA'],['atd','ATD'],['ata','ATA'],['yard_arrival_date','Yard arrival date'],['yard_arrival_time','Arrive at yard by'],['pickup_date','Pickup date'],['pickup_time','Slot start'],['slot_end','Slot end'],['container','Container / batch'],['booking_reference','Pickup reference'],['expected_units','Expected units'],['actual_units','Actual units'],['status','Status'],['notes','Comments']];
export const visitAnnouncementFields=['reference','carrier','truck','driver','yard','pickup_date'];
export function visitMatrix(visits,fields=visitExportColumns.map(([f])=>f),{includeTime=false,isoDates=false}={}){
  if(!fields.length||new Set(fields).size!==fields.length||fields.some(f=>!visitExportColumns.some(([key])=>key===f)))throw new Error('Choose unique announcement columns.');
  return [fields.map(f=>visitExportColumns.find(([key])=>key===f)[1]),...visits.map(v=>fields.map(f=>['etd','eta','atd','ata'].includes(f)?exportDate(v[f],v.time_zone||'Europe/Amsterdam',isoDates,includeTime):f==='status'?visitLabels[v.status]||v.status:String(v[f]??'')))];
}
