import { Component, OnInit, ElementRef, ViewChild, HostListener, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import * as XLSX from 'xlsx';
import { DatabaseService } from '../services/database.service';
import { SupabaseService } from '../services/supabase.service';
import { MasterData, DashboardRequisition } from '../models/database.model';

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

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterModule],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.css']
})
export class DashboardComponent implements OnInit {
  @ViewChild('masterFileInput') masterFileInput!: ElementRef;

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

  isSyncEnabled: boolean = false;
  syncStatus: string = 'Local only';

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

    if (!this.currentUser) {
      this.router.navigate(['/login']);
      return;
    }

    await this.loadFromLocalStorage();

    this.darkMode = localStorage.getItem('darkMode') === 'true';
    this.updateDarkMode();

    this.loadSyncConfig();

    this.checkCutoffSchedule();

    await this.loadMasterDataFromDatabase();
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
    }
  }

  @HostListener('document:click', ['$event'])
  clickOutside(event: Event) {
    if (!(event.target as HTMLElement).closest('.export-dropdown')) {
      this.isExportDropdownOpen = false;
    }
  }

  private async loadFromLocalStorage(): Promise<void> {
    const savedData = localStorage.getItem('requisitionData');
    if (savedData) {
      try {
        const data = JSON.parse(savedData);
        this.requisitionItems = data.items || [];
        this.uploadedFileName = data.fileName || '';

        await this.syncLocalDataWithDatabase();

        this.filterAndPaginate();
      } catch (error) {
        console.error('Error loading from localStorage:', error);
      }
    }
  }

  private async syncLocalDataWithDatabase(): Promise<void> {
    if (this.requisitionItems.length > 0) {
      for (const item of this.requisitionItems) {
        try {
          const requisitionData = {
            sku_code: item.skuCode,
            sku_name: item.skuName,
            category: item.category,
            qty_needed: item.qtyNeeded,
            supplier: item.supplier,
            qty_per_unit: item.qtyPerUnit,
            unit: item.unit,
            qty_per_pack: item.qtyPerPack,
            pack_unit: item.unit2,
            status: item.status,
            user_id: this.currentUser?.id || '',
            submitted_by: item.submittedBy,
            submitted_date: item.submittedDate?.toISOString(),
            reviewed_by: item.reviewedBy,
            reviewed_date: item.reviewedDate?.toISOString(),
            approver: item.approver,
            approved_date: item.approvedDate?.toISOString(),
            remarks: item.remarks
          };

          const materials = item.materials.map(material => ({
            name: material.name,
            qty: material.qty,
            unit: material.unit,
            type: material.type,
            requiredQty: material.requiredQty,
            servedQty: material.servedQty || 0,
            remarks: material.remarks || '',
            servedDate: material.servedDate,
            isUnserved: material.isUnserved || false
          }));

          await this.dbService.createRequisition(requisitionData, materials);
        } catch (error) {
          console.error('Error syncing requisition to database:', error);
        }
      }
    }
  }

  private saveToLocalStorage(): void {
    const data = {
      items: this.requisitionItems,
      fileName: this.uploadedFileName
    };
    localStorage.setItem('requisitionData', JSON.stringify(data));
  }

  private loadSyncConfig(): void {
    this.isSyncEnabled = localStorage.getItem('syncEnabled') === 'true';
    this.updateSyncUI();
  }

  private updateSyncUI(): void {
    if (this.isSyncEnabled) {
      this.syncStatus = 'Auto-sync ON';
    } else {
      this.syncStatus = 'Local only';
    }
  }

  toggleSync(): void {
    this.isSyncEnabled = !this.isSyncEnabled;
    localStorage.setItem('syncEnabled', this.isSyncEnabled.toString());
    this.updateSyncUI();

    if (this.isSyncEnabled) {
      this.showToast('Cloud sync ENABLED!', 'success');
    } else {
      this.showToast('Sync disabled – local only', 'info');
    }
  }

  restoreFromCloud(): void {
    if (confirm('Restore from cloud?\n\nThis will replace all local data.')) {
      this.showToast('Restore from cloud not implemented yet', 'warning');
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
          this.showToast('File has no data rows.', 'error');
          return;
        }

        const headerRow = rows[0].map((h: any) => h.toString().trim().toLowerCase());
        const col = this.mapColumns(headerRow);

        // Check only essential columns (category is now optional)
        if (col.skuCode === -1 || col.skuName === -1 || col.raw === -1 || col.qtyBatch === -1 || col.unit4 === -1) {
          this.showToast('Invalid header format. Required columns missing.', 'error');
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
          this.showToast('No valid data found in the file.', 'error');
          return;
        }

        const result = await this.dbService.uploadMasterData(validData);

        if (result.success) {
          this.uploadedFileName = file.name;
          this.showToast(`Master file uploaded successfully! (${result.count} items)`, 'success');
          await this.loadMasterDataFromDatabase();
        } else {
          this.showToast(`Upload failed: ${result.error?.message || 'Unknown error'}`, 'error');
        }

      } catch (error: any) {
        this.showToast(`Upload failed: ${error.message}`, 'error');
      }
    };

    reader.onerror = () => {
      this.showToast('Failed to read file.', 'error');
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
    } else {
      console.log('SKU not found in dropdown list');
      this.requisitionForm.get('skuCode')?.enable();
      this.requisitionForm.get('skuCode')?.setValue('');
      this.requisitionForm.get('skuCode')?.disable();
    }
  }

  async addRequisition(): Promise<void> {
    console.log('=== DEBUG: addRequisition called ===');
    
    if (this.requisitionForm.invalid) {
      console.log('Form is invalid');
      this.showToast('Please fill all required fields', 'error');
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
      this.showToast('SKU information is missing. Please reselect the SKU.', 'error');
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
      this.showToast('SKU not found in master data. Try reselecting from dropdown.', 'error');
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
      this.showToast('No raw materials found for this SKU.', 'error');
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
      status: 'draft'
    };

    console.log('New item created:', newItem);

    this.requisitionItems.push(newItem);
    this.saveToLocalStorage();

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
        user_id: this.currentUser?.id || ''
      };

      const result = await this.dbService.createRequisition(requisitionData, materials);
      if (result.success) {
        console.log('Requisition saved to database with ID:', result.requisitionId);
      }
    } catch (error) {
      console.error('Error saving to database:', error);
    }

    this.showToast(`${newItem.skuName} (${newItem.skuCode}) added!`, 'success');

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

    const item = this.requisitionItems.find(i => i.id === itemId);
    if (item) {
      item.qtyNeeded = qty;
      item.materials.forEach(material => {
        material.requiredQty = material.qty * qty;
      });
      this.saveToLocalStorage();
      this.filterAndPaginate();
    }
  }

  updateSupplier(itemId: string, supplier: string): void {
    const item = this.requisitionItems.find(i => i.id === itemId);
    if (item) {
      item.supplier = supplier;
      this.saveToLocalStorage();
    }
  }

  deleteItem(itemId: string): void {
    if (confirm('Are you sure you want to delete this item?')) {
      const index = this.requisitionItems.findIndex(item => item.id === itemId);
      if (index !== -1) {
        const removedName = this.requisitionItems[index].skuName;
        this.requisitionItems.splice(index, 1);
        this.saveToLocalStorage();
        this.filterAndPaginate();
        this.showToast(`${removedName} removed`, 'error');
      }
    }
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
    const item = this.requisitionItems.find(i => i.id === itemId);
    if (item && item.materials[materialIndex]) {
      const material = item.materials[materialIndex];
      material.servedQty = servedQty;
      material.remarks = remarks;
      material.servedDate = new Date();
      material.isUnserved = servedQty < material.requiredQty;

      this.saveToLocalStorage();
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

  async submitRequisition(itemId: string): Promise<void> {
    if (!this.isSubmissionAllowed) {
      this.showToast('Submission is not allowed at this time. Please check cutoff schedule.', 'error');
      return;
    }

    if (!this.currentUser) {
      this.showToast('You must be logged in to submit', 'error');
      return;
    }

    const item = this.requisitionItems.find(i => i.id === itemId);
    if (item) {
      if (!item.supplier || !item.qtyNeeded || item.qtyNeeded <= 0) {
        this.showToast('Please fill all required fields before submission', 'error');
        return;
      }

      if (confirm('Submit this requisition for approval?')) {
        item.status = 'submitted';
        item.submittedBy = this.currentUser.full_name || this.currentUser.username;
        item.submittedDate = new Date();
        this.saveToLocalStorage();
        this.filterAndPaginate();
        this.showToast('Requisition submitted successfully', 'success');
      }
    }
  }

  async reviewRequisition(itemId: string, approve: boolean): Promise<void> {
    if (!this.isAdmin) {
      this.showToast('Only admins can review requisitions', 'error');
      return;
    }

    const item = this.requisitionItems.find(i => i.id === itemId);
    if (item) {
      const remarks = prompt(approve ? 'Enter approval remarks (optional):' : 'Enter rejection reason:');
      if (remarks !== null) {
        item.status = approve ? 'approved' : 'rejected';
        item.reviewedBy = this.currentUser.full_name || this.currentUser.username;
        item.reviewedDate = new Date();
        item.remarks = remarks;
        this.saveToLocalStorage();
        this.filterAndPaginate();
        this.showToast(`Requisition ${approve ? 'approved' : 'rejected'}`, 'success');
      }
    }
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

    if (this.requisitionItems.length === 0) {
      this.showToast('No data to export.', 'error');
      return;
    }

    const data = [
      ['RAW MATERIAL E-PORTAL REQUISITION'],
      ['Generated', new Date().toLocaleString('en-PH')],
      ['Master File', this.uploadedFileName || 'None'],
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

    const fileName = `Requisition_${
      type === 'all' ? 'All' :
      this.getExportTypeDisplayName(type).replace(/&/g, 'and').replace(/\s+/g, '')
    }_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`;

    XLSX.writeFile(wb, fileName);
    this.showToast(`Exported ${this.getExportTypeDisplayName(type).toLowerCase()} successfully!`, 'success');
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

  clearAll(): void {
    if (confirm('Clear all requisition data?')) {
      this.requisitionItems = [];
      this.searchQuery = '';
      this.currentPage = 1;
      this.saveToLocalStorage();
      this.filterAndPaginate();
      this.showToast('All data cleared!', 'info');
    }
  }

  clearFile(): void {
    if (confirm('Clear uploaded master file?')) {
      this.masterData = [];
      this.uploadedFileName = '';
      this.categories = [];
      this.skus = [];
      this.requisitionForm.reset({
        qtyNeeded: 1,
        supplier: ''
      });
      this.saveToLocalStorage();
      this.filterAndPaginate();
    }
  }

  toggleDarkMode(): void {
    this.darkMode = !this.darkMode;
    localStorage.setItem('darkMode', this.darkMode.toString());
    this.updateDarkMode();
  }

  private updateDarkMode(): void {
    if (this.darkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }

  logout(): void {
    if (confirm('Are you sure you want to logout?')) {
      localStorage.removeItem('currentUser');
      this.router.navigate(['/login']);
    }
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  private showToast(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info'): void {
    alert(`${type.toUpperCase()}: ${message}`);
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
}