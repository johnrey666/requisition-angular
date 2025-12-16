import { Component, OnInit, ElementRef, ViewChild, HostListener } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NgClass } from '@angular/common';
import * as XLSX from 'xlsx';

// Remove the file-saver import since we have type conflicts
// import { saveAs } from 'file-saver';

// Declare saveAs function globally
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

interface RequisitionItem {
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
  approver?: string;
  approvedDate?: Date;
  remarks?: string;
}

interface MasterDataRow {
  CATEGORY: string;
  'SKU CODE': string;
  SKU: string;
  'QUANTITY PER UNIT': string;
  UNIT: string;
  'QUANTITY PER PACK': string;
  UNIT2: string;
  'RAW MATERIAL': string;
  'QUANTITY/BATCH': string;
  UNIT4: string;
  TYPE: string;
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
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterModule, NgClass],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.css']
})
export class DashboardComponent implements OnInit {
  @ViewChild('masterFileInput') masterFileInput!: ElementRef;
  
  // Forms
  requisitionForm: FormGroup;
  materialForm: FormGroup;
  
  // Data
  masterData: MasterDataRow[] = [];
  requisitionItems: RequisitionItem[] = [];
  filteredItems: RequisitionItem[] = [];
  categories: string[] = [];
  skus: { name: string; code: string }[] = [];
  
  // UI State
  uploadedFileName: string = '';
  searchQuery: string = '';
  currentPage: number = 1;
  itemsPerPage: number = 8;
  totalPages: number = 1;
  expandedRows: Set<string> = new Set();
  darkMode: boolean = false;
  isExportDropdownOpen: boolean = false;
  
  // Sorting
  sortField: string = '';
  sortAsc: boolean = true;
  
  // User info
  currentUser: any;
  isAdmin: boolean = false;
  
  // Cloud Sync
  isSyncEnabled: boolean = false;
  syncStatus: string = 'Local only';
  
