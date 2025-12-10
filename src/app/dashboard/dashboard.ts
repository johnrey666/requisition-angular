import { Component, OnInit, ElementRef, ViewChild, Renderer2 } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import * as XLSX from 'xlsx';
import { AuthService } from '../../services/auth.service';

interface MasterData {
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

interface Material {
  name: string;
  qty: string;
  unit: string;
  type: string;
}

interface RequisitionRow {
  skuCode: string;
  skuName: string;
  category: string;
  qtyNeeded: number;
  supplier: string;
  qtyPerUnit: string;
  unit: string;
  qtyPerPack: string;
  unit2: string;
  materials: Material[];
  filteredMaterials?: Material[];
}

interface SkuOption {
  code: string;
  name: string;
}

interface ColumnMap {
  category: number;
  skuCode: number;
  skuName: number;
  qtyPerUnit: number;
  unit: number;
  qtyPerPack: number;
  unit2: number;
  raw: number;
  qtyBatch: number;
  unit4: number;
  type: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.css']
})
export class DashboardComponent implements OnInit {
  // Data
  masterData: MasterData[] = [];
  requisitionRows: RequisitionRow[] = [];
  categories: string[] = [];
  filteredSkus: SkuOption[] = [];
  paginatedItems: RequisitionRow[] = [];
  
  // Filters & Selection
  selectedCategory: string = '';
  selectedSku: string = '';
  skuCode: string = '';
  searchQuery: string = '';
  sortField: string | null = null;
  sortAsc: boolean = true;
  
  // UI State
  expandedRows = new Set<number>();
  isDarkMode: boolean = false;
  isSyncEnabled: boolean = false;
  showExportDropdown: boolean = false;
  
  // Pagination
  currentPage: number = 1;
  itemsPerPage: number = 8;
  totalPages: number = 1;
  
  // File
  uploadedFileName: string = '';
  
  // Cloud Sync
  private readonly SHEETS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbztJ9Jo77aonmowokGYUbHWY4cNWXH0_Z2qmIhxvFV1fqykCFcGKrWcQ7PCj-flsutRvQ/exec";
  private lastSyncTime: string | null = null;
  private syncInProgress: boolean = false;
  
  @ViewChild('snackbarContainer', { static: false }) snackbarContainer!: ElementRef;
  
  // Type mapping
  private typeMapping: Record<string, string[]> = {
    'meat-veg': ['raw', 'meat', 'chicken', 'pork', 'beef', 'fish', 'veggies', 'vegetables', 'vegetable', 'veg'],
    'pre-mix': ['pre-mix', 'premix'],
    'packaging': ['packaging']
  };

  constructor(
    private renderer: Renderer2,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadFromLocalStorage();
    this.loadSyncConfig();
    this.setupTheme();
    this.renderPage();
  }

  // Theme & UI
  setupTheme() {
    this.isDarkMode = localStorage.getItem('darkMode') === 'true';
    if (this.isDarkMode) {
      document.body.classList.add('dark-mode');
    }
  }

  toggleDarkMode() {
    this.isDarkMode = !this.isDarkMode;
    if (this.isDarkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
    localStorage.setItem('darkMode', this.isDarkMode.toString());
  }

  // Logout
  async logout() {
    if (confirm('Are you sure you want to logout?')) {
      try {
        await this.authService.logout();
        this.showSnackbar('Logged out successfully', 'success');
        
        // Clear dashboard data from local storage
        localStorage.removeItem('requisitionData');
        
        // Redirect to login after a short delay
        setTimeout(() => {
          this.router.navigate(['/login']);
        }, 1500);
      } catch (error) {
        console.error('Logout error:', error);
        this.showSnackbar('Logout failed. Please try again.', 'error');
      }
    }
  }

  // File Handling
  handleFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.uploadedFileName = file.name;
    const reader = new FileReader();
    
    reader.onload = (e: ProgressEvent<FileReader>) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        
        if (rows.length < 2) throw new Error('File has no data rows.');
        
        const headerRow = rows[0].map((h: any) => h.toString().trim().toLowerCase());
        
        const col: ColumnMap = { 
          category: headerRow.findIndex((h: string) => h.includes('category')),
          skuCode: headerRow.findIndex((h: string) => h.includes('sku') && h.includes('code')),
          skuName: headerRow.findIndex((h: string) => h.includes('sku') && !h.includes('code') && !h.includes('quantity')),
          qtyPerUnit: headerRow.findIndex((h: string) => h.includes('quantity') && h.includes('per') && h.includes('unit') && !h.includes('pack')),
          unit: headerRow.findIndex((h: string) => h === 'unit' && !h.includes('2') && !h.includes('4') && !h.includes('pack') && !h.includes('batch')),
          qtyPerPack: headerRow.findIndex((h: string) => h.includes('quantity') && h.includes('per') && h.includes('pack')),
          unit2: headerRow.findIndex((h: string) => h === 'unit2' || (h.includes('unit') && (headerRow[headerRow.indexOf(h)-1] || '').includes('pack'))),
          raw: headerRow.findIndex((h: string) => h.includes('raw') && h.includes('material')),
          qtyBatch: headerRow.findIndex((h: string) => h.includes('quantity') && h.includes('batch')),
          unit4: headerRow.findIndex((h: string) => h.includes('unit') && (h.includes('4') || (headerRow[headerRow.indexOf(h)-1] || '').includes('batch'))),
          type: headerRow.findIndex((h: string) => h === 'type' || h.includes('type'))
        };

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

        if (this.masterData.length === 0) throw new Error('No valid data rows found.');
        
        this.populateCategories();
        this.saveToLocalStorage();
        this.showSnackbar(`Loaded ${this.masterData.length} items`, 'success');
        
      } catch (error: any) {
        this.showSnackbar('Upload failed: ' + error.message, 'error');
      }
    };
    
    reader.onerror = () => {
      this.showSnackbar('Failed to read file', 'error');
    };
    
    reader.readAsArrayBuffer(file);
  }

  populateCategories() {
    this.categories = [...new Set(this.masterData.map(r => r['CATEGORY']).filter(Boolean))].sort();
  }

  onCategoryChange() {
    this.filteredSkus = [];
    this.selectedSku = '';
    this.skuCode = '';
    
    if (!this.selectedCategory) return;
    
    const map = new Map<string, string>();
    this.masterData
      .filter(r => r['CATEGORY'] === this.selectedCategory && r['SKU'] && r['SKU CODE'])
      .forEach(r => {
        const sku = r['SKU'].trim();
        const code = r['SKU CODE'].trim();
        if (sku && code && !map.has(sku)) map.set(sku, code);
      });

    this.filteredSkus = Array.from(map)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, code]) => ({ name, code }));
  }

  onSkuChange() {
    this.skuCode = this.selectedSku;
  }

  addSku() {
    if (!this.selectedSku || !this.selectedCategory) return;
    
    const skuOption = this.filteredSkus.find(s => s.code === this.selectedSku);
    if (!skuOption) return;
    
    const skuName = skuOption.name;
    const skuInfo = this.masterData.find(r => 
      r['SKU CODE'] === this.selectedSku && 
      r['SKU'] === skuName
    );
    
    if (!skuInfo) {
      this.showSnackbar('SKU not found in master data', 'error');
      return;
    }

    const mats = this.masterData
      .filter(r => r['SKU CODE'] === this.selectedSku && r['SKU'] === skuInfo['SKU'] && r['RAW MATERIAL'])
      .map(r => ({ 
        name: r['RAW MATERIAL'], 
        qty: r['QUANTITY/BATCH'], 
        unit: r['UNIT4'],
        type: r['TYPE'] || ''
      }));

    if (!mats.length) {
      this.showSnackbar('No raw materials found for this SKU', 'error');
      return;
    }

    this.requisitionRows.push({ 
      skuCode: this.selectedSku, 
      skuName: skuName, 
      category: this.selectedCategory, 
      qtyNeeded: 1, 
      supplier: '', 
      qtyPerUnit: skuInfo['QUANTITY PER UNIT'] || '',
      unit: skuInfo['UNIT'] || '',
      qtyPerPack: skuInfo['QUANTITY PER PACK'] || '',
      unit2: skuInfo['UNIT2'] || '',
      materials: mats,
      filteredMaterials: [...mats]
    });

    this.selectedSku = '';
    this.skuCode = '';
    this.saveToLocalStorage();
    this.renderPage();
    this.showSnackbar('SKU added successfully', 'success');
  }

  // Table Operations
  toggleRow(index: number) {
    if (this.expandedRows.has(index)) {
      this.expandedRows.delete(index);
    } else {
      this.expandedRows.add(index);
    }
  }

  updateQuantity(item: RequisitionRow, event: Event) {
    const input = event.target as HTMLInputElement;
    item.qtyNeeded = Math.max(1, Math.min(99, parseInt(input.value) || 1));
    this.saveToLocalStorage();
  }

  updateSupplier(item: RequisitionRow, event: Event) {
    const input = event.target as HTMLInputElement;
    item.supplier = input.value.trim();
    this.saveToLocalStorage();
  }

  removeItem(index: number) {
    if (confirm('Remove this item?')) {
      this.requisitionRows.splice(index, 1);
      this.saveToLocalStorage();
      this.renderPage();
      this.showSnackbar('Item removed', 'error');
    }
  }

  filterMaterials(index: number, event: Event) {
    const select = event.target as HTMLSelectElement;
    const value = select.value;
    const item = this.requisitionRows[index];
    
    if (!value) {
      item.filteredMaterials = [...item.materials];
    } else {
      item.filteredMaterials = item.materials.filter(m => 
        this.mapTypeToFilter(m.type) === value
      );
    }
  }

  getFilteredMaterials(index: number): Material[] {
    return this.requisitionRows[index].filteredMaterials || this.requisitionRows[index].materials;
  }

  getUniqueTypes(materials: Material[]): string[] {
    const types = new Set(materials.map(m => this.mapTypeToFilter(m.type)).filter(Boolean));
    return Array.from(types).sort();
  }

  getTypeDisplayName(type: string): string {
    switch(type) {
      case 'meat-veg': return 'Meat & Vegetables';
      case 'pre-mix': return 'Pre-mix';
      case 'packaging': return 'Packaging';
      default: return type;
    }
  }

  mapTypeToFilter(type: string): string {
    if (!type) return '';
    const lowerType = type.toLowerCase().trim();
    for (const [filterType, keywords] of Object.entries(this.typeMapping)) {
      if (keywords.some(keyword => lowerType.includes(keyword))) {
        return filterType;
      }
    }
    return '';
  }

  // Helper method for template
  calculateTotal(qty: string, multiplier: number): string {
    const parsedQty = parseFloat(qty) || 0;
    const total = parsedQty * multiplier;
    // Return as string with 2 decimal places if needed
    return total % 1 === 0 ? total.toString() : total.toFixed(2);
  }

  // Sorting & Searching
  sortBy(field: string) {
    if (this.sortField === field) {
      this.sortAsc = !this.sortAsc;
    } else {
      this.sortField = field;
      this.sortAsc = true;
    }
    this.currentPage = 1;
    this.renderPage();
  }

  onSearch() {
    this.currentPage = 1;
    this.renderPage();
  }

  // Pagination
  renderPage() {
    let items = [...this.requisitionRows];
    
    // Apply search filter
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      items = items.filter(i =>
        i.skuCode.toLowerCase().includes(query) ||
        i.skuName.toLowerCase().includes(query) ||
        i.category.toLowerCase().includes(query)
      );
    }
    
    // Apply sorting
    if (this.sortField) {
      items.sort((a, b) => {
        const aValue = (a as any)[this.sortField!]?.toString().toLowerCase() || '';
        const bValue = (b as any)[this.sortField!]?.toString().toLowerCase() || '';
        return (aValue < bValue ? -1 : aValue > bValue ? 1 : 0) * (this.sortAsc ? 1 : -1);
      });
    }
    
    // Paginate
    this.totalPages = Math.ceil(items.length / this.itemsPerPage) || 1;
    const start = (this.currentPage - 1) * this.itemsPerPage;
    const end = start + this.itemsPerPage;
    this.paginatedItems = items.slice(start, end);
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.renderPage();
    }
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.renderPage();
    }
  }

  // Export
  toggleExportDropdown() {
    this.showExportDropdown = !this.showExportDropdown;
  }

  exportData(exportType: string = 'all') {
    if (!this.requisitionRows.length) {
      this.showSnackbar('No data to export', 'error');
      return;
    }

    let items = [...this.requisitionRows];
    if (this.sortField) {
      items.sort((a, b) => {
        const aValue = (a as any)[this.sortField!]?.toString().toLowerCase() || '';
        const bValue = (b as any)[this.sortField!]?.toString().toLowerCase() || '';
        return (aValue < bValue ? -1 : aValue > bValue ? 1 : 0) * (this.sortAsc ? 1 : -1);
      });
    }

    const displayName = this.getExportTypeDisplayName(exportType);
    const data = [
      ['RAW MATERIAL REQUISITION'],
      ['Generated', new Date().toLocaleString('en-PH')],
      ['Master File', this.uploadedFileName || 'None'],
      ['Export Type', displayName],
      [''],
      ['SKU Code', 'SKU', 'Category', 'Qty Needed', 'Supplier', 'Raw Material', 'Qty/Batch', 'Unit', 'Type', 'Total Required']
    ];

    items.forEach(item => {
      if (!item.materials?.length) return;
      
      let materialsToExport = item.materials;
      if (exportType !== 'all') {
        materialsToExport = item.materials.filter(m => this.mapTypeToFilter(m.type) === exportType);
      }
      if (materialsToExport.length === 0) return;

      materialsToExport.forEach((m, index) => {
        const totalQty = (parseFloat(m.qty) || 0) * item.qtyNeeded;
        const total = totalQty + (m.unit ? ' ' + m.unit : '');

        if (index === 0) {
          data.push([
            item.skuCode, item.skuName, item.category, item.qtyNeeded.toString(), item.supplier || '',
            m.name, m.qty, m.unit || '', m.type || '', total
          ]);
        } else {
          data.push(['', '', '', '', '', m.name, m.qty, m.unit || '', m.type || '', total]);
        }
      });
    });

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [
      {wch:12},{wch:30},{wch:15},{wch:10},{wch:20},
      {wch:35},{wch:12},{wch:8},{wch:10},{wch:16}
    ];

    // FIX: Added safe handling for ws['!ref'] which can be undefined
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cell = ws[XLSX.utils.encode_cell({r:4, c:C})];
      if (cell) cell.s = { font: { bold: true } };
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Requisition');
    
    const fileName = `Requisition_${exportType === 'all' ? 'All' : displayName.replace(/&/g, 'and').replace(/\s+/g, '')}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`;
    
    XLSX.writeFile(wb, fileName);
    
    this.showExportDropdown = false;
    this.showSnackbar('Export completed', 'success');
  }

  getExportTypeDisplayName(exportType: string): string {
    switch(exportType) {
      case 'all': return 'All Data';
      case 'pre-mix': return 'Pre-mix Only';
      case 'packaging': return 'Packaging Only';
      case 'meat-veg': return 'Meat & Vegetables Only';
      default: return 'All Data';
    }
  }

  // Cloud Sync
  loadSyncConfig() {
    this.isSyncEnabled = localStorage.getItem('syncEnabled') === 'true';
    this.lastSyncTime = localStorage.getItem('lastSyncTime');
  }

  getSyncStatusText(): string {
    if (!this.isSyncEnabled) return 'Local only';
    
    if (this.lastSyncTime) {
      const date = new Date(this.lastSyncTime);
      return `Last sync: ${date.toLocaleTimeString()}`;
    }
    
    return 'Auto-sync ON';
  }

  async toggleSync() {
    this.isSyncEnabled = !this.isSyncEnabled;
    localStorage.setItem('syncEnabled', this.isSyncEnabled.toString());
    
    if (this.isSyncEnabled) {
      this.showSnackbar('Cloud sync enabled', 'success');
      try {
        await this.syncToCloud();
      } catch (e) {
        this.showSnackbar('Sync enabled – will retry on next save', 'info');
      }
    } else {
      this.showSnackbar('Sync disabled – local only', 'info');
    }
  }

  async restoreFromCloud() {
    if (!confirm('Restore from cloud? This will replace all local data.')) return;

    try {
      const response = await fetch(this.SHEETS_WEB_APP_URL);
      if (!response.ok) throw new Error('Failed to reach server');
      
      const text = await response.text();
      if (!text || text.includes('error')) {
        alert('No backup found in cloud yet.');
        return;
      }

      const data = JSON.parse(text);
      this.requisitionRows = data.requisitionRows || [];
      this.masterData = data.masterData || [];
      this.uploadedFileName = data.uploadedFileName || '';

      if (this.masterData.length) this.populateCategories();
      
      this.saveToLocalStorage();
      this.renderPage();
      this.showSnackbar('Restored from cloud!', 'success');
      
    } catch (error: any) {
      this.showSnackbar('Restore failed: ' + error.message, 'error');
    }
  }

  async syncToCloud() {
    if (!this.isSyncEnabled || this.syncInProgress) return;
    
    this.syncInProgress = true;
    try {
      const payload = {
        requisitionRows: this.requisitionRows,
        masterData: this.masterData,
        uploadedFileName: this.uploadedFileName,
        lastModified: new Date().toISOString(),
        device: navigator.userAgent.substring(0, 80)
      };
      
      const response = await fetch(this.SHEETS_WEB_APP_URL, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }
      });
      
      if (!response.ok) throw new Error('Network error');
      
      this.lastSyncTime = new Date().toISOString();
      localStorage.setItem('lastSyncTime', this.lastSyncTime);
      
    } catch (error) {
      console.warn('Sync failed:', error);
    } finally {
      this.syncInProgress = false;
    }
  }

  // Utilities
  clearFile() {
    this.masterData = [];
    this.categories = [];
    this.selectedCategory = '';
    this.selectedSku = '';
    this.skuCode = '';
    this.uploadedFileName = '';
    this.saveToLocalStorage();
    this.renderPage();
  }

  clearAll() {
    if (!confirm('Clear all data?')) return;
    
    this.requisitionRows = [];
    this.masterData = [];
    this.categories = [];
    this.selectedCategory = '';
    this.selectedSku = '';
    this.skuCode = '';
    this.uploadedFileName = '';
    this.searchQuery = '';
    this.sortField = null;
    this.currentPage = 1;
    this.expandedRows.clear();
    
    this.saveToLocalStorage();
    this.renderPage();
    this.showSnackbar('All data cleared', 'info');
  }

  printTable() {
    window.print();
  }

  // Local Storage
  saveToLocalStorage() {
    const data = {
      requisitionRows: this.requisitionRows,
      masterData: this.masterData,
      uploadedFileName: this.uploadedFileName,
      lastModified: new Date().toISOString()
    };
    localStorage.setItem('requisitionData', JSON.stringify(data));
    
    if (this.isSyncEnabled) {
      this.syncToCloud();
    }
  }

  loadFromLocalStorage() {
    const saved = localStorage.getItem('requisitionData');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        this.requisitionRows = data.requisitionRows || [];
        this.masterData = data.masterData || [];
        this.uploadedFileName = data.uploadedFileName || '';
        
        if (this.masterData.length) this.populateCategories();
      } catch (e) {
        console.error('Failed to load saved data:', e);
      }
    }
  }

  // Snackbar
  showSnackbar(message: string, type: 'success' | 'error' | 'info' = 'info', duration: number = 3000) {
    const container = this.snackbarContainer?.nativeElement;
    if (!container) return;

    const snack = this.renderer.createElement('div');
    
    // Use bracket notation for type-safe access
    const iconMap: Record<string, string> = { 
      success: 'fa-check-circle', 
      error: 'fa-exclamation-triangle', 
      info: 'fa-info-circle' 
    };
    
    this.renderer.addClass(snack, 'snackbar');
    this.renderer.addClass(snack, type);
    
    const icon = this.renderer.createElement('i');
    this.renderer.addClass(icon, 'fas');
    this.renderer.addClass(icon, iconMap[type] || iconMap['info']);
    
    const text = this.renderer.createElement('span');
    this.renderer.appendChild(text, this.renderer.createText(message));
    
    this.renderer.appendChild(snack, icon);
    this.renderer.appendChild(snack, text);
    this.renderer.appendChild(container, snack);
    
    setTimeout(() => {
      this.renderer.addClass(snack, 'show');
    }, 10);

    setTimeout(() => {
      this.renderer.removeClass(snack, 'show');
      setTimeout(() => {
        if (snack.parentNode === container) {
          this.renderer.removeChild(container, snack);
        }
      }, 400);
    }, duration);
  }
}