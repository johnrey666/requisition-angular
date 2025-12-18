import { Component, OnInit, ElementRef, ViewChild, HostListener, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import * as XLSX from 'xlsx';
import { DatabaseService } from '../services/database.service';
import { SupabaseService } from '../services/supabase.service';
import { MasterData, DashboardRequisition, UserTable } from '../models/database.model';

declare function saveAs(data: any, filename?: string, options?: any): void;

interface RawMaterial {
  name: string;
  qty: number;
  unit: string;
  type: string;
  requiredQty: number;
  servedQty?: number;
  remarks?: string;
  servedDate?: Date;
  isUnserved?: boolean;
}

interface CutoffSchedule {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  days: number[];
  isActive: boolean;
}

// Snackbar configuration interface
interface SnackbarConfig {
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
  actionText?: string;
  actionCallback?: () => void;
}

// Local UserTable interface that maps database fields to component fields
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
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterModule],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.css']
})
export class DashboardComponent implements OnInit {
  @ViewChild('masterFileInput') masterFileInput!: ElementRef;
  @ViewChild('skuDropdown') skuDropdown!: ElementRef; // Add reference to SKU dropdown

  requisitionForm: FormGroup;

  masterData: MasterData[] = [];
  requisitionItems: DashboardRequisition[] = [];
  filteredItems: DashboardRequisition[] = [];
  categories: string[] = [];
  skus: { name: string; code: string }[] = [];

  uploadedFileName: string = '';
  searchQuery: string = '';
  currentPage: number = 1;
  itemsPerPage: number = 8;
  totalPages: number = 1;
  expandedRows: Set<string> = new Set();
  darkMode: boolean = false;
  isExportDropdownOpen: boolean = false;

  sortField: string = '';
  sortAsc: boolean = true;

  currentUser: any;
  isAdmin: boolean = false;

  cutoffSchedules: CutoffSchedule[] = [
    {
      id: '1',
      name: 'Morning Shift',
      startTime: '08:00',
      endTime: '12:00',
      days: [1, 2, 3, 4, 5],
      isActive: true
    },
    {
      id: '2',
      name: 'Afternoon Shift',
      startTime: '13:00',
      endTime: '17:00',
      days: [1, 2, 3, 4, 5],
      isActive: true
    }
  ];
  isSubmissionAllowed: boolean = true;

  typeMapping = {
    'meat-veg': ['raw', 'meat', 'chicken', 'pork', 'beef', 'fish', 'veggies', 'vegetables', 'vegetable', 'veg'],
    'pre-mix': ['pre-mix', 'premix'],
    'packaging': ['packaging']
  };

  // Store filtered materials for each expanded row
  filteredMaterials: Map<string, RawMaterial[]> = new Map();

  // Table management properties
  userTables: LocalUserTable[] = [];
  selectedTableId: string = '';
  currentTable: LocalUserTable | null = null;
  showApprovalPanel: boolean = false;
  pendingApprovals: LocalUserTable[] = [];
  pendingApprovalsCount: number = 0;

  // Add User Modal properties
  showAddUserModal: boolean = false;
  newUser = {
    full_name: '',
    username: '',
    email: '',
    password: '',
    role: 'user' as 'user' | 'admin'
  };