  // Cutoff Schedules
  cutoffSchedules: CutoffSchedule[] = [
    {
      id: '1',
      name: 'Morning Shift',
      startTime: '08:00',
      endTime: '12:00',
      days: [1, 2, 3, 4, 5], // Monday to Friday
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
  
  // Type mapping
  typeMapping = {
    'meat-veg': ['raw', 'meat', 'chicken', 'pork', 'beef', 'fish', 'veggies', 'vegetables', 'vegetable', 'veg'],
    'pre-mix': ['pre-mix', 'premix'],
    'packaging': ['packaging']
  };

  constructor(
    private fb: FormBuilder,
    private router: Router
  ) {
    this.requisitionForm = this.fb.group({
      category: ['', Validators.required],
      sku: ['', Validators.required],
      skuCode: [{ value: '', disabled: true }],
      qtyNeeded: [1, [Validators.required, Validators.min(1), Validators.max(99)]],
      supplier: ['', Validators.required]
    });

    this.materialForm = this.fb.group({
      servedQty: ['', Validators.required],
      remarks: ['']
    });
  }

  ngOnInit(): void {
    // Load user info
    const savedUser = localStorage.getItem('currentUser');
    this.currentUser = savedUser ? JSON.parse(savedUser) : null;
    this.isAdmin = this.currentUser?.role === 'admin';
    
    if (!this.currentUser) {
      this.router.navigate(['/login']);
      return;
    }
    
    // Load saved data
    this.loadFromLocalStorage();
    
    // Load dark mode preference
    this.darkMode = localStorage.getItem('darkMode') === 'true';
    this.updateDarkMode();
    
    // Load sync config
    this.loadSyncConfig();
    
    // Check cutoff schedule
    this.checkCutoffSchedule();
  }

  // Close dropdown when clicking outside
  @HostListener('document:click', ['$event'])
  clickOutside(event: Event) {
    if (!(event.target as HTMLElement).closest('.export-dropdown')) {
      this.isExportDropdownOpen = false;
    }
  }

  private loadFromLocalStorage(): void {
    const savedData = localStorage.getItem('requisitionData');
    if (savedData) {
      const data = JSON.parse(savedData);
      this.requisitionItems = data.items || [];
      this.masterData = data.masterData || [];
      this.uploadedFileName = data.fileName || '';
      
      if (this.masterData.length) {
        this.populateCategories();
      }
      
      this.filterAndPaginate();
    }
  }

  private saveToLocalStorage(): void {
    const data = {
      items: this.requisitionItems,
      masterData: this.masterData,
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
    if (confirm('Restore from Google Sheets?\n\nThis will replace all local data.')) {
      // Implementation for Google Sheets restore
      this.showToast('Restore from cloud not implemented yet', 'warning');
    }
  }

  private checkCutoffSchedule(): void {
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
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

  onFileUpload(event: any): void {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    
    reader.onload = (e: any) => {
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
        
        this.masterData = rows.slice(1)
          .map((r: any[]) => ({
            'CATEGORY': (r[col.category] || '').toString().trim(),
            'SKU CODE': (r[col.skuCode] || '').toString().trim(),
            'SKU': (r[col.skuName] || '').toString().trim(),
            'QUANTITY PER UNIT': (r[col.qtyPerUnit] || '').toString().trim(),
            'UNIT': (r[col.unit] || '').toString().trim(),
            'QUANTITY PER PACK': (r[col.qtyPerPack] || '').toString().trim(),
            'UNIT2': (r[col.unit2] || '').toString().trim(),
            'RAW MATERIAL': (r[col.raw] || '').toString().trim(),
            'QUANTITY/BATCH': (r[col.qtyBatch] || '').toString().trim(),
            'UNIT4': (r[col.unit4] || '').toString().trim(),
            'TYPE': (r[col.type] || '').toString().trim()
          }))
          .filter(r => r['CATEGORY'] && r['SKU CODE'] && r['SKU']);

        this.uploadedFileName = file.name;
        this.populateCategories();
        this.saveToLocalStorage();
        
        this.showToast(`Master file loaded! (${this.masterData.length} items)`, 'success');
        
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
    return {
      category: headerRow.findIndex(h => h.includes('category')),
      skuCode: headerRow.findIndex(h => h.includes('sku') && h.includes('code')),
      skuName: headerRow.findIndex(h => h.includes('sku') && !h.includes('code') && !h.includes('quantity')),
      qtyPerUnit: headerRow.findIndex(h => h.includes('quantity') && h.includes('per') && h.includes('unit') && !h.includes('pack')),
      unit: headerRow.findIndex(h => h === 'unit' && !h.includes('2') && !h.includes('4') && !h.includes('pack') && !h.includes('batch')),
      qtyPerPack: headerRow.findIndex(h => h.includes('quantity') && h.includes('per') && h.includes('pack')),
      unit2: headerRow.findIndex(h => h === 'unit2' || (h.includes('unit') && headerRow[headerRow.indexOf(h)-1]?.includes('pack'))),
      raw: headerRow.findIndex(h => h.includes('raw') && h.includes('material')),
      qtyBatch: headerRow.findIndex(h => h.includes('quantity') && h.includes('batch')),
      unit4: headerRow.findIndex(h => h.includes('unit') && (h.includes('4') || headerRow[headerRow.indexOf(h)-1]?.includes('batch'))),
      type: headerRow.findIndex(h => h === 'type' || h.includes('type'))
    };
  }

populateCategories(): void {
  // Ensure we only get string values and filter out any non-string values
  const categories = this.masterData
    .map(r => r['CATEGORY'])
    .filter(category => {
      // Filter out falsy values and ensure it's a string
      return category && typeof category === 'string';
    })
    .map(category => category as string); // Explicitly cast to string
  
  // Remove duplicates and sort
  this.categories = [...new Set(categories)].sort();
}

  onCategoryChange(): void {
    const category = this.requisitionForm.get('category')?.value;
    if (category) {
      const map = new Map<string, string>();
      
      this.masterData
        .filter(r => r['CATEGORY'] === category && r['SKU'] && r['SKU CODE'])
        .forEach(r => {
          const sku = r['SKU'].trim();
          const code = r['SKU CODE'].trim();
          if (sku && code && !map.has(sku)) {
            map.set(sku, code);
          }
        });
      
      this.skus = Array.from(map).sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, code]) => ({ name, code }));
      
      this.requisitionForm.get('sku')?.enable();
    } else {
      this.skus = [];
      this.requisitionForm.get('sku')?.disable();
      this.requisitionForm.get('sku')?.setValue('');
      this.requisitionForm.get('skuCode')?.setValue('');
    }
  }

  onSkuChange(): void {
    const skuName = this.requisitionForm.get('sku')?.value;
    const sku = this.skus.find(s => s.name === skuName);
    if (sku) {
      this.requisitionForm.get('skuCode')?.setValue(sku.code);
    }
  }

  addRequisition(): void {
    if (this.requisitionForm.invalid) {
      this.showToast('Please fill all required fields', 'error');
      return;
    }

    const formValue = this.requisitionForm.value;
    const skuInfo = this.masterData.find(r => 
      r['SKU CODE'] === formValue.skuCode && r['SKU'] === formValue.sku
    );

    if (!skuInfo) {
      this.showToast('SKU not found in master data.', 'error');
      return;
    }

    const materials = this.masterData
      .filter(r => r['SKU CODE'] === formValue.skuCode && r['SKU'] === formValue.sku && r['RAW MATERIAL'])
      .map(r => ({
        name: r['RAW MATERIAL'],
        qty: parseFloat(r['QUANTITY/BATCH']) || 0,
        unit: r['UNIT4'],
        type: r['TYPE'] || '',
        requiredQty: (parseFloat(r['QUANTITY/BATCH']) || 0) * formValue.qtyNeeded,
        servedQty: 0,
        remarks: '',
        servedDate: undefined,
        isUnserved: false
      }));

    if (materials.length === 0) {
      this.showToast('No raw materials found for this SKU.', 'error');
      return;
    }

    const newItem: RequisitionItem = {
      id: this.generateId(),
      skuCode: formValue.skuCode,
      skuName: formValue.sku,
      category: formValue.category,
      qtyNeeded: formValue.qtyNeeded,
      supplier: formValue.supplier,
      qtyPerUnit: skuInfo['QUANTITY PER UNIT'] || '',
      unit: skuInfo['UNIT'] || '',
      qtyPerPack: skuInfo['QUANTITY PER PACK'] || '',
      unit2: skuInfo['UNIT2'] || '',
      materials: materials,
      status: 'draft'
    };

    this.requisitionItems.push(newItem);
    this.saveToLocalStorage();
    
    this.showToast(`${formValue.sku} (${formValue.skuCode}) added!`, 'success');
    
    // Reset form
    this.requisitionForm.reset({
      qtyNeeded: 1,
      supplier: ''
    });
    this.requisitionForm.get('skuCode')?.setValue('');
    
    this.currentPage = Math.ceil(this.requisitionItems.length / this.itemsPerPage);
    this.filterAndPaginate();
  }

  updateQty(itemId: string, qty: number): void {
    if (qty < 1 || qty > 99) return;
    
    const item = this.requisitionItems.find(i => i.id === itemId);
    if (item) {
      item.qtyNeeded = qty;
      // Update material required quantities
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
    } else {
      this.expandedRows.add(itemId);
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

  submitRequisition(itemId: string): void {
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
      // Validate required fields
      if (!item.supplier || !item.qtyNeeded || item.qtyNeeded <= 0) {
        this.showToast('Please fill all required fields before submission', 'error');
        return;
      }

      if (confirm('Submit this requisition for approval?')) {
        item.status = 'submitted';
        item.submittedBy = this.currentUser.fullName || this.currentUser.username;
        item.submittedDate = new Date();
        this.saveToLocalStorage();
        this.filterAndPaginate();
        this.showToast('Requisition submitted successfully', 'success');
      }
    }
  }

  reviewRequisition(itemId: string, approve: boolean): void {
    if (!this.isAdmin) {
      this.showToast('Only admins can review requisitions', 'error');
      return;
    }

    const item = this.requisitionItems.find(i => i.id === itemId);
    if (item) {
      const remarks = prompt(approve ? 'Enter approval remarks (optional):' : 'Enter rejection reason:');
      if (remarks !== null) {
        item.status = approve ? 'approved' : 'rejected';
        item.reviewedBy = this.currentUser.fullName || this.currentUser.username;
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
    
    // Apply search filter
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(item =>
        item.skuCode.toLowerCase().includes(query) ||
        item.skuName.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    if (this.sortField) {
      filtered.sort((a: any, b: any) => {
        const aVal = a[this.sortField] || '';
        const bVal = b[this.sortField] || '';
        return aVal.toString().localeCompare(bVal.toString()) * (this.sortAsc ? 1 : -1);
      });
    }

    // Calculate pagination
    this.totalPages = Math.ceil(filtered.length / this.itemsPerPage);
    this.currentPage = Math.min(this.currentPage, this.totalPages || 1);
    
    const start = (this.currentPage - 1) * this.itemsPerPage;
    const end = start + this.itemsPerPage;
    this.filteredItems = filtered.slice(start, end);
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
      // Create row with all string values
      const row: string[] = [
        index === 0 ? item.skuCode : '',
        index === 0 ? item.skuName : '',
        index === 0 ? item.category : '',
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
    switch(exportType) {
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
      this.masterData = [];
      this.uploadedFileName = '';
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
    // Simple alert for now, can be replaced with a proper toast system
    alert(`${type.toUpperCase()}: ${message}`);
  }

  // Helper methods for template
  getStatusColor(status: string): string {
    switch(status) {
      case 'draft': return '#6c757d';
      case 'submitted': return '#007bff';
      case 'approved': return '#28a745';
      case 'rejected': return '#dc3545';
      default: return '#6c757d';
    }
  }

  getStatusIcon(status: string): string {
    switch(status) {
      case 'draft': return 'fa-edit';
      case 'submitted': return 'fa-paper-plane';
      case 'approved': return 'fa-check-circle';
      case 'rejected': return 'fa-times-circle';
      default: return 'fa-question-circle';
    }
  }

  // Filter materials by type
  filterMaterials(event: Event, itemId: string): void {
    const selectElement = event.target as HTMLSelectElement;
    const filterType = selectElement.value;
    // Implementation can be added if needed for client-side filtering
    console.log(`Filtering materials for item ${itemId} by type: ${filterType}`);
  }
  
  // Access window object
  get window(): any {
    return window;
  }
}