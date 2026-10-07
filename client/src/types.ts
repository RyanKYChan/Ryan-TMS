export type Stage = 'unscheduled' | 'scheduled' | 'ready' | 'in_transit' | 'delivered';
export type Project = { id:string; name:string; customer:string; target:number; estimated_target:number; imported_count:number; volume_mode:'estimate'|'packing_list'; created_at:string;cost_basis:'unit'|'load';revenue_basis:'unit'|'load';unit_cost:string;load_cost:string;unit_revenue:string;load_revenue:string };
export type Unit = {
  id:string; project_id:string; vin:string; brand:string; model:string; reference:string; source_status:string;
  notes:string; pol_country:string; origin:string; pol_zipcode:string; pol_address:string;
  pod_country:string; destination:string; pod_zipcode:string; pod_address:string; dealer:string;
  etd:string; eta:string; atd:string; ata:string; carrier:string; truck:string; price:string; revenue:string; t1:string;
  packing_list_id:string; packing_list:string; load_id:string|null; load_ref:string|null; status:Stage;
  created_at:string; updated_at:string; import_order:number;
};
export type Load = {id:string;project_id:string;reference:string;carrier:string;truck:string;driver:string;capacity:number;origin:string;destination:string;etd:string;eta:string;notes:string;cost:string;revenue:string;created_at:string};
export type PackingList = {id:string;name:string;created_at:string};
export type Event = {id:string;unit_id:string|null;description:string;created_at:string};
export type Carrier = {id:string;project_id:string;name:string;created_at:string;last_update:string|null};
export type CarrierUpdate = {id:string;carrier_id:string;row_count:number;changed_count:number;loads_created:number;created_at:string};
export type Workspace = {project:Project;units:Unit[];loads:Load[];packingLists:PackingList[];events:Event[];scheduleAlerts:ScheduleAlert[];carriers:Carrier[];carrierUpdates:CarrierUpdate[]};

export type ScheduleAlert={id:string;carrier:string;unit_id:string;vin:string;load_id:string|null;load_reference:string;field:string;before_value:string;after_value:string;delta_minutes:number;created_at:string;resolved_at:string};