  // Snackbar properties
  showSnackbar: boolean = false;
  snackbarMessage: string = '';
  snackbarType: 'success' | 'error' | 'info' | 'warning' = 'info';
  snackbarDuration: number = 4000;
  snackbarActionText: string = '';
  snackbarActionCallback?: () => void;
  private snackbarTimeout: any;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private dbService: DatabaseService,
    private supabaseService: SupabaseService,
    private cdRef: ChangeDetectorRef
  ) {
    this.requisitionForm = this.fb.group({
      category: ['', Validators.required],
      sku: ['', Validators.required],
      skuCode: [{ value: '', disabled: true }],
      qtyNeeded: [1, [Validators.required, Validators.min(1), Validators.max(99)]],
      supplier: ['', Validators.required]
    });
  }

  async ngOnInit(): Promise<void> {
    const savedUser = localStorage.getItem('currentUser');
    this.currentUser = savedUser ? JSON.parse(savedUser) : null;
    this.isAdmin = this.currentUser?.role === 'admin';

    // Debug log
    console.log('Current User:', this.currentUser);
    console.log('Is Admin:', this.isAdmin);

    if (!this.currentUser) {
      this.router.navigate(['/login']);
      return;
    }
    this.checkCutoffSchedule();

    await this.loadMasterDataFromDatabase();
    await this.loadUserTables();
    
    // Load last selected table
    const lastTableId = localStorage.getItem('lastSelectedTable');
    if (lastTableId) {
      this.selectedTableId = lastTableId;
      await this.loadTableData();
    }
  }

  private async loadMasterDataFromDatabase(): Promise<void> {
    try {
      this.masterData = await this.dbService.getMasterData();
      console.log('Master data loaded:', this.masterData.length, 'records');
      
      if (this.masterData.length > 0) {
        this.populateCategories();
        this.cdRef.detectChanges();
      }
    } catch (error) {
      console.error('Error loading master data from database:', error);
      this.showSnackbarMessage('Error loading master data', 'error');
    }
  }

  @HostListener('document:click', ['$event'])
  clickOutside(event: Event) {
    if (!(event.target as HTMLElement).closest('.export-dropdown')) {
      this.isExportDropdownOpen = false;
    }
  }

  private checkCutoffSchedule(): void {
    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    this.isSubmissionAllowed = this.cutoffSchedules.some(schedule => {
      if (!schedule.isActive) return false;

      const scheduleStart = this.timeToMinutes(schedule.startTime);
      const scheduleEnd = this.timeToMinutes(schedule.endTime);

      return schedule.days.includes(currentDay) &&
             currentTime >= scheduleStart &&
             currentTime <= scheduleEnd;
    });
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  async onFileUpload(event: any): Promise<void> {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = async (e: any) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];

        if (rows.length < 2) {
          this.showSnackbarMessage('File has no data rows.', 'error');
          return;
        }

        const headerRow = rows[0].map((h: any) => h.toString().trim().toLowerCase());
        const col = this.mapColumns(headerRow);

        // Check only essential columns (category is now optional)
        if (col.skuCode === -1 || col.skuName === -1 || col.raw === -1 || col.qtyBatch === -1 || col.unit4 === -1) {
          this.showSnackbarMessage('Invalid header format. Required columns missing.', 'error');
          return;
        }

        let currentSku = { code: '', name: '', category: '', quantity_per_unit: '', unit: '', quantity_per_pack: '', pack_unit: '' };
        const formattedData = [];

        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];

          const rawMaterial = (r[col.raw] || '').toString().trim();

          if (rawMaterial) {
            // Raw material row - category can be null
            const category = currentSku.category || (r[col.category] || '').toString().trim() || null;
            
            formattedData.push({
              'CATEGORY': category,
              'SKU CODE': currentSku.code || (r[col.skuCode] || '').toString().trim(),
              'SKU': currentSku.name || (r[col.skuName] || '').toString().trim(),
              'QUANTITY PER UNIT': currentSku.quantity_per_unit || (r[col.qtyPerUnit] || '').toString().trim(),
              'UNIT': currentSku.unit || (r[col.unit] || '').toString().trim(),
              'QUANTITY PER PACK': currentSku.quantity_per_pack || (r[col.qtyPerPack] || '').toString().trim(),
              'UNIT2': currentSku.pack_unit || (r[col.unit2] || '').toString().trim(),
              'RAW MATERIAL': rawMaterial,
              'QUANTITY/BATCH': (r[col.qtyBatch] || '').toString().trim(),
              'UNIT4': (r[col.unit4] || '').toString().trim(),
              'TYPE': (r[col.type] || '').toString().trim() || 'Other'
            });
          } else {
            // SKU header row - update currentSku
            currentSku = {
              code: (r[col.skuCode] || '').toString().trim(),
              name: (r[col.skuName] || '').toString().trim(),
              category: (r[col.category] || '').toString().trim(),
              quantity_per_unit: (r[col.qtyPerUnit] || '').toString().trim(),
              unit: (r[col.unit] || '').toString().trim(),
              quantity_per_pack: (r[col.qtyPerPack] || '').toString().trim(),
              pack_unit: (r[col.unit2] || '').toString().trim()
            };
          }
        }

        // Filter valid rows - category can be null, but other fields are required
        const validData = formattedData.filter(item => 
          item['SKU CODE'] && 
          item['SKU'] && 
          item['RAW MATERIAL'] && 
          item['QUANTITY/BATCH'] && 
          item['UNIT4']
        );

        if (validData.length === 0) {
          this.showSnackbarMessage('No valid data found in the file.', 'error');
          return;
        }

        const result = await this.dbService.uploadMasterData(validData);

        if (result.success) {
          this.uploadedFileName = file.name;
          this.showSnackbarMessage(`Master file uploaded successfully! (${result.count} items)`, 'success');
          await this.loadMasterDataFromDatabase();
        } else {
          this.showSnackbarMessage(`Upload failed: ${result.error?.message || 'Unknown error'}`, 'error');
        }

      } catch (error: any) {
        this.showSnackbarMessage(`Upload failed: ${error.message}`, 'error');
      }
    };

    reader.onerror = () => {
      this.showSnackbarMessage('Failed to read file.', 'error');
    };

    reader.readAsArrayBuffer(file);
  }

  private mapColumns(headerRow: string[]): any {
    const headers = headerRow.map(h => h.toLowerCase());

    const category = headers.findIndex(h => h === 'category');
    const skuCode = headers.findIndex(h => h === 'sku code');
    const skuName = headers.findIndex(h => h === 'sku');
    const qtyPerUnit = headers.findIndex(h => h === 'quantity per unit');
    const unitPositions = headers.reduce((acc: number[], h, i) => (h === 'unit' ? [...acc, i] : acc), []);
    let unit = -1;
    if (unitPositions.length > 0) {
      unit = unitPositions.find(pos => headers[pos + 1] !== '2' && headers[pos + 1] !== '3' && headers[pos + 1] !== '4') ?? unitPositions[0];
    }
    const qtyPerPack = headers.findIndex(h => h === 'quantity per pack');
    const unit2 = headers.findIndex(h => h === 'unit2');
    const raw = headers.findIndex(h => h === 'raw material');
    const qtyBatch = headers.findIndex(h => h === 'quantity/batch');
    const unit4 = headers.findIndex(h => h === 'unit4');
    const type = headers.findIndex(h => h === 'type');

    return {
      category,
      skuCode,
      skuName,
      qtyPerUnit,
      unit,
      qtyPerPack,
      unit2,
      raw,
      qtyBatch,
      unit4,
      type
    };
  }

  populateCategories(): void {
    console.log('Populating categories from master data');
    
    // Get categories with values
    const categoriesWithValues = this.masterData
      .map(r => r.category)
      .filter(category => category && typeof category === 'string' && category.trim())
      .map(category => category as string);

    // Check if we have SKUs without categories
    const hasUncategorizedSkus = this.masterData.some(r => 
      !r.category || r.category.trim() === ''
    );

    this.categories = [...new Set(categoriesWithValues)].sort();
    
    // Add "Uncategorized" option if we have SKUs without categories
    if (hasUncategorizedSkus) {
      this.categories.push('Uncategorized');
    }
    
    console.log('Categories available:', this.categories);
    
    this.cdRef.detectChanges();
  }

  onCategoryChange(): void {
    const category = this.requisitionForm.get('category')?.value;
    console.log('Category selected:', category);

    this.skus = [];
    this.requisitionForm.get('sku')?.setValue('');
    this.requisitionForm.get('skuCode')?.setValue('');

    if (!category) {
      console.log('No category selected');
      return;
    }

    // Get unique SKUs for the selected category
    const uniqueSkusMap = new Map<string, { name: string; code: string }>();
    
    this.masterData.forEach(item => {
      const matchesCategory = category === 'Uncategorized' 
        ? (!item.category || item.category.trim() === '')
        : item.category === category;
      
      if (matchesCategory && item.sku_name) {
        const code = (item.sku_code || '').toString().trim();
        const name = item.sku_name.trim();
        if (name && !uniqueSkusMap.has(name)) {
          uniqueSkusMap.set(name, { name, code });
        }
      }
    });
    
    this.skus = Array.from(uniqueSkusMap.values())
      .sort((a, b) => a.name.localeCompare(b.name));
    
    console.log(`SKUs for category "${category}":`, this.skus.length, this.skus);
    
    this.cdRef.detectChanges();
  }

  onSkuChange(): void {
    const skuName = this.requisitionForm.get('sku')?.value;
    console.log('SKU selected from dropdown:', skuName);
    console.log('Available SKUs in dropdown:', this.skus);
    
    const selected = this.skus.find(s => s.name === skuName);
    if (selected) {
      console.log('Found SKU in dropdown list:', selected);
      // Enable the control, set value, then disable it again
      this.requisitionForm.get('skuCode')?.enable();
      this.requisitionForm.get('skuCode')?.setValue(selected.code);
      this.requisitionForm.get('skuCode')?.disable();
      console.log('SKU Code set to:', this.requisitionForm.get('skuCode')?.value);
      
      // Update the title attribute for the tooltip
      this.updateSKUTitle();
    } else {
      console.log('SKU not found in dropdown list');
      this.requisitionForm.get('skuCode')?.enable();
      this.requisitionForm.get('skuCode')?.setValue('');
      this.requisitionForm.get('skuCode')?.disable();
      this.updateSKUTitle();
    }
  }

  // Update SKU dropdown title for tooltip
  updateSKUTitle(): void {
    setTimeout(() => {
      const skuSelect = document.querySelector('.quick-add-form select[formControlName="sku"]') as HTMLSelectElement;
      if (skuSelect) {
        const selectedOption = skuSelect.options[skuSelect.selectedIndex];
        const selectedText = selectedOption?.text || '';
        skuSelect.title = selectedText || 'Select SKU';
        
        // Also update the skuCode field title
        const skuCodeInput = document.querySelector('.quick-add-form input[formControlName="skuCode"]') as HTMLInputElement;
        if (skuCodeInput) {
          skuCodeInput.title = skuCodeInput.value || 'SKU Code';
        }
      }
    }, 0);
  }

  async addRequisition(): Promise<void> {
    console.log('=== DEBUG: addRequisition called ===');
    
    if (!this.selectedTableId) {
      this.showSnackbarMessage('Please select or create a table first', 'error');
      return;
    }
    
    if (!this.isTableEditable()) {
      this.showSnackbarMessage('Cannot add items to this table in its current status', 'error');
      return;
    }
    
    if (this.requisitionForm.invalid) {
      console.log('Form is invalid');
      this.showSnackbarMessage('Please fill all required fields', 'error');
      return;
    }

    const formValue = this.requisitionForm.value;

    console.log('Form values:', {
      category: formValue.category,
      sku: formValue.sku,
      skuCode: formValue.skuCode,
      qtyNeeded: formValue.qtyNeeded,
      supplier: formValue.supplier
    });

    // Get the actual SKU code from the form control (not just form value)
    const formSkuCodeControl = this.requisitionForm.get('skuCode');
    const actualSkuCode = formSkuCodeControl?.value || formValue.skuCode;
    
    console.log('Actual SKU code from form control:', actualSkuCode);
    console.log('Form skuCode disabled?', formSkuCodeControl?.disabled);
    console.log('Form skuCode value:', formSkuCodeControl?.value);

    // If skuCode is still undefined, try to get it from the dropdown selection
    let skuCodeToUse = actualSkuCode;
    if (!skuCodeToUse && formValue.sku) {
      const selectedSku = this.skus.find(s => s.name === formValue.sku);
      if (selectedSku) {
        skuCodeToUse = selectedSku.code;
        console.log('Got SKU code from dropdown selection:', skuCodeToUse);
      }
    }

    if (!skuCodeToUse && !formValue.sku) {
      console.error('Both SKU code and SKU name are undefined!');
      console.log('Form values:', formValue);
      console.log('Available SKUs:', this.skus);
      this.showSnackbarMessage('SKU information is missing. Please reselect the SKU.', 'error');
      return;
    }

    // Find matching records - try by code first, then by name
    let skuRecords: MasterData[] = [];
    
    if (skuCodeToUse) {
      // Try matching by SKU code
      skuRecords = this.masterData.filter(r => {
        const dbCode = (r.sku_code || '').toString().trim();
        const formCode = skuCodeToUse.toString().trim();
        console.log(`Comparing by code: DB Code="${dbCode}" vs Form Code="${formCode}"`);
        return dbCode === formCode;
      });
    }

    // If no matches by code, try by name
    if (skuRecords.length === 0 && formValue.sku) {
      console.log('No match by code, trying by name...');
      skuRecords = this.masterData.filter(r => {
        const dbName = (r.sku_name || '').toString().trim().toLowerCase();
        const formName = (formValue.sku || '').toString().trim().toLowerCase();
        console.log(`Comparing by name: DB Name="${dbName}" vs Form Name="${formName}"`);
        return dbName === formName;
      });
    }

    console.log('Records found:', skuRecords.length);
    console.log('Matching records:', skuRecords.map(r => ({
      code: r.sku_code,
      name: r.sku_name,
      category: r.category,
      raw_material: r.raw_material,
      quantity_per_batch: r.quantity_per_batch
    })));

    if (skuRecords.length === 0) {
      console.error('No records found for SKU:', {
        code: skuCodeToUse,
        name: formValue.sku
      });
      console.log('Available SKU codes in master data:', [...new Set(this.masterData.map(r => r.sku_code).filter(Boolean))].slice(0, 10));
      console.log('Available SKU names in master data:', [...new Set(this.masterData.map(r => r.sku_name).filter(Boolean))].slice(0, 10));
      this.showSnackbarMessage('SKU not found in master data. Try reselecting from dropdown.', 'error');
      return;
    }

    // Use the first record for SKU info
    const skuInfo = skuRecords[0];
    console.log('Using SKU info from first matching record:', {
      code: skuInfo.sku_code,
      name: skuInfo.sku_name,
      category: skuInfo.category,
      hasRawMaterial: !!skuInfo.raw_material
    });

    // Get all materials for this SKU (by code or name)
    const materials = skuRecords
      .filter(r => r.raw_material?.trim() && r.quantity_per_batch)
      .map(r => ({
        name: r.raw_material.trim(),
        qty: parseFloat(r.quantity_per_batch) || 0,
        unit: r.batch_unit || '',
        type: r.type || '',
        requiredQty: (parseFloat(r.quantity_per_batch) || 0) * formValue.qtyNeeded,
        servedQty: 0,
        remarks: '',
        servedDate: undefined,
        isUnserved: false
      }));

    console.log('Materials found:', materials.length);
    console.log('Sample materials:', materials.slice(0, 3));

    if (materials.length === 0) {
      console.error('No materials found for SKU:', {
        code: skuCodeToUse,
        name: formValue.sku
      });
      console.log('All records for this SKU:', skuRecords.map(r => ({
        raw_material: r.raw_material,
        quantity_per_batch: r.quantity_per_batch,
        batch_unit: r.batch_unit
      })));
      this.showSnackbarMessage('No raw materials found for this SKU.', 'error');
      return;
    }

    // Determine what SKU code to use (prefer database code if available, otherwise use form code or generate from name)
    const finalSkuCode = skuInfo.sku_code?.trim() || skuCodeToUse || this.generateSkuCodeFromName(formValue.sku);
    const finalSkuName = formValue.sku || skuInfo.sku_name;

    // Create the requisition item
    const newItem: DashboardRequisition = {
      id: this.generateId(),
      skuCode: finalSkuCode,
      skuName: finalSkuName,
      category: formValue.category,
      qtyNeeded: formValue.qtyNeeded,
      supplier: formValue.supplier,
      qtyPerUnit: skuInfo.quantity_per_unit || '',
      unit: skuInfo.unit || '',
      qtyPerPack: skuInfo.quantity_per_pack || '',
      unit2: skuInfo.pack_unit || '',
      materials: materials,
      status: 'draft',
      tableId: this.selectedTableId
    };

    console.log('New item created:', newItem);

    this.requisitionItems.push(newItem);

    try {
      const requisitionData = {
        sku_code: newItem.skuCode,
        sku_name: newItem.skuName,
        category: newItem.category,
        qty_needed: newItem.qtyNeeded,
        supplier: newItem.supplier,
        qty_per_unit: newItem.qtyPerUnit,
        unit: newItem.unit,
        qty_per_pack: newItem.qtyPerPack,
        pack_unit: newItem.unit2,
        status: newItem.status,
        user_id: this.currentUser?.id || '',
        table_id: this.selectedTableId
      };

      const result = await this.dbService.createRequisition(requisitionData, materials, this.selectedTableId);
      if (result.success) {
        console.log('Requisition saved to database with ID:', result.requisitionId);
      }
    } catch (error) {
      console.error('Error saving to database:', error);
      this.showSnackbarMessage('Error saving to database', 'error');
    }

    // Update table data
    await this.saveTableData();

    this.showSnackbarMessage(`${newItem.skuName} (${newItem.skuCode}) added!`, 'success');

    this.requisitionForm.reset({
      category: '',
      sku: '',
      skuCode: '',
      qtyNeeded: 1,
      supplier: ''
    });

    this.currentPage = Math.ceil(this.requisitionItems.length / this.itemsPerPage);
    this.filterAndPaginate();
  }

  // Helper method to generate a SKU code from name if missing
  private generateSkuCodeFromName(skuName: string): string {
    if (!skuName) return 'NO-CODE';
    
    // Simple hash of the name
    let hash = 0;
    for (let i = 0; i < skuName.length; i++) {
      hash = ((hash << 5) - hash) + skuName.charCodeAt(i);
      hash = hash & hash;
    }
    return 'GEN-' + Math.abs(hash).toString().substring(0, 6);
  }

  updateQty(itemId: string, qty: number): void {
    if (qty < 1 || qty > 99) return;
    if (!this.isTableEditable()) return;

    const item = this.requisitionItems.find(i => i.id === itemId);
    if (item) {
      item.qtyNeeded = qty;
      item.materials.forEach(material => {
        material.requiredQty = material.qty * qty;
      });
      this.saveTableData();
      this.filterAndPaginate();
    }
  }

  updateSupplier(itemId: string, supplier: string): void {
    if (!this.isTableEditable()) return;

    const item = this.requisitionItems.find(i => i.id === itemId);
    if (item) {
      item.supplier = supplier;
      this.saveTableData();
    }
  }

  async deleteItem(itemId: string): Promise<void> {
    if (!this.isTableEditable()) {
      this.showSnackbarMessage('Cannot delete items from this table in its current status', 'error');
      return;
    }

    this.showConfirmDialog(
      'Delete Item',
      'Are you sure you want to delete this item?',
      'Delete',
      'Cancel',
      async () => {
        const index = this.requisitionItems.findIndex(item => item.id === itemId);
        if (index !== -1) {
          const removedName = this.requisitionItems[index].skuName;
          this.requisitionItems.splice(index, 1);
          
          // Save to database
          await this.saveTableData();
          
          this.filterAndPaginate();
          this.showSnackbarMessage(`${removedName} removed`, 'success');
        }
      }
    );
  }

  toggleRow(itemId: string): void {
    if (this.expandedRows.has(itemId)) {
      this.expandedRows.delete(itemId);
      this.filteredMaterials.delete(itemId);
    } else {
      this.expandedRows.add(itemId);
      // Initialize filtered materials with all materials
      const item = this.requisitionItems.find(i => i.id === itemId);
      if (item) {
        this.filteredMaterials.set(itemId, [...item.materials]);
      }
    }
  }

  updateMaterialServedQty(itemId: string, materialIndex: number, servedQty: number, remarks?: string): void {
    if (!this.isTableEditable()) return;

    const item = this.requisitionItems.find(i => i.id === itemId);
    if (item && item.materials[materialIndex]) {
      const material = item.materials[materialIndex];
      material.servedQty = servedQty;
      material.remarks = remarks;
      material.servedDate = new Date();
      material.isUnserved = servedQty < material.requiredQty;

      this.saveTableData();
      this.filterAndPaginate();
    }
  }

  // Fixed: Filter materials by type
  filterMaterials(itemId: string, filterType: string): void {
    console.log(`Filtering materials for item ${itemId} by type: ${filterType}`);
    
    const item = this.requisitionItems.find(i => i.id === itemId);
    if (!item) return;

    if (!filterType) {
      // Show all materials
      this.filteredMaterials.set(itemId, [...item.materials]);
    } else {
      // Filter materials based on type
      const filtered = item.materials.filter(material => {
        const materialType = (material.type || '').toLowerCase().trim();
        
        if (filterType === 'pre-mix') {
          return this.typeMapping['pre-mix'].some(keyword => 
            materialType.includes(keyword)
          );
        } else if (filterType === 'packaging') {
          return this.typeMapping['packaging'].some(keyword => 
            materialType.includes(keyword)
          );
        } else if (filterType === 'meat-veg') {
          return this.typeMapping['meat-veg'].some(keyword => 
            materialType.includes(keyword)
          );
        }
        
        return false;
      });
      
      this.filteredMaterials.set(itemId, filtered);
    }
    
    this.cdRef.detectChanges();
  }

  // Get filtered materials for display
  getFilteredMaterials(itemId: string, allMaterials: RawMaterial[]): RawMaterial[] {
    if (this.filteredMaterials.has(itemId)) {
      return this.filteredMaterials.get(itemId)!;
    }
    return allMaterials;
  }

  filterAndPaginate(): void {
    let filtered = [...this.requisitionItems];

    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(item =>
        item.skuCode.toLowerCase().includes(query) ||
        item.skuName.toLowerCase().includes(query) ||
        (item.category && item.category.toLowerCase().includes(query))
      );
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

    // Double-check permission
    if (!this.isExportEnabled()) {
      this.showSnackbarMessage('Export is only available for approved tables', 'error');
      return;
    }

    if (this.requisitionItems.length === 0) {
      this.showSnackbarMessage('No data to export.', 'error');
      return;
    }

    const data = [
      ['RAW MATERIAL E-PORTAL REQUISITION'],
      ['Generated', new Date().toLocaleString('en-PH')],
      ['Master File', this.uploadedFileName || 'None'],
      ['Table', this.currentTable?.name || 'No table'],
      ['Export Type', this.getExportTypeDisplayName(type)],
      [''],
      ['SKU Code', 'SKU', 'Category', 'Qty Needed', 'Supplier', 'Status',
       'Raw Material', 'Qty/Batch', 'Unit', 'Type', 'Required Qty', 'Served Qty',
       'Remarks', 'Served Date', 'Unserved']
    ];

    this.requisitionItems.forEach(item => {
      if (!item.materials?.length) return;

      let materialsToExport = item.materials;
      if (type !== 'all') {
        materialsToExport = item.materials.filter(m =>
          this.mapTypeToFilter(m.type) === type
        );
      }

      if (materialsToExport.length === 0) return;

      materialsToExport.forEach((m, index) => {
        const row: string[] = [
          index === 0 ? item.skuCode : '',
          index === 0 ? item.skuName : '',
          index === 0 ? (item.category || '') : '',
          index === 0 ? item.qtyNeeded.toString() : '',
          index === 0 ? item.supplier || '' : '',
          index === 0 ? item.status : '',
          m.name,
          m.qty.toString(),
          m.unit || '',
          m.type || '',
          m.requiredQty.toString(),
          (m.servedQty || 0).toString(),
          m.remarks || '',
          m.servedDate ? m.servedDate.toLocaleDateString() : '',
          m.isUnserved ? 'Yes' : 'No'
        ];

        data.push(row);
      });
    });

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Requisition');

    const fileName = `Requisition_${this.currentTable?.name.replace(/\s+/g, '_')}_${
      type === 'all' ? 'All' :
      this.getExportTypeDisplayName(type).replace(/&/g, 'and').replace(/\s+/g, '')
    }_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`;

    XLSX.writeFile(wb, fileName);
    this.showSnackbarMessage(`Exported ${this.getExportTypeDisplayName(type).toLowerCase()} successfully!`, 'success');
  }

  private mapTypeToFilter(type: string): string {
    if (!type) return '';
    const lowerType = type.toLowerCase().trim();

    for (const [filterType, keywords] of Object.entries(this.typeMapping)) {
      if (keywords.some(keyword => lowerType.includes(keyword))) {
        return filterType;
      }
    }
    return '';
  }

  private getExportTypeDisplayName(exportType: string): string {
    switch (exportType) {
      case 'all': return 'All Data';
      case 'pre-mix': return 'Pre-mix Only';
      case 'packaging': return 'Packaging Only';
      case 'meat-veg': return 'Meat & Vegetables Only';
      default: return exportType;
    }
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
    
    this.showConfirmDialog(
      'Clear Table',
      'Clear all items from this table? This action cannot be undone.',
      'Clear',
      'Cancel',
      async () => {
        try {
          // Delete all requisitions for this table from database
          const supabase = this.supabaseService.getClient();
          const { data: requisitions } = await supabase
            .from('requisitions')
            .select('id')
            .eq('table_id', this.selectedTableId);
          
          if (requisitions && requisitions.length > 0) {
            // Delete materials first
            for (const req of requisitions) {
              await supabase
                .from('requisition_materials')
                .delete()
                .eq('requisition_id', req.id);
            }
            
            // Delete requisitions
            await supabase
              .from('requisitions')
              .delete()
              .eq('table_id', this.selectedTableId);
          }
          
          // Clear local data
          this.requisitionItems = [];
          this.searchQuery = '';
          this.currentPage = 1;
          
          // Update table item count
          await this.saveTableData();
          
          this.filterAndPaginate();
          this.showSnackbarMessage('Table cleared successfully!', 'success');
        } catch (error) {
          console.error('Error clearing table:', error);
          this.showSnackbarMessage('Failed to clear table', 'error');
        }
      }
    );
  }

  clearFile(): void {
    this.showConfirmDialog(
      'Clear Master File',
      'Clear uploaded master file?',
      'Clear',
      'Cancel',
      () => {
        this.masterData = [];
        this.uploadedFileName = '';
        this.categories = [];
        this.skus = [];
        this.requisitionForm.reset({
          qtyNeeded: 1,
          supplier: ''
        });
        this.showSnackbarMessage('Master file cleared', 'info');
      }
    );
  }

  logout(): void {
    this.showConfirmDialog(
      'Logout',
      'Are you sure you want to logout?',
      'Logout',
      'Cancel',
      () => {
        localStorage.removeItem('currentUser');
        localStorage.removeItem('lastSelectedTable');
        this.router.navigate(['/login']);
      }
    );
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // ==================== SNACKBAR METHODS ====================

  private showSnackbarMessage(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info', duration?: number): void {
    // Clear existing timeout
    if (this.snackbarTimeout) {
      clearTimeout(this.snackbarTimeout);
    }
    
    this.snackbarMessage = message;
    this.snackbarType = type;
    this.snackbarDuration = duration || 4000;
    this.showSnackbar = true;
    
    // Auto-hide after duration
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

  snackbarAction(): void {
    if (this.snackbarActionCallback) {
      this.snackbarActionCallback();
    }
    this.hideSnackbar();
  }

  // ==================== CONFIRM DIALOG METHODS ====================

  private showConfirmDialog(
    title: string,
    message: string,
    confirmText: string = 'Confirm',
    cancelText: string = 'Cancel',
    onConfirm: () => void,
    onCancel?: () => void
  ): void {
    // For now, using browser confirm but you can replace with a modal component
    if (confirm(`${title}\n\n${message}`)) {
      onConfirm();
    } else if (onCancel) {
      onCancel();
    }
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'draft': return '#6c757d';
      case 'submitted': return '#007bff';
      case 'approved': return '#28a745';
      case 'rejected': return '#dc3545';
      default: return '#6c757d';
    }
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'draft': return 'fa-edit';
      case 'submitted': return 'fa-paper-plane';
      case 'approved': return 'fa-check-circle';
      case 'rejected': return 'fa-times-circle';
      default: return 'fa-question-circle';
    }
  }

  get window(): any {
    return window;
  }

  // ==================== TABLE MANAGEMENT METHODS ====================

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
      updatedAt: new Date(dbTable.updated_at)
    };
  }

  private convertToDbTable(localTable: LocalUserTable): Partial<UserTable> {
    return {
      name: localTable.name,
      user_id: localTable.userId,
      status: localTable.status,
      submitted_by: localTable.submittedBy,
      submitted_date: localTable.submittedDate?.toISOString(),
      reviewed_by: localTable.reviewedBy,
      reviewed_date: localTable.reviewedDate?.toISOString(),
      approved_by: localTable.approvedBy,
      approved_date: localTable.approvedDate?.toISOString(),
      remarks: localTable.remarks,
      item_count: localTable.itemCount
    };
  }

  async loadUserTables(): Promise<void> {
    try {
      const dbTables = await this.dbService.getUserTables(this.currentUser.id);
      this.userTables = dbTables.map(table => this.convertToLocalTable(table));
      this.loadPendingApprovals();
    } catch (error) {
      console.error('Error loading user tables:', error);
      this.showSnackbarMessage('Error loading user tables', 'error');
    }
  }

  async createNewTable(): Promise<void> {
    this.showPromptDialog(
      'Create New Table',
      'Enter table name:',
      'Create',
      'Cancel',
      async (tableName: string) => {
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
            this.filterAndPaginate();
            this.showSnackbarMessage('Table created successfully', 'success');
          }
        } catch (error) {
          console.error('Error creating table:', error);
          this.showSnackbarMessage('Failed to create table', 'error');
        }
      }
    );
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
      // Load table info
      const dbTable = await this.dbService.getTableById(this.selectedTableId);
      if (dbTable) {
        this.currentTable = this.convertToLocalTable(dbTable);
      }
      
      // Load table items
      this.requisitionItems = await this.dbService.getTableRequisitions(this.selectedTableId);
      
      this.filterAndPaginate();
    } catch (error) {
      console.error('Error loading table data:', error);
      this.showSnackbarMessage('Failed to load table data', 'error');
    }
  }

  async renameTable(): Promise<void> {
    if (!this.selectedTableId || !this.currentTable) return;
    
    this.showPromptDialog(
      'Rename Table',
      'Enter new table name:',
      'Rename',
      'Cancel',
      async (newName: string) => {
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
      },
      this.currentTable.name
    );
  }

  async deleteTable(): Promise<void> {
    if (!this.selectedTableId) return;
    
    this.showConfirmDialog(
      'Delete Table',
      'Are you sure you want to delete this table? All data will be lost.',
      'Delete',
      'Cancel',
      async () => {
        try {
          await this.dbService.deleteTable(this.selectedTableId);
          
          this.userTables = this.userTables.filter(t => t.id !== this.selectedTableId);
          this.selectedTableId = '';
          this.currentTable = null;
          this.requisitionItems = [];
          this.filterAndPaginate();
          
          localStorage.removeItem('lastSelectedTable');
          this.showSnackbarMessage('Table deleted successfully', 'success');
        } catch (error) {
          console.error('Error deleting table:', error);
          this.showSnackbarMessage('Failed to delete table', 'error');
        }
      }
    );
  }

  async submitTableForApproval(): Promise<void> {
    if (!this.selectedTableId || !this.currentTable || !this.canSubmitTable()) return;
    
    this.showConfirmDialog(
      'Submit Table',
      'Submit this entire table for approval? All items will be submitted.',
      'Submit',
      'Cancel',
      async () => {
        try {
          await this.dbService.submitTableForApproval(
            this.selectedTableId,
            this.currentUser.full_name || this.currentUser.username
          );
          
          this.currentTable!.status = 'submitted';
          this.currentTable!.submittedBy = this.currentUser.full_name || this.currentUser.username;
          this.currentTable!.submittedDate = new Date();
          this.currentTable!.updatedAt = new Date();
          
          // Update all items in the table to submitted
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
    );
  }

  async resubmitTable(): Promise<void> {
    if (!this.selectedTableId || !this.currentTable || this.currentTable.status !== 'rejected') {
      return;
    }
    
    this.showConfirmDialog(
      'Resubmit Table',
      'Resubmit this table for approval?',
      'Resubmit',
      'Cancel',
      async () => {
        try {
          // Update table status back to submitted
          await this.supabaseService.getClient()
            .from('user_tables')
            .update({
              status: 'submitted',
              submitted_by: this.currentUser.full_name || this.currentUser.username,
              submitted_date: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              remarks: null // Clear rejection remarks
            })
            .eq('id', this.selectedTableId);
          
          // Update all requisitions in the table
          await this.supabaseService.getClient()
            .from('requisitions')
            .update({
              status: 'submitted',
              submitted_by: this.currentUser.full_name || this.currentUser.username,
              submitted_date: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              remarks: null
            })
            .eq('table_id', this.selectedTableId);
          
          // Reload data
          await this.loadTableData();
          this.showSnackbarMessage('Table resubmitted for approval', 'success');
        } catch (error) {
          console.error('Error resubmitting table:', error);
          this.showSnackbarMessage('Failed to resubmit table', 'error');
        }
      }
    );
  }

  canSubmitTable(): boolean {
    if (!this.currentTable) return false;
    if (this.currentTable.status === 'approved') return false;
    if (!this.isSubmissionAllowed) return false;
    return this.requisitionItems.length > 0;
  }

  isTableSubmissionAllowed(): boolean {
    return this.isSubmissionAllowed;
  }

  // Export permission check
  isExportEnabled(): boolean {
    // Export should only be enabled when table is approved
    return this.currentTable?.status === 'approved';
  }

  // Table edit permission check
  isTableEditable(): boolean {
    // Table is editable when: draft or rejected (for resubmission)
    return this.currentTable?.status === 'draft' || this.currentTable?.status === 'rejected';
  }

  // Admin approval methods
  async loadPendingApprovals(): Promise<void> {
    if (!this.isAdmin) return;
    
    try {
      const dbTables = await this.dbService.getPendingApprovals();
      this.pendingApprovals = dbTables.map(table => this.convertToLocalTable(table));
      this.pendingApprovalsCount = this.pendingApprovals.length;
    } catch (error) {
      console.error('Error loading pending approvals:', error);
      this.showSnackbarMessage('Error loading pending approvals', 'error');
    }
  }

  viewPendingApprovals(): void {
    this.showApprovalPanel = true;
  }

  closeApprovalPanel(): void {
    this.showApprovalPanel = false;
  }

  async approveTable(tableId: string): Promise<void> {
    this.showPromptDialog(
      'Approve Table',
      'Enter approval remarks (optional):',
      'Approve',
      'Cancel',
      async (remarks: string) => {
        try {
          await this.dbService.approveTable(
            tableId,
            this.currentUser.full_name || this.currentUser.username,
            remarks || undefined
          );
          
          // Reload data
          await this.loadUserTables();
          await this.loadPendingApprovals();
          
          if (this.selectedTableId === tableId) {
            await this.loadTableData();
          }
          
          this.showSnackbarMessage('Table approved successfully', 'success');
        } catch (error) {
          console.error('Error approving table:', error);
          this.showSnackbarMessage('Failed to approve table', 'error');
        }
      }
    );
  }

  async rejectTable(tableId: string): Promise<void> {
    this.showPromptDialog(
      'Reject Table',
      'Enter rejection reason:',
      'Reject',
      'Cancel',
      async (remarks: string) => {
        if (!remarks?.trim()) {
          this.showSnackbarMessage('Rejection reason is required', 'error');
          return;
        }
        
        try {
          await this.dbService.rejectTable(
            tableId,
            this.currentUser.full_name || this.currentUser.username,
            remarks.trim()
          );
          
          // Reload data
          await this.loadUserTables();
          await this.loadPendingApprovals();
          
          if (this.selectedTableId === tableId) {
            await this.loadTableData();
          }
          
          this.showSnackbarMessage('Table rejected', 'info');
        } catch (error) {
          console.error('Error rejecting table:', error);
          this.showSnackbarMessage('Failed to reject table', 'error');
        }
      }
    );
  }

  async viewTableDetails(tableId: string): Promise<void> {
    // Load the table in the main view
    this.selectedTableId = tableId;
    await this.loadTableData();
    this.closeApprovalPanel();
  }

  // Update save method to auto-save to database
  private async saveTableData(): Promise<void> {
    if (!this.selectedTableId || !this.currentTable) return;
    
    try {
      // Update table item count in database
      await this.dbService.updateTableItemCount(this.selectedTableId, this.requisitionItems.length);
      
      // Update local table info
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

  // ==================== USER MANAGEMENT METHODS ====================
  
  closeAddUserModal(): void {
    this.showAddUserModal = false;
    this.newUser = {
      full_name: '',
      username: '',
      email: '',
      password: '',
      role: 'user'
    };
  }

  isNewUserFormValid(): boolean {
    return !!(
      this.newUser.full_name?.trim() &&
      this.newUser.username?.trim() &&
      this.newUser.email?.trim() &&
      this.newUser.password?.trim() &&
      this.newUser.role
    );
  }

  async createNewUser(): Promise<void> {
    if (!this.isNewUserFormValid()) {
      this.showSnackbarMessage('Please fill all required fields', 'error');
      return;
    }

    try {
      const supabase = this.supabaseService.getClient();
      
      // First, sign up the user with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: this.newUser.email,
        password: this.newUser.password,
        options: {
          data: {
            username: this.newUser.username,
            full_name: this.newUser.full_name,
            role: this.newUser.role
          }
        }
      });

      if (authError) {
        throw authError;
      }

      // Then create the user profile in the public.users table
      const { error: profileError } = await supabase
        .from('users')
        .insert([{
          id: authData.user?.id,
          email: this.newUser.email,
          username: this.newUser.username,
          full_name: this.newUser.full_name,
          role: this.newUser.role,
          created_at: new Date().toISOString()
        }]);

      if (profileError) {
        console.error('Error creating user profile:', profileError);
        // If profile creation fails, try to delete the auth user (if we have admin access)
        if (authData.user?.id) {
          try {
            await supabase.auth.admin.deleteUser(authData.user.id);
          } catch (deleteError) {
            console.error('Error deleting auth user:', deleteError);
          }
        }
        throw profileError;
      }

      this.showSnackbarMessage('User created successfully!', 'success');
      this.closeAddUserModal();
    } catch (error: any) {
      console.error('Error creating user:', error);
      this.showSnackbarMessage(`Failed to create user: ${error.message}`, 'error');
    }
  }

  // ==================== HELPER METHODS ====================

  private showPromptDialog(
    title: string,
    message: string,
    confirmText: string = 'OK',
    cancelText: string = 'Cancel',
    onConfirm: (input: string) => void,
    defaultValue: string = ''
  ): void {
    // For now, using browser prompt but you can replace with a modal component
    const input = prompt(`${title}\n\n${message}`, defaultValue);
    if (input !== null) {
      onConfirm(input);
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
}