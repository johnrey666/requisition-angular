export interface User {
  id: string;
  email: string;
  username: string;
  role: 'admin' | 'user';
  full_name?: string;
  created_at: string;
}

export interface MasterData {
  id: string;
  category: string;
  sku_code: string;
  sku_name: string;
  quantity_per_unit: string;
  unit: string;
  quantity_per_pack: string;
  pack_unit: string;
  raw_material: string;
  quantity_per_batch: string;
  batch_unit: string;
  type: string;
  created_at: string;
  updated_at: string;
}

export interface Requisition {
  id: string;
  sku_code: string;
  sku_name: string;
  category: string;
  qty_needed: number;
  supplier: string;
  qty_per_unit: string;
  unit: string;
  qty_per_pack: string;
  pack_unit: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  submitted_by?: string;
  submitted_date?: string;
  reviewed_by?: string;
  reviewed_date?: string;
  approver?: string;
  approved_date?: string;
  remarks?: string;
  user_id: string;
  table_id?: string;
  created_at: string;
  updated_at: string;
  date_needed?: string; // Added
  brand?: string; // Added
  po_receipt_ids?: string[]; // Added
}

export interface RequisitionMaterial {
  id: string;
  requisition_id: string;
  material_name: string;
  qty_per_batch: number;
  unit: string;
  type: string;
  required_qty: number;
  served_qty?: number;
  remarks?: string;
  served_date?: string;
  is_unserved?: boolean;
  created_at: string;
  brand?: string; // Added
  supplier?: string; // Added
  status?: 'pending' | 'partially-served' | 'fully-served'; // Added
}

export interface UserTable {
  id: string;
  name: string;
  user_id: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  submitted_by?: string;
  submitted_date?: string;
  reviewed_by?: string;
  reviewed_date?: string;
  approved_by?: string;
  approved_date?: string;
  remarks?: string;
  item_count: number;
  created_at: string;
  updated_at: string;
  date_needed?: string; // Added
}

export interface POReceipt {
  id: string;
  table_id: string;
  requisition_id?: string;
  po_number: string;
  supplier: string;
  amount: number;
  receipt_date: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
  status: 'pending' | 'verified' | 'rejected';
  verified_by?: string;
  verified_date?: string;
  remarks?: string;
  item_count: number;
  created_at: string;
  updated_at: string;
}

// Raw material interface for dashboard
export interface RawMaterial {
  name: string;
  qty: number;
  unit: string;
  type: string;
  requiredQty: number;
  servedQty?: number;
  remarks?: string;
  servedDate?: Date;
  isUnserved?: boolean;
  brand?: string;
  supplier?: string;
  status?: 'pending' | 'partially-served' | 'fully-served';
}

// Add interface for dashboard items
export interface DashboardRequisition {
  id: string;
  skuCode: string;
  skuName: string;
  category: string;
  qtyNeeded: number;
  supplier: string;
  qtyPerUnit: string;
  unit: string;
  qtyPerPack: string;
  unit2: string;
  materials: RawMaterial[];
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  submittedBy?: string;
  submittedDate?: Date;
  reviewedBy?: string;
  reviewedDate?: Date;
  approvedBy?: string;
  approvedDate?: Date;
  remarks?: string;
  tableId?: string;
  dateNeeded?: Date; // Added
  brand?: string; // Added
}

// New material requisition interface
export interface MaterialRequisition {
  id: string;
  requisition_number: string;
  type: 'perishable' | 'shelf-stable';
  sku_code: string;
  sku_name: string;
  category: string;
  qty_needed: number;
  supplier: string;
  brand: string;
  unit: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'partially-served' | 'fully-served';
  submitted_by?: string;
  submitted_date?: string;
  approved_by?: string;
  approved_date?: string;
  reviewed_by?: string;
  reviewed_date?: string;
  remarks?: string;
  user_id: string;
  table_id: string;
  created_at: string;
  updated_at: string;
  date_needed?: string; // Added
  po_receipt_ids?: string[]; // Added
}

// New material requisition materials interface
export interface MaterialRequisitionMaterial {
  id: string;
  requisition_id: string;
  material_name: string;
  type: string;
  qty_per_batch: number;
  unit: string;
  required_qty: number;
  served_qty?: number;
  remarks?: string;
  served_date?: string;
  is_unserved?: boolean;
  brand?: string;
  supplier?: string;
  status: 'pending' | 'partially-served' | 'fully-served';
  created_at: string;
  updated_at: string;
}