import { Component, OnInit, ElementRef, ViewChild, HostListener, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import * as XLSX from 'xlsx';
import { DatabaseService } from '../services/database.service';
import { SupabaseService } from '../services/supabase.service';
import { 
  MasterData, 
  UserTable, 
  MaterialRequisition as DBMaterialRequisition,
  MaterialRequisitionMaterial,
  POReceipt as DBPOReceipt 
} from '../models/database.model';

declare function saveAs(data: any, filename?: string, options?: any): void;

interface RawMaterial {
  id: string;
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

interface MaterialRequisition {
  id: string;
  requisitionNumber: string;
  type: 'perishable' | 'shelf-stable';
  category: string;
  skuCode: string;
  skuName: string;
  qtyNeeded: number;
  supplier: string;
  brand: string;
  unit: string;
  materials: RawMaterial[];
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'partially-served' | 'fully-served';
  submittedBy?: string;
  submittedDate?: Date;
  approvedBy?: string;
  approvedDate?: Date;
  reviewedBy?: string;
  reviewedDate?: Date;
  remarks?: string;
  tableId: string;
  createdAt: Date;
  updatedAt: Date;
  dateNeeded?: Date;
  poReceiptIds?: string[];
}

interface LocalUserTable {
  id: string;
  name: string;
  userId: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  submittedBy?: string;
  submittedDate?: Date;
  reviewedBy?: string;
  reviewedDate?: Date;
  approvedBy?: string;
  approvedDate?: Date;
  remarks?: string;
  itemCount: number;
  createdAt: Date;
  updatedAt: Date;
  dateNeeded?: Date;
  poReceipts?: POReceipt[];
}

interface POReceipt {
  id: string;
  tableId: string;
  requisitionId?: string;
  poNumber: string;
  supplier: string;
  amount: number;
  receiptDate: Date;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  status: 'pending' | 'verified' | 'rejected';
  verifiedBy?: string;
  verifiedDate?: Date;
  remarks?: string;
  itemCount: number;
  createdAt: Date;
  updatedAt: Date;
}

interface CutOffSchedule {
  perishable: {
    days: number[]; // 1 = Monday, 4 = Thursday
    time: string; // "10:00"
  };
  shelfStable: {
    days: number[]; // 3 = Wednesday
    time: string; // "14:00"
  };
}

@Component({
  selector: 'app-raw-material-requisition',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterModule],
  templateUrl: './raw-material-requisition.html',
  styleUrls: ['./raw-material-requisition.css']
})
export class RawMaterialRequisitionComponent implements OnInit {
  @ViewChild('masterFileInput') masterFileInput!: ElementRef;
  @ViewChild('fileInput') fileInput!: ElementRef;

  requisitionForm: FormGroup;
  filterForm: FormGroup;
  materialForm: FormGroup;

  masterData: MasterData[] = [];
  requisitionItems: MaterialRequisition[] = [];
  filteredItems: MaterialRequisition[] = [];
  categories: string[] = [];
  skus: { name: string; code: string; category: string }[] = [];
  suppliers: string[] = [];
  brands: string[] = [];
  poReceipts: POReceipt[] = [];

  uploadedFileName: string = '';
  searchQuery: string = '';
  currentPage: number = 1;
  itemsPerPage: number = 8;
  totalPages: number = 1;
  expandedRows: Set<string> = new Set();
  isExportDropdownOpen: boolean = false;
  showAddMaterialModal: boolean = false;
  selectedRequisitionId: string = '';
  showCutOffSchedule: boolean = false;
  showPOReceiptsModal: boolean = false;
  isUploading: boolean = false;
  uploadProgress: number = 0;
  isDragOver: boolean = false;

  sortField: string = '';
  sortAsc: boolean = true;

  currentUser: any;
  isAdmin: boolean = false;

  filteredMaterials: Map<string, RawMaterial[]> = new Map();
  customSupplierInput: string = '';
  showCustomSupplierField: boolean = false;
  customBrandInput: string = '';
  showCustomBrandField: boolean = false;

  userTables: LocalUserTable[] = [];
  selectedTableId: string = '';
  currentTable: LocalUserTable | null = null;
  showApprovalPanel: boolean = false;
  pendingApprovals: LocalUserTable[] = [];
  pendingApprovalsCount: number = 0;

  showSnackbar: boolean = false;
  snackbarMessage: string = '';
  snackbarType: 'success' | 'error' | 'info' | 'warning' = 'info';
  snackbarDuration: number = 4000;
  snackbarActionText: string = '';
  snackbarActionCallback?: () => void;
  private snackbarTimeout: any;

  // Cut-off schedule configuration
  cutOffSchedule: CutOffSchedule = {
    perishable: {
      days: [1, 4], // Monday and Thursday
      time: '10:00'
    },
    shelfStable: {
      days: [3], // Wednesday
      time: '14:00'
    }
  };
  
  cutOffAdjustmentHours: number = 0;
  unservedCount: number = 0;

  requisitionTypes = [
    { value: 'perishable', label: 'Perishable (Veggies, Meat)' },
    { value: 'shelf-stable', label: 'Shelf-Stable Goods' }
  ];

  statusFilters = [
    { value: '', label: 'All Status' },
    { value: 'draft', label: 'Draft' },
    { value: 'submitted', label: 'Submitted' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'partially-served', label: 'Partially Served' },
    { value: 'fully-served', label: 'Fully Served' }
  ];

  typeFilters = [
    { value: '', label: 'All Types' },
    { value: 'perishable', label: 'Perishable' },
    { value: 'shelf-stable', label: 'Shelf-Stable' }
  ];

  materialTypes = [
    { value: 'raw-material', label: 'Raw Material' },
    { value: 'packaging', label: 'Packaging' },
    { value: 'ingredient', label: 'Ingredient' },
    { value: 'chemical', label: 'Chemical' },
    { value: 'other', label: 'Other' }
  ];

  units = [
    { value: 'kg', label: 'Kilogram (kg)' },
    { value: 'g', label: 'Gram (g)' },
    { value: 'l', label: 'Liter (l)' },
    { value: 'ml', label: 'Milliliter (ml)' },
    { value: 'pcs', label: 'Pieces (pcs)' },
    { value: 'box', label: 'Box' },
    { value: 'pack', label: 'Pack' },
    { value: 'bottle', label: 'Bottle' },
    { value: 'can', label: 'Can' }
  ];

  get minDateNeeded(): string {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  }

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private dbService: DatabaseService,
    private supabaseService: SupabaseService,
    private cdRef: ChangeDetectorRef
  ) {
    this.requisitionForm = this.fb.group({
      requisitionType: ['perishable', Validators.required],
      category: ['', Validators.required],
      sku: ['', Validators.required],
      skuCode: [{ value: '', disabled: false }, Validators.required],
      qtyNeeded: [1, [Validators.required, Validators.min(1), Validators.max(999)]],
      dateNeeded: [''],
      supplier: ['', Validators.required],
      brand: ['', Validators.required],
      unit: ['', Validators.required],
      remarks: ['']
    });

    this.filterForm = this.fb.group({
      search: [''],
      status: [''],
      type: [''],
      dateFrom: [''],
      dateTo: [''],
      unservedOnly: [false]
    });

    this.materialForm = this.fb.group({
      name: ['', Validators.required],
      type: ['raw-material', Validators.required],
      quantity: [1, [Validators.required, Validators.min(0.01)]],
      unit: ['kg', Validators.required],
      requiredQty: [1, [Validators.required, Validators.min(0.01)]],
      brand: [''],
      supplier: [''],
      remarks: ['']
    });
  }

  async ngOnInit(): Promise<void> {
    const savedUser = localStorage.getItem('currentUser');
    this.currentUser = savedUser ? JSON.parse(savedUser) : null;
    this.isAdmin = this.currentUser?.role === 'admin';

    if (!this.currentUser) {
      this.router.navigate(['/login']);
      return;
    }

    await this.loadMasterDataFromDatabase();
    await this.loadSuppliersAndBrands();
    await this.loadUserTables();
    
    const lastTableId = localStorage.getItem('lastSelectedTable');
    if (lastTableId) {
      this.selectedTableId = lastTableId;
      await this.loadTableData();
    }

    this.requisitionForm.valueChanges.subscribe(value => {
      console.log('Form values:', value);
      console.log('Form valid:', this.requisitionForm.valid);
      console.log('Form errors:', this.requisitionForm.errors);
    });

    this.filterForm.valueChanges.subscribe(() => {
      this.onFilterChange();
    });

    setTimeout(() => {
      this.cdRef.detectChanges();
    }, 0);
  }

  // ========== FORM SUBMISSION ==========
  onSubmitRequisition(): void {
    this.addRequisition();
  }

  canAddRequisition(): boolean {
    if (!this.selectedTableId) return false;
    if (!this.isTableEditable()) return false;
    if (this.requisitionForm.invalid) return false;
    if (this.isPastCutOff()) return false;
    if (this.currentTable?.status === 'approved' && !this.hasPOReceipts()) return false;
    return true;
  }

  getAddButtonTooltip(): string {
    if (!this.selectedTableId) {
      return 'Please select or create a table first';
    }
    if (!this.isTableEditable()) {
      return `Table is ${this.currentTable?.status || 'not editable'}. Only draft or rejected tables can be edited.`;
    }
    if (!this.requisitionForm.valid) {
      return 'Please fill all required fields correctly';
    }
    if (this.isPastCutOff()) {
      return 'Past cut-off schedule. Requisitions will be processed next cycle.';
    }
    if (this.currentTable?.status === 'approved' && !this.hasPOReceipts()) {
      return 'No PO receipts attached. Cannot add requisitions to approved table without PO receipts.';
    }
    return 'Add requisition to table';
  }

  // ========== REQUISITION METHODS ==========
  async addRequisition(): Promise<void> {
    console.log('=== DEBUG: addRequisition validation check ===');
    
    if (!this.selectedTableId) {
      this.showSnackbarMessage('Please select or create a table first', 'error');
      
      const shouldCreate = confirm('No table selected. Would you like to create a new table?');
      if (shouldCreate) {
        await this.createNewTable();
        if (!this.selectedTableId) {
          return;
        }
      } else {
        return;
      }
    }
    
    if (!this.isTableEditable()) {
      this.showSnackbarMessage(`Cannot add items to this table. Current status: ${this.currentTable?.status}`, 'error');
      return;
    }
    
    if (this.isPastCutOff()) {
      const proceed = confirm('⚠️ Past cut-off schedule!\n\nRequisitions submitted now will be processed in the next cycle.\n\nDo you want to continue?');
      if (!proceed) return;
    }
    
    if (this.currentTable?.status === 'approved' && !this.hasPOReceipts()) {
      this.showSnackbarMessage('Cannot add requisitions to approved table without PO receipts. Please attach PO receipts first.', 'error');
      this.viewPOReceipts();
      return;
    }
    
    // Log form state for debugging
    console.log('Form validity check:');
    Object.keys(this.requisitionForm.controls).forEach(key => {
      const control = this.requisitionForm.get(key);
      console.log(`${key}:`, {
        value: control?.value,
        valid: control?.valid,
        errors: control?.errors,
        touched: control?.touched,
        dirty: control?.dirty
      });
      if (control?.invalid) {
        control.markAsTouched();
      }
    });
    
    // Check if form is valid
    this.requisitionForm.markAllAsTouched();
    
    if (this.requisitionForm.invalid) {
      // Check specific validation issues
      const errors: string[] = [];
      
      if (!this.requisitionForm.get('requisitionType')?.valid) {
        errors.push('Requisition type is required');
      }
      if (!this.requisitionForm.get('category')?.valid) {
        errors.push('Category is required');
      }
      if (!this.requisitionForm.get('sku')?.valid) {
        errors.push('SKU is required');
      }
      if (!this.requisitionForm.get('skuCode')?.valid || !this.requisitionForm.get('skuCode')?.value) {
        errors.push('SKU Code is required');
      }
      if (!this.requisitionForm.get('qtyNeeded')?.valid) {
        errors.push('Quantity must be between 1 and 999');
      }
      if (!this.requisitionForm.get('supplier')?.valid) {
        errors.push('Supplier is required');
      }
      if (!this.requisitionForm.get('brand')?.valid) {
        errors.push('Brand is required');
      }
      if (!this.requisitionForm.get('unit')?.valid) {
        errors.push('Unit is required');
      }
      
      this.showSnackbarMessage('Form has validation errors: ' + errors.join(', '), 'error');
      return;
    }

    const formValue = this.requisitionForm.value;

    // Handle custom supplier
    let finalSupplier = formValue.supplier;
    if (this.showCustomSupplierField && this.customSupplierInput.trim()) {
      finalSupplier = this.customSupplierInput.trim();
    } else if (formValue.supplier === 'Other') {
      this.showSnackbarMessage('Please enter a custom supplier when selecting "Other"', 'error');
      return;
    }

    // Handle custom brand
    let finalBrand = formValue.brand;
    if (this.showCustomBrandField && this.customBrandInput.trim()) {
      finalBrand = this.customBrandInput.trim();
    } else if (formValue.brand === 'Other') {
      this.showSnackbarMessage('Please enter a custom brand when selecting "Other"', 'error');
      return;
    }

    // Check if SKU Code is available
    if (!formValue.skuCode && formValue.sku) {
      // Try to find SKU code from the SKU name
      const selectedSku = this.skus.find(s => s.name === formValue.sku);
      if (selectedSku) {
        this.requisitionForm.get('skuCode')?.setValue(selectedSku.code);
      } else {
        this.showSnackbarMessage('SKU Code not found for the selected SKU. Please reselect the SKU.', 'error');
        return;
      }
    }

    const requisitionNumber = this.generateRequisitionNumber();
    
    const newItem: MaterialRequisition = {
      id: this.generateId(),
      requisitionNumber: requisitionNumber,
      type: formValue.requisitionType,
      category: formValue.category,
      skuCode: formValue.skuCode,
      skuName: formValue.sku,
      qtyNeeded: formValue.qtyNeeded,
      dateNeeded: formValue.dateNeeded ? new Date(formValue.dateNeeded) : undefined,
      supplier: finalSupplier,
      brand: finalBrand,
      unit: formValue.unit,
      materials: [],
      status: 'draft',
      tableId: this.selectedTableId,
      createdAt: new Date(),
      updatedAt: new Date(),
      remarks: formValue.remarks
    };

    this.requisitionItems.unshift(newItem);

    try {
      // Create requisition data for the NEW material_requisitions table
      const requisitionData = {
        requisition_number: requisitionNumber,
        type: newItem.type,
        sku_code: newItem.skuCode,
        sku_name: newItem.skuName,
        category: newItem.category,
        qty_needed: newItem.qtyNeeded,
        date_needed: newItem.dateNeeded ? newItem.dateNeeded.toISOString() : null,
        supplier: newItem.supplier,
        brand: newItem.brand,
        unit: newItem.unit,
        status: 'draft',
        user_id: this.currentUser?.id || '',
        table_id: this.selectedTableId,
        remarks: newItem.remarks,
        qty_per_unit: '1',
        qty_per_pack: '1',
        pack_unit: newItem.unit
      };

      const result = await this.dbService.createRequisition(requisitionData, []);
      
      if (result.success && result.requisitionId) {
        newItem.id = result.requisitionId;
        
        await this.dbService.updateTableItemCount(this.selectedTableId, this.requisitionItems.length);
        if (this.currentTable) {
          this.currentTable.itemCount = this.requisitionItems.length;
          this.currentTable.dateNeeded = newItem.dateNeeded;
        }
      } else {
        const index = this.requisitionItems.findIndex(item => item.id === newItem.id);
        if (index !== -1) {
          this.requisitionItems.splice(index, 1);
        }
        this.showSnackbarMessage('Error saving to database: ' + (result.error?.message || 'Unknown error'), 'error');
        return;
      }
    } catch (error: any) {
      const index = this.requisitionItems.findIndex(item => item.id === newItem.id);
      if (index !== -1) {
        this.requisitionItems.splice(index, 1);
      }
      this.showSnackbarMessage('Error saving to database: ' + (error.message || 'Unknown error'), 'error');
      return;
    }

    await this.saveTableData();
    this.updateUnservedCount();

    this.showSnackbarMessage(`Requisition ${requisitionNumber} added successfully!`, 'success');

    this.requisitionForm.reset({
      requisitionType: 'perishable',
      category: '',
      sku: '',
      skuCode: '',
      qtyNeeded: 1,
      dateNeeded: '',
      supplier: '',
      brand: '',
      unit: '',
      remarks: ''
    });

    this.showCustomSupplierField = false;
    this.showCustomBrandField = false;
    this.customSupplierInput = '';
    this.customBrandInput = '';

    this.currentPage = 1;
    this.filterAndPaginate();
  }

  // ========== DATA LOADING METHODS ==========
  private async loadMasterDataFromDatabase(): Promise<void> {
    try {
      this.masterData = await this.dbService.getMasterData();
      
      if (this.masterData.length > 0) {
        this.populateCategories();
        this.cdRef.detectChanges();
      } else {
        this.showSnackbarMessage('No master data loaded. Please upload master data first.', 'warning');
      }
    } catch (error) {
      console.error('Error loading master data from database:', error);
      this.showSnackbarMessage('Error loading master data', 'error');
    }
  }

  private async loadSuppliersAndBrands(): Promise<void> {
    try {
      const { data: suppliersData } = await this.supabaseService.getClient()
        .from('suppliers')
        .select('name')
        .order('name');

      if (suppliersData) {
        this.suppliers = suppliersData.map(s => s.name).filter(Boolean);
      } else {
        this.suppliers = [];
      }

      const { data: brandsData } = await this.supabaseService.getClient()
        .from('brands')
        .select('name')
        .order('name');

      if (brandsData) {
        this.brands = brandsData.map(b => b.name).filter(Boolean);
      } else {
        this.brands = [];
      }

      if (!this.suppliers.includes('Other')) {
        this.suppliers.push('Other');
      }
      if (!this.brands.includes('Other')) {
        this.brands.push('Other');
      }

    } catch (error) {
      console.error('Error loading suppliers and brands:', error);
      this.suppliers = ['Other'];
      this.brands = ['Other'];
    }
  }

  private async loadUserTables(): Promise<void> {
    try {
      const dbTables = await this.dbService.getUserTables(this.currentUser.id);
      this.userTables = dbTables.map(table => this.convertToLocalTable(table));
      
      await this.loadPendingApprovals();
    } catch (error) {
      console.error('Error loading user tables:', error);
      this.showSnackbarMessage('Error loading user tables', 'error');
    }
  }

  // ========== TABLE MANAGEMENT ==========
  async createNewTable(): Promise<void> {
    const tableName = prompt('Create New Table\n\nEnter table name:');
    if (!tableName?.trim()) {
      this.showSnackbarMessage('Table name is required', 'error');
      return;
    }

    try {
      const newTable = await this.dbService.createUserTable({
        name: tableName.trim(),
        user_id: this.currentUser.id,
        status: 'draft',
        item_count: 0
      });

      if (newTable.success && newTable.tableId) {
        const localTable: LocalUserTable = {
          id: newTable.tableId,
          name: tableName.trim(),
          userId: this.currentUser.id,
          status: 'draft',
          itemCount: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        this.userTables.push(localTable);
        this.selectedTableId = newTable.tableId;
        this.currentTable = localTable;
        this.requisitionItems = [];
        
        localStorage.setItem('lastSelectedTable', newTable.tableId);
        
        this.filterAndPaginate();
        this.showSnackbarMessage('Table created successfully', 'success');
        
        this.cdRef.detectChanges();
      } else {
        this.showSnackbarMessage('Failed to create table: ' + (newTable.error?.message || 'Unknown error'), 'error');
      }
    } catch (error: any) {
      console.error('Error creating table:', error);
      this.showSnackbarMessage('Failed to create table: ' + (error.message || 'Unknown error'), 'error');
    }
  }

  async loadTableData(): Promise<void> {
    if (!this.selectedTableId) {
      this.currentTable = null;
      this.requisitionItems = [];
      this.filterAndPaginate();
      return;
    }

    localStorage.setItem('lastSelectedTable', this.selectedTableId);
    
    try {
      const dbTable = await this.dbService.getTableById(this.selectedTableId);
      if (dbTable) {
        this.currentTable = this.convertToLocalTable(dbTable);
      }
      
      const requisitions = await this.dbService.getTableRequisitions(this.selectedTableId);
      
      this.requisitionItems = requisitions.map((req: DBMaterialRequisition & { materials?: any[] }) => {
        let mappedStatus: MaterialRequisition['status'] = 'draft';
        
        if (req.status === 'submitted' || req.status === 'approved' || req.status === 'rejected') {
          mappedStatus = req.status;
        } else {
          const materials = req.materials || [];
          const servedCount = materials.filter((m: any) => 
            m.status === 'fully-served' || (m.served_qty && m.served_qty >= m.required_qty)
          ).length;
          const partiallyServedCount = materials.filter((m: any) => 
            m.status === 'partially-served' || (m.served_qty && m.served_qty > 0 && m.served_qty < m.required_qty)
          ).length;
          
          if (servedCount === materials.length && materials.length > 0) {
            mappedStatus = 'fully-served';
          } else if (servedCount > 0 || partiallyServedCount > 0) {
            mappedStatus = 'partially-served';
          } else {
            mappedStatus = 'draft';
          }
        }
        
        return {
          id: req.id,
          requisitionNumber: req.requisition_number || `MR-${req.id.slice(-6)}`,
          type: req.type as 'perishable' | 'shelf-stable' || (req.category?.includes('perishable') ? 'perishable' : 'shelf-stable'),
          category: req.category || '',
          skuCode: req.sku_code || '',
          skuName: req.sku_name || '',
          qtyNeeded: req.qty_needed || 1,
          dateNeeded: req.date_needed ? new Date(req.date_needed) : undefined,
          supplier: req.supplier || '',
          brand: req.brand || '',
          unit: req.unit || 'kg',
          materials: (req.materials || []).map((mat: any) => ({
            id: mat.id || this.generateId(),
            name: mat.material_name || '',
            type: mat.type || 'raw-material',
            qty: mat.qty_per_batch || 1,
            unit: mat.unit || 'kg',
            requiredQty: mat.required_qty || 1,
            servedQty: mat.served_qty || 0,
            remarks: mat.remarks || '',
            servedDate: mat.served_date ? new Date(mat.served_date) : undefined,
            isUnserved: mat.is_unserved || false,
            brand: mat.brand || '',
            supplier: mat.supplier || '',
            status: mat.status || 'pending'
          })),
          status: mappedStatus,
          submittedBy: req.submitted_by,
          submittedDate: req.submitted_date ? new Date(req.submitted_date) : undefined,
          approvedBy: req.approved_by,
          approvedDate: req.approved_date ? new Date(req.approved_date) : undefined,
          reviewedBy: req.reviewed_by,
          reviewedDate: req.reviewed_date ? new Date(req.reviewed_date) : undefined,
          remarks: req.remarks,
          tableId: req.table_id || this.selectedTableId,
          createdAt: req.created_at ? new Date(req.created_at) : new Date(),
          updatedAt: req.updated_at ? new Date(req.updated_at) : new Date(),
          poReceiptIds: req.po_receipt_ids || []
        };
      });

      // Load PO receipts for this table
      await this.loadPOReceipts();
      this.updateUnservedCount();
      this.filterAndPaginate();
    } catch (error) {
      console.error('Error loading table data:', error);
      this.showSnackbarMessage('Failed to load table data', 'error');
    }
  }

  async loadPOReceipts(): Promise<void> {
    if (!this.selectedTableId) return;
    
    try {
      const poReceipts = await this.dbService.getPOReceiptsByTable(this.selectedTableId);
      
      this.poReceipts = poReceipts.map((receipt: DBPOReceipt) => ({
        id: receipt.id,
        tableId: receipt.table_id,
        requisitionId: receipt.requisition_id,
        poNumber: receipt.po_number,
        supplier: receipt.supplier,
        amount: receipt.amount,
        receiptDate: new Date(receipt.receipt_date),
        fileName: receipt.file_name,
        fileUrl: receipt.file_url,
        fileType: receipt.file_type,
        fileSize: receipt.file_size,
        status: receipt.status as 'pending' | 'verified' | 'rejected',
        verifiedBy: receipt.verified_by,
        verifiedDate: receipt.verified_date ? new Date(receipt.verified_date) : undefined,
        remarks: receipt.remarks,
        itemCount: receipt.item_count,
        createdAt: new Date(receipt.created_at),
        updatedAt: new Date(receipt.updated_at)
      }));
    } catch (error) {
      console.error('Error loading PO receipts:', error);
      this.poReceipts = [];
    }
  }

  isTableEditable(): boolean {
    return this.currentTable?.status === 'draft' || this.currentTable?.status === 'rejected';
  }

  isTableSubmissionAllowed(): boolean {
    return true;
  }

  // ========== CUT-OFF SCHEDULE METHODS ==========
  isPastCutOff(): boolean {
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const currentTime = now.getHours() * 60 + now.getMinutes(); // minutes since midnight
    
    // Get the selected requisition type from form
    const requisitionType = this.requisitionForm.get('requisitionType')?.value || 'perishable';
    const schedule = requisitionType === 'perishable' 
      ? this.cutOffSchedule.perishable 
      : this.cutOffSchedule.shelfStable;
    
    // Check if today is a cut-off day
    const isCutOffDay = schedule.days.includes(currentDay);
    
    if (!isCutOffDay) {
      // Find next cut-off day
      const nextCutOffDay = this.findNextCutOffDay(requisitionType);
      return nextCutOffDay < currentDay;
    }
    
    // Parse cut-off time
    const [hours, minutes] = schedule.time.split(':').map(Number);
    const cutOffTime = hours * 60 + minutes + this.cutOffAdjustmentHours * 60;
    
    return currentTime > cutOffTime;
  }

  private findNextCutOffDay(requisitionType: string): number {
    const now = new Date();
    const currentDay = now.getDay();
    const schedule = requisitionType === 'perishable' 
      ? this.cutOffSchedule.perishable 
      : this.cutOffSchedule.shelfStable;
    
    // Find next cut-off day
    const sortedDays = [...schedule.days].sort((a, b) => a - b);
    const nextDay = sortedDays.find(day => day > currentDay) || sortedDays[0];
    
    return nextDay;
  }

  getNextCutOffDate(): Date {
    const now = new Date();
    const currentDay = now.getDay();
    const requisitionType = this.requisitionForm.get('requisitionType')?.value || 'perishable';
    const schedule = requisitionType === 'perishable' 
      ? this.cutOffSchedule.perishable 
      : this.cutOffSchedule.shelfStable;
    
    const nextDay = this.findNextCutOffDay(requisitionType);
    
    // Calculate days until next cut-off
    let daysUntilNext = nextDay - currentDay;
    if (daysUntilNext <= 0) {
      daysUntilNext += 7;
    }
    
    const nextDate = new Date(now);
    nextDate.setDate(now.getDate() + daysUntilNext);
    return nextDate;
  }

  getNextCutOffTime(): string {
    const requisitionType = this.requisitionForm.get('requisitionType')?.value || 'perishable';
    const schedule = requisitionType === 'perishable' 
      ? this.cutOffSchedule.perishable 
      : this.cutOffSchedule.shelfStable;
    
    return schedule.time;
  }

  viewCutOffSchedule(): void {
    this.showCutOffSchedule = true;
  }

  closeCutOffSchedule(): void {
    this.showCutOffSchedule = false;
  }

  updateCutOffSchedule(): void {
    // In a real app, you would save this to the database
    this.showSnackbarMessage('Cut-off schedule updated successfully', 'success');
    this.closeCutOffSchedule();
  }

  // ========== PO RECEIPTS METHODS ==========
  viewPOReceipts(): void {
    if (!this.selectedTableId) {
      this.showSnackbarMessage('Please select a table first', 'error');
      return;
    }
    this.showPOReceiptsModal = true;
  }

  closePOReceiptsModal(): void {
    this.showPOReceiptsModal = false;
    this.isDragOver = false;
  }

  hasPOReceipts(): boolean {
    return this.poReceipts.length > 0;
  }

  getPOReceiptsForRequisition(requisitionId: string): POReceipt[] {
    return this.poReceipts.filter(receipt => 
      receipt.requisitionId === requisitionId || 
      !receipt.requisitionId // General receipts for the table
    );
  }

  async uploadPOReceipt(): Promise<void> {
    this.fileInput.nativeElement.click();
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
    
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.handleFiles(files);
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleFiles(input.files);
    }
  }

  async handleFiles(files: FileList): Promise<void> {
    if (!this.selectedTableId) {
      this.showSnackbarMessage('Please select a table first', 'error');
      return;
    }

    this.isUploading = true;
    this.uploadProgress = 0;
    
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Validate file
        if (!this.validateFile(file)) {
          continue;
        }
        
        // Simulate upload progress
        const progressInterval = setInterval(() => {
          this.uploadProgress += 10;
          if (this.uploadProgress >= 100) {
            clearInterval(progressInterval);
          }
          this.cdRef.detectChanges();
        }, 200);
        
        // In a real app, upload to Supabase storage
        const fileName = `po_receipt_${Date.now()}_${file.name}`;
        const fileType = file.type;
        const fileSize = file.size;
        
        // Create PO receipt record
        const poReceiptData: Partial<DBPOReceipt> = {
          table_id: this.selectedTableId,
          po_number: `PO-${Date.now().toString().slice(-6)}`,
          supplier: 'Unknown Supplier', // In real app, extract from file or form
          amount: 0, // In real app, extract from file
          receipt_date: new Date().toISOString(),
          file_name: fileName,
          file_url: '', // URL after upload
          file_type: fileType,
          file_size: fileSize,
          status: 'pending' as const,
          item_count: 0,
          remarks: ''
        };
        
        // Save to database using the DatabaseService
        const result = await this.dbService.createPOReceipt(poReceiptData);
        
        if (result.success && result.receiptId) {
          const newReceipt: POReceipt = {
            id: result.receiptId,
            tableId: this.selectedTableId,
            poNumber: poReceiptData.po_number || '',
            supplier: poReceiptData.supplier || '',
            amount: poReceiptData.amount || 0,
            receiptDate: new Date(poReceiptData.receipt_date || new Date()),
            fileName: poReceiptData.file_name || '',
            fileUrl: poReceiptData.file_url || '',
            fileType: poReceiptData.file_type || '',
            fileSize: poReceiptData.file_size || 0,
            status: 'pending',
            itemCount: poReceiptData.item_count || 0,
            remarks: poReceiptData.remarks || '',
            createdAt: new Date(),
            updatedAt: new Date()
          };
          
          this.poReceipts.unshift(newReceipt);
        } else {
          throw new Error(result.error?.message || 'Failed to create PO receipt');
        }
        
        clearInterval(progressInterval);
        this.uploadProgress = 100;
      }
      
      this.showSnackbarMessage('PO receipts uploaded successfully', 'success');
      
      // Reset after delay
      setTimeout(() => {
        this.isUploading = false;
        this.uploadProgress = 0;
        this.cdRef.detectChanges();
      }, 1000);
      
    } catch (error: any) {
      console.error('Error uploading PO receipts:', error);
      this.showSnackbarMessage('Error uploading PO receipts: ' + error.message, 'error');
      this.isUploading = false;
      this.uploadProgress = 0;
    }
  }

  private validateFile(file: File): boolean {
    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    
    if (file.size > maxSize) {
      this.showSnackbarMessage(`File ${file.name} exceeds 10MB limit`, 'error');
      return false;
    }
    
    if (!allowedTypes.includes(file.type)) {
      this.showSnackbarMessage(`File ${file.name} must be PDF, JPG, or PNG`, 'error');
      return false;
    }
    
    return true;
  }

  viewReceiptFile(receipt: POReceipt): void {
    // In a real app, open the file in a new tab or modal
    if (receipt.fileUrl) {
      window.open(receipt.fileUrl, '_blank');
    } else {
      this.showSnackbarMessage('File URL not available', 'error');
    }
  }

  downloadReceipt(receipt: POReceipt): void {
    // In a real app, trigger download
    if (receipt.fileUrl) {
      const link = document.createElement('a');
      link.href = receipt.fileUrl;
      link.download = receipt.fileName;
      link.click();
    } else {
      this.showSnackbarMessage('File URL not available', 'error');
    }
  }

  async verifyReceipt(receiptId: string): Promise<void> {
    try {
      const adminName = this.currentUser.full_name || this.currentUser.username;
      const result = await this.dbService.verifyPOReceipt(receiptId, adminName);
      
      if (result.success) {
        // Update local state
        const receipt = this.poReceipts.find(r => r.id === receiptId);
        if (receipt) {
          receipt.status = 'verified';
          receipt.verifiedBy = adminName;
          receipt.verifiedDate = new Date();
        }
        
        this.showSnackbarMessage('PO receipt verified successfully', 'success');
        this.cdRef.detectChanges();
      } else {
        throw new Error(result.error?.message || 'Failed to verify receipt');
      }
    } catch (error: any) {
      console.error('Error verifying receipt:', error);
      this.showSnackbarMessage('Error verifying receipt: ' + error.message, 'error');
    }
  }

  async deleteReceipt(receiptId: string): Promise<void> {
    if (confirm('Are you sure you want to delete this PO receipt?')) {
      try {
        const result = await this.dbService.deletePOReceipt(receiptId);
        
        if (result.success) {
          this.poReceipts = this.poReceipts.filter(r => r.id !== receiptId);
          this.showSnackbarMessage('PO receipt deleted successfully', 'success');
          this.cdRef.detectChanges();
        } else {
          throw new Error(result.error?.message || 'Failed to delete receipt');
        }
      } catch (error: any) {
        console.error('Error deleting receipt:', error);
        this.showSnackbarMessage('Error deleting receipt: ' + error.message, 'error');
      }
    }
  }

  // ========== UNSERVED MATERIALS METHODS ==========
  hasUnservedMaterials(requisition: MaterialRequisition): boolean {
    return requisition.materials.some(material => material.isUnserved);
  }

  updateUnservedCount(): void {
    this.unservedCount = this.requisitionItems.reduce((count, requisition) => {
      return count + requisition.materials.filter(m => m.isUnserved).length;
    }, 0);
  }

  isDatePastDue(date: Date): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(date);
    dueDate.setHours(0, 0, 0, 0);
    return dueDate < today;
  }

  // ========== HELPER METHODS ==========
  populateCategories(): void {
    const categoriesWithValues = this.masterData
      .map(r => r.category)
      .filter(category => category && typeof category === 'string' && category.trim())
      .map(category => category as string);

    const hasUncategorizedSkus = this.masterData.some(r => 
      !r.category || r.category.trim() === ''
    );

    this.categories = [...new Set(categoriesWithValues)].sort();
    
    if (hasUncategorizedSkus) {
      this.categories.push('Uncategorized');
    }
  }

  onCategoryChange(): void {
    const category = this.requisitionForm.get('category')?.value;

    this.skus = [];
    this.requisitionForm.get('sku')?.setValue('');
    this.requisitionForm.get('skuCode')?.setValue('');

    if (!category) return;

    const uniqueSkusMap = new Map<string, { name: string; code: string; category: string }>();
    
    this.masterData.forEach(item => {
      const matchesCategory = category === 'Uncategorized' 
        ? (!item.category || item.category.trim() === '')
        : item.category === category;
      
      if (matchesCategory && item.sku_name) {
        const code = (item.sku_code || '').toString().trim();
        const name = item.sku_name.trim();
        if (name && !uniqueSkusMap.has(name)) {
          uniqueSkusMap.set(name, { name, code, category: item.category || '' });
        }
      }
    });
    
    this.skus = Array.from(uniqueSkusMap.values())
      .sort((a, b) => a.name.localeCompare(b.name));
    
    const skuControl = this.requisitionForm.get('sku');
    if (this.skus.length > 0) {
      skuControl?.enable();
    } else {
      skuControl?.disable();
    }
  }

  onSkuChange(): void {
    const skuName = this.requisitionForm.get('sku')?.value;
    
    const selected = this.skus.find(s => s.name === skuName);
    
    if (selected) {
      this.requisitionForm.get('skuCode')?.setValue(selected.code);
    } else {
      this.requisitionForm.get('skuCode')?.setValue('');
    }
  }

  onSupplierChange(): void {
    const selectedSupplier = this.requisitionForm.get('supplier')?.value;
    this.showCustomSupplierField = selectedSupplier === 'Other';
    
    if (this.showCustomSupplierField) {
      this.customSupplierInput = '';
      this.requisitionForm.get('supplier')?.setValue('');
    }
  }

  onBrandChange(): void {
    const selectedBrand = this.requisitionForm.get('brand')?.value;
    this.showCustomBrandField = selectedBrand === 'Other';
    
    if (this.showCustomBrandField) {
      this.customBrandInput = '';
      this.requisitionForm.get('brand')?.setValue('');
    }
  }

  addCustomSupplier(): void {
    if (this.customSupplierInput.trim()) {
      const newSupplier = this.customSupplierInput.trim();
      if (!this.suppliers.includes(newSupplier)) {
        this.suppliers.unshift(newSupplier);
      }
      this.requisitionForm.get('supplier')?.setValue(newSupplier);
      this.showCustomSupplierField = false;
    }
  }

  addCustomBrand(): void {
    if (this.customBrandInput.trim()) {
      const newBrand = this.customBrandInput.trim();
      if (!this.brands.includes(newBrand)) {
        this.brands.unshift(newBrand);
      }
      this.requisitionForm.get('brand')?.setValue(newBrand);
      this.showCustomBrandField = false;
    }
  }

  // ========== REST OF THE METHODS ==========
  openAddMaterialModal(requisitionId: string): void {
    this.selectedRequisitionId = requisitionId;
    this.materialForm.reset({
      name: '',
      type: 'raw-material',
      quantity: 1,
      unit: 'kg',
      requiredQty: 1,
      brand: '',
      supplier: '',
      remarks: ''
    });
    this.showAddMaterialModal = true;
  }

  closeAddMaterialModal(): void {
    this.showAddMaterialModal = false;
    this.selectedRequisitionId = '';
  }

  addMaterial(): void {
    if (this.materialForm.invalid) {
      this.showSnackbarMessage('Please fill all required material fields', 'error');
      return;
    }

    const formValue = this.materialForm.value;
    const requisition = this.requisitionItems.find(r => r.id === this.selectedRequisitionId);
    
    if (!requisition) {
      this.showSnackbarMessage('Requisition not found', 'error');
      return;
    }

    const newMaterial: RawMaterial = {
      id: this.generateId(),
      name: formValue.name,
      type: formValue.type,
      qty: formValue.quantity,
      unit: formValue.unit,
      requiredQty: formValue.requiredQty * requisition.qtyNeeded,
      servedQty: 0,
      remarks: formValue.remarks,
      brand: formValue.brand,
      supplier: formValue.supplier,
      status: 'pending',
      isUnserved: true
    };

    requisition.materials.push(newMaterial);
    requisition.updatedAt = new Date();

    this.updateRequisitionStatus(requisition);
    this.updateUnservedCount();

    this.saveTableData();
    this.closeAddMaterialModal();
    this.showSnackbarMessage('Material added successfully', 'success');
  }

  updateMaterialServedQty(requisitionId: string, materialId: string, servedQty: number): void {
    if (!this.isTableEditable()) return;

    const requisition = this.requisitionItems.find(r => r.id === requisitionId);
    if (!requisition) return;

    const material = requisition.materials.find(m => m.id === materialId);
    if (!material) return;

    material.servedQty = Math.min(servedQty, material.requiredQty);
    material.servedDate = new Date();
    material.isUnserved = material.servedQty < material.requiredQty;
    
    if (material.servedQty === material.requiredQty) {
      material.status = 'fully-served';
    } else if (material.servedQty > 0) {
      material.status = 'partially-served';
    } else {
      material.status = 'pending';
    }

    this.updateRequisitionStatus(requisition);
    this.updateUnservedCount();

    requisition.updatedAt = new Date();
    this.saveTableData();
    this.filterAndPaginate();
  }

  private updateRequisitionStatus(requisition: MaterialRequisition): void {
    if (requisition.materials.length === 0) {
      requisition.status = 'draft';
      return;
    }

    const allMaterials = requisition.materials;
    const servedCount = allMaterials.filter(m => m.status === 'fully-served').length;
    const partiallyServedCount = allMaterials.filter(m => m.status === 'partially-served').length;
    const pendingCount = allMaterials.filter(m => m.status === 'pending').length;

    if (servedCount === allMaterials.length) {
      requisition.status = 'fully-served';
    } else if (servedCount > 0 || partiallyServedCount > 0) {
      requisition.status = 'partially-served';
    } else if (pendingCount === allMaterials.length) {
      requisition.status = requisition.status === 'approved' ? 'approved' : 'draft';
    }
  }

  deleteMaterial(requisitionId: string, materialId: string): void {
    if (!this.isTableEditable()) {
      this.showSnackbarMessage('Cannot delete materials from this requisition in its current status', 'error');
      return;
    }

    const requisition = this.requisitionItems.find(r => r.id === requisitionId);
    if (!requisition) return;

    const materialIndex = requisition.materials.findIndex(m => m.id === materialId);
    if (materialIndex === -1) return;

    requisition.materials.splice(materialIndex, 1);
    
    this.updateRequisitionStatus(requisition);
    this.updateUnservedCount();
    
    requisition.updatedAt = new Date();
    this.saveTableData();
    this.filterAndPaginate();
    this.showSnackbarMessage('Material removed', 'success');
  }

  async deleteRequisition(requisitionId: string): Promise<void> {
    if (!this.isTableEditable()) {
      this.showSnackbarMessage('Cannot delete requisition in its current status', 'error');
      return;
    }

    const index = this.requisitionItems.findIndex(r => r.id === requisitionId);
    if (index === -1) return;

    const requisition = this.requisitionItems[index];
    
    if (confirm(`Delete Requisition\n\nAre you sure you want to delete requisition ${requisition.requisitionNumber}?`)) {
      try {
        await this.dbService.deleteRequisition(requisitionId);
        this.requisitionItems.splice(index, 1);
        await this.saveTableData();
        this.updateUnservedCount();
        this.filterAndPaginate();
        this.showSnackbarMessage(`Requisition ${requisition.requisitionNumber} deleted`, 'success');
      } catch (error) {
        this.showSnackbarMessage('Error deleting requisition', 'error');
      }
    }
  }

  filterAndPaginate(): void {
    let filtered = [...this.requisitionItems];

    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(item =>
        item.requisitionNumber.toLowerCase().includes(query) ||
        item.skuCode.toLowerCase().includes(query) ||
        item.skuName.toLowerCase().includes(query) ||
        item.supplier.toLowerCase().includes(query) ||
        item.brand.toLowerCase().includes(query)
      );
    }

    const filterValue = this.filterForm.value;
    if (filterValue.status) {
      filtered = filtered.filter(item => item.status === filterValue.status);
    }
    if (filterValue.type) {
      filtered = filtered.filter(item => item.type === filterValue.type);
    }
    if (filterValue.dateFrom) {
      const dateFrom = new Date(filterValue.dateFrom);
      filtered = filtered.filter(item => new Date(item.createdAt) >= dateFrom);
    }
    if (filterValue.dateTo) {
      const dateTo = new Date(filterValue.dateTo);
      filtered = filtered.filter(item => new Date(item.createdAt) <= dateTo);
    }
    if (filterValue.unservedOnly) {
      filtered = filtered.filter(item => this.hasUnservedMaterials(item));
    }

    if (this.sortField) {
      filtered.sort((a: any, b: any) => {
        const aVal = a[this.sortField] || '';
        const bVal = b[this.sortField] || '';
        return aVal.toString().localeCompare(bVal.toString()) * (this.sortAsc ? 1 : -1);
      });
    }

    this.totalPages = Math.ceil(filtered.length / this.itemsPerPage);
    this.currentPage = Math.min(this.currentPage, this.totalPages || 1);

    const start = (this.currentPage - 1) * this.itemsPerPage;
    const end = start + this.itemsPerPage;
    this.filteredItems = filtered.slice(start, end);
    this.cdRef.detectChanges();
  }

  onFilterChange(): void {
    this.currentPage = 1;
    this.filterAndPaginate();
  }

  onSearch(): void {
    this.currentPage = 1;
    this.filterAndPaginate();
  }

  sortBy(field: string): void {
    if (this.sortField === field) {
      this.sortAsc = !this.sortAsc;
    } else {
      this.sortField = field;
      this.sortAsc = true;
    }
    this.filterAndPaginate();
  }

  changePage(direction: number): void {
    const newPage = this.currentPage + direction;
    if (newPage >= 1 && newPage <= this.totalPages) {
      this.currentPage = newPage;
      this.filterAndPaginate();
    }
  }

  toggleExportDropdown(): void {
    this.isExportDropdownOpen = !this.isExportDropdownOpen;
  }

  exportData(type: string = 'all'): void {
    this.isExportDropdownOpen = false;

    if (this.requisitionItems.length === 0) {
      this.showSnackbarMessage('No data to export.', 'error');
      return;
    }

    const data = [
      ['MATERIAL REQUISITION REPORT'],
      ['Generated', new Date().toLocaleString('en-PH')],
      ['Table', this.currentTable?.name || 'No table'],
      ['Export Type', type === 'all' ? 'All Requisitions' : type === 'perishable' ? 'Perishable Only' : 'Shelf-Stable Only'],
      [''],
      ['Req #', 'Type', 'Date Needed', 'SKU Code', 'SKU Name', 'Category', 'Qty Needed', 'Unit', 'Supplier', 'Brand', 'Status',
      'Material Name', 'Material Type', 'Quantity', 'Unit', 'Required Qty', 'Served Qty', 'Unserved',
      'Material Brand', 'Material Supplier', 'Remarks', 'Served Date', 'Created Date']
    ];

    this.requisitionItems.forEach(requisition => {
      if (type !== 'all' && requisition.type !== type) return;
      
      if (!requisition.materials?.length) {
        data.push([
          requisition.requisitionNumber,
          requisition.type,
          requisition.dateNeeded ? requisition.dateNeeded.toLocaleDateString() : 'ASAP',
          requisition.skuCode,
          requisition.skuName,
          requisition.category,
          requisition.qtyNeeded.toString(),
          requisition.unit,
          requisition.supplier,
          requisition.brand,
          requisition.status,
          '', '', '', '', '', '', '', '', '', '', requisition.createdAt.toLocaleDateString()
        ]);
        return;
      }

      requisition.materials.forEach((material, index) => {
        const row: string[] = [
          index === 0 ? requisition.requisitionNumber : '',
          index === 0 ? requisition.type : '',
          index === 0 ? (requisition.dateNeeded ? requisition.dateNeeded.toLocaleDateString() : 'ASAP') : '',
          index === 0 ? requisition.skuCode : '',
          index === 0 ? requisition.skuName : '',
          index === 0 ? requisition.category : '',
          index === 0 ? requisition.qtyNeeded.toString() : '',
          index === 0 ? requisition.unit : '',
          index === 0 ? requisition.supplier : '',
          index === 0 ? requisition.brand : '',
          index === 0 ? requisition.status : '',
          material.name,
          material.type,
          material.qty.toString(),
          material.unit,
          material.requiredQty.toString(),
          (material.servedQty || 0).toString(),
          material.isUnserved ? 'Yes' : 'No',
          material.brand || '',
          material.supplier || '',
          material.remarks || '',
          material.servedDate ? material.servedDate.toLocaleDateString() : '',
          index === 0 ? requisition.createdAt.toLocaleDateString() : ''
        ];

        data.push(row);
      });
    });

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Material Requisition');

    const fileName = `Material_Requisition_${
      type === 'all' ? 'All' : type === 'perishable' ? 'Perishable' : 'ShelfStable'
    }_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`;

    XLSX.writeFile(wb, fileName);
    this.showSnackbarMessage(`Exported successfully!`, 'success');
  }

  async clearAll(): Promise<void> {
    if (!this.selectedTableId) {
      this.showSnackbarMessage('Please select a table first', 'error');
      return;
    }
    
    if (!this.isTableEditable()) {
      this.showSnackbarMessage('Cannot clear table in its current status', 'error');
      return;
    }
    
    if (confirm('Clear Table\n\nClear all requisitions from this table? This action cannot be undone.')) {
      try {
        this.requisitionItems = [];
        this.searchQuery = '';
        this.currentPage = 1;
        this.unservedCount = 0;
        
        await this.saveTableData();
        
        this.filterAndPaginate();
        this.showSnackbarMessage('Table cleared successfully!', 'success');
      } catch (error) {
        console.error('Error clearing table:', error);
        this.showSnackbarMessage('Failed to clear table', 'error');
      }
    }
  }

  private generateRequisitionNumber(): string {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `MR-${year}${month}${day}-${random}`;
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  private showSnackbarMessage(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info', duration?: number): void {
    if (this.snackbarTimeout) {
      clearTimeout(this.snackbarTimeout);
    }
    
    this.snackbarMessage = message;
    this.snackbarType = type;
    this.snackbarDuration = duration || 4000;
    this.showSnackbar = true;
    
    this.snackbarTimeout = setTimeout(() => {
      this.hideSnackbar();
    }, this.snackbarDuration);
    
    this.cdRef.detectChanges();
  }

  hideSnackbar(): void {
    this.showSnackbar = false;
    if (this.snackbarTimeout) {
      clearTimeout(this.snackbarTimeout);
    }
    this.cdRef.detectChanges();
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'draft': return '#6c757d';
      case 'submitted': return '#007bff';
      case 'approved': return '#28a745';
      case 'rejected': return '#dc3545';
      case 'partially-served': return '#fd7e14';
      case 'fully-served': return '#20c997';
      default: return '#6c757d';
    }
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'draft': return 'fa-edit';
      case 'submitted': return 'fa-paper-plane';
      case 'approved': return 'fa-check-circle';
      case 'rejected': return 'fa-times-circle';
      case 'partially-served': return 'fa-hourglass-half';
      case 'fully-served': return 'fa-check-double';
      default: return 'fa-question-circle';
    }
  }

  getMaterialStatusColor(status: string): string {
    switch (status) {
      case 'pending': return '#6c757d';
      case 'partially-served': return '#fd7e14';
      case 'fully-served': return '#20c997';
      default: return '#6c757d';
    }
  }

  private convertToLocalTable(dbTable: UserTable): LocalUserTable {
    return {
      id: dbTable.id,
      name: dbTable.name,
      userId: dbTable.user_id,
      status: dbTable.status,
      submittedBy: dbTable.submitted_by,
      submittedDate: dbTable.submitted_date ? new Date(dbTable.submitted_date) : undefined,
      reviewedBy: dbTable.reviewed_by,
      reviewedDate: dbTable.reviewed_date ? new Date(dbTable.reviewed_date) : undefined,
      approvedBy: dbTable.approved_by,
      approvedDate: dbTable.approved_date ? new Date(dbTable.approved_date) : undefined,
      remarks: dbTable.remarks,
      itemCount: dbTable.item_count,
      createdAt: new Date(dbTable.created_at),
      updatedAt: new Date(dbTable.updated_at),
      dateNeeded: dbTable.date_needed ? new Date(dbTable.date_needed) : undefined,
      poReceipts: [] // Initialize empty array
    };
  }

  async renameTable(): Promise<void> {
    if (!this.selectedTableId || !this.currentTable) return;
    
    const newName = prompt('Rename Table\n\nEnter new table name:', this.currentTable.name);
    if (!newName?.trim() || newName === this.currentTable?.name) {
      if (!newName?.trim()) {
        this.showSnackbarMessage('Table name is required', 'error');
      }
      return;
    }

    try {
      await this.dbService.updateTableName(this.selectedTableId, newName.trim());
      this.currentTable!.name = newName.trim();
      this.currentTable!.updatedAt = new Date();
      
      const tableIndex = this.userTables.findIndex(t => t.id === this.selectedTableId);
      if (tableIndex !== -1) {
        this.userTables[tableIndex].name = newName.trim();
        this.userTables[tableIndex].updatedAt = new Date();
      }
      
      this.showSnackbarMessage('Table renamed successfully', 'success');
    } catch (error) {
      console.error('Error renaming table:', error);
      this.showSnackbarMessage('Failed to rename table', 'error');
    }
  }

  async deleteTable(): Promise<void> {
    if (!this.selectedTableId) return;
    
    if (confirm('Delete Table\n\nAre you sure you want to delete this table? All data will be lost.')) {
      try {
        await this.dbService.deleteTable(this.selectedTableId);
        
        this.userTables = this.userTables.filter(t => t.id !== this.selectedTableId);
        this.selectedTableId = '';
        this.currentTable = null;
        this.requisitionItems = [];
        this.poReceipts = [];
        this.unservedCount = 0;
        this.filterAndPaginate();
        
        localStorage.removeItem('lastSelectedTable');
        this.showSnackbarMessage('Table deleted successfully', 'success');
      } catch (error) {
        console.error('Error deleting table:', error);
        this.showSnackbarMessage('Failed to delete table', 'error');
      }
    }
  }

  async submitTableForApproval(): Promise<void> {
    if (!this.selectedTableId || !this.currentTable || !this.canSubmitTable()) return;
    
    // Additional validation before submission
    if (this.unservedCount > 0) {
      const proceed = confirm(`⚠️ There are ${this.unservedCount} unserved materials.\n\nSubmit table anyway?`);
      if (!proceed) return;
    }
    
    if (this.isPastCutOff()) {
      const proceed = confirm('⚠️ Past cut-off schedule!\n\nTable will be processed in the next cycle.\n\nSubmit anyway?');
      if (!proceed) return;
    }
    
    if (confirm('Submit Table\n\nSubmit this entire table for approval? All requisitions will be submitted.')) {
      try {
        await this.dbService.submitTableForApproval(
          this.selectedTableId,
          this.currentUser.full_name || this.currentUser.username
        );
        
        this.currentTable!.status = 'submitted';
        this.currentTable!.submittedBy = this.currentUser.full_name || this.currentUser.username;
        this.currentTable!.submittedDate = new Date();
        this.currentTable!.updatedAt = new Date();
        
        this.requisitionItems.forEach(item => {
          if (item.status === 'draft') {
            item.status = 'submitted';
            item.submittedBy = this.currentUser.full_name || this.currentUser.username;
            item.submittedDate = new Date();
          }
        });
        
        await this.saveTableData();
        await this.loadPendingApprovals();
        this.showSnackbarMessage('Table submitted for approval', 'success');
      } catch (error) {
        console.error('Error submitting table:', error);
        this.showSnackbarMessage('Failed to submit table', 'error');
      }
    }
  }

  canSubmitTable(): boolean {
    if (!this.currentTable) return false;
    if (this.currentTable.status === 'approved') return false;
    if (this.requisitionItems.length === 0) return false;
    
    // Check if all required fields are filled
    const hasIncompleteRequisitions = this.requisitionItems.some(item => {
      return !item.skuCode || !item.supplier || !item.brand || !item.unit;
    });
    
    if (hasIncompleteRequisitions) {
      this.showSnackbarMessage('Cannot submit: Some requisitions have missing required fields', 'error');
      return false;
    }
    
    return true;
  }

  async loadPendingApprovals(): Promise<void> {
    if (!this.isAdmin) {
      this.pendingApprovals = [];
      this.pendingApprovalsCount = 0;
      this.cdRef.detectChanges();
      return;
    }
    
    try {
      const dbTables = await this.dbService.getPendingApprovals();
      this.pendingApprovals = dbTables.map(table => this.convertToLocalTable(table));
      this.pendingApprovalsCount = this.pendingApprovals.length;
      this.cdRef.detectChanges();
    } catch (error) {
      console.error('Error loading pending approvals:', error);
      this.showSnackbarMessage('Error loading pending approvals', 'error');
      this.pendingApprovalsCount = 0;
    }
  }

  viewPendingApprovals(): void {
    this.showApprovalPanel = true;
  }

  closeApprovalPanel(): void {
    this.showApprovalPanel = false;
  }

  async approveTable(tableId: string): Promise<void> {
    const remarks = prompt('Approve Table\n\nEnter approval remarks (optional):');
    
    try {
      const adminName = this.currentUser.full_name || this.currentUser.username;

      await this.dbService.approveTable(tableId, adminName, remarks?.trim() || '');

      this.showSnackbarMessage('Table approved successfully', 'success');

      await this.loadPendingApprovals();
      await this.loadUserTables();

      if (this.selectedTableId === tableId) {
        await this.loadTableData();
      }

    } catch (error: any) {
      console.error('Error approving table:', error);
      this.showSnackbarMessage(`Failed to approve: ${error.message || 'Unknown error'}`, 'error');
    }
  }

  async rejectTable(tableId: string): Promise<void> {
    const remarks = prompt('Reject Table\n\nEnter rejection reason (required):');
    if (!remarks?.trim()) {
      this.showSnackbarMessage('Rejection reason is required', 'error');
      return;
    }

    try {
      const adminName = this.currentUser.full_name || this.currentUser.username;

      await this.dbService.rejectTable(tableId, adminName, remarks.trim());

      this.showSnackbarMessage('Table rejected', 'info');

      await this.loadPendingApprovals();
      await this.loadUserTables();

      if (this.selectedTableId === tableId) {
        await this.loadTableData();
      }

    } catch (error: any) {
      console.error('Error rejecting table:', error);
      this.showSnackbarMessage(`Failed to reject: ${error.message || 'Unknown error'}`, 'error');
    }
  }

  async viewTableDetails(tableId: string): Promise<void> {
    this.selectedTableId = tableId;
    await this.loadTableData();
    this.closeApprovalPanel();
  }

  private async saveTableData(): Promise<void> {
    if (!this.selectedTableId || !this.currentTable) return;
    
    try {
      await this.dbService.updateTableItemCount(this.selectedTableId, this.requisitionItems.length);
      
      this.currentTable.itemCount = this.requisitionItems.length;
      this.currentTable.updatedAt = new Date();
      
      const tableIndex = this.userTables.findIndex(t => t.id === this.selectedTableId);
      if (tableIndex !== -1) {
        this.userTables[tableIndex].itemCount = this.requisitionItems.length;
        this.userTables[tableIndex].updatedAt = new Date();
      }
    } catch (error) {
      console.error('Error saving table data:', error);
      this.showSnackbarMessage('Error saving table data', 'error');
    }
  }

  getSnackbarIcon(): string {
    switch (this.snackbarType) {
      case 'success': return 'fa-check-circle';
      case 'error': return 'fa-exclamation-circle';
      case 'warning': return 'fa-exclamation-triangle';
      case 'info': 
      default: return 'fa-info-circle';
    }
  }

  toggleRow(itemId: string): void {
    if (this.expandedRows.has(itemId)) {
      this.expandedRows.delete(itemId);
    } else {
      this.expandedRows.add(itemId);
    }
  }

  @HostListener('document:click', ['$event'])
  clickOutside(event: Event) {
    if (!(event.target as HTMLElement).closest('.export-dropdown')) {
      this.isExportDropdownOpen = false;
    }
    if (!(event.target as HTMLElement).closest('.modal-content')) {
      this.showAddMaterialModal = false;
      this.showCutOffSchedule = false;
      this.showPOReceiptsModal = false;
    }
  }
}