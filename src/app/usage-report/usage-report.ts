import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DatabaseService } from '../services/database.service';
import * as XLSX from 'xlsx';

interface UsageDataItem {
  material_name: string;
  material_type: string;
  unit: string;
  total_quantity: number;
  table_count: number;
  sku_count: number;
  tables: string[];
  skus: string[];
}

interface TypeBreakdown {
  type: string;
  material_count: number;
  total_quantity: number;
  percentage: number;
}

@Component({
  selector: 'app-usage-report',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './usage-report.html',
  styleUrls: ['./usage-report.css']
})
export class UsageReportComponent implements OnInit {
  userTables: any[] = [];
  selectedTableId: string = 'all';
  
  usageData: UsageDataItem[] = [];
  filteredData: UsageDataItem[] = [];
  paginatedData: UsageDataItem[] = [];
  typeBreakdown: TypeBreakdown[] = [];
  
  isLoading: boolean = false;
  currentUser: any = null;
  
  currentPage: number = 1;
  itemsPerPage: number = 15;
  totalPages: number = 1;
  
  sortField: string = 'total_quantity';
  sortAsc: boolean = false;
  
  totalMaterials: number = 0;
  totalQuantity: number = 0;
  totalTables: number = 0;
  
  showSnackbar: boolean = false;
  snackbarMessage: string = '';
  snackbarType: 'success' | 'error' | 'info' = 'info';
  private snackbarTimeout: any;

  constructor(
    private dbService: DatabaseService,
    private cdRef: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    await this.initializeUser();
    await this.loadUserTables();
    await this.loadUsageData();
  }

  private async initializeUser(): Promise<void> {
    try {
      this.currentUser = await this.dbService.getCurrentUser();
      if (!this.currentUser) {
        this.showSnackbarMessage('Please log in to view usage reports', 'error');
      }
    } catch (error) {
      console.error('Error initializing user:', error);
      this.showSnackbarMessage('Authentication error', 'error');
    }
  }

  private async loadUserTables(): Promise<void> {
    try {
      if (!this.currentUser) return;

      this.userTables = await this.dbService.getUserTables(this.currentUser.id);
      console.log('Loaded user tables:', this.userTables);
      this.cdRef.detectChanges();
    } catch (error) {
      console.error('Error loading user tables:', error);
      this.showSnackbarMessage('Failed to load tables', 'error');
    }
  }

  async loadUsageData(): Promise<void> {
    this.isLoading = true;
    try {
      if (!this.currentUser) {
        this.showSnackbarMessage('Please log in to view usage reports', 'error');
        this.isLoading = false;
        return;
      }

      console.log('Loading usage data for table:', this.selectedTableId);
      
      let allRequisitions: any[] = [];

      for (const table of this.userTables) {
        if (this.selectedTableId !== 'all' && table.id !== this.selectedTableId) {
          continue;
        }

        const requisitions = await this.dbService.getTableRequisitions(table.id);
        console.log(`Found ${requisitions.length} requisitions for table:`, table.name);
        
        if (requisitions && requisitions.length > 0) {
          requisitions.forEach((req: any) => {
            req.table_name = table.name;
            req.table_id = table.id;
          });
          
          allRequisitions = [...allRequisitions, ...requisitions];
        }
      }

      console.log('Total requisitions found:', allRequisitions.length);

      await this.processUsageData(allRequisitions);
      
      this.isLoading = false;
      this.cdRef.detectChanges();
      
      if (this.usageData.length === 0) {
        console.log('No usage data found after processing');
        this.showSnackbarMessage('No usage data found for the selected table(s)', 'info');
      }
      
    } catch (error) {
      console.error('Error loading usage data:', error);
      this.showSnackbarMessage('Failed to load usage data', 'error');
      this.isLoading = false;
      this.cdRef.detectChanges();
    }
  }

  private async processUsageData(requisitions: any[]): Promise<void> {
    if (!requisitions || requisitions.length === 0) {
      this.usageData = [];
      this.filteredData = [];
      this.updatePagination();
      this.showSnackbarMessage('No requisitions found to process', 'info');
      return;
    }

    console.log('Processing requisitions:', requisitions);
    
    const materialMap = new Map<string, {
      material_name: string;
      material_type: string;
      unit: string;
      total_quantity: number;
      tables: Set<string>;
      skus: Set<string>;
    }>();

    let processedRequisitions = 0;
    let processedMaterials = 0;

    for (const req of requisitions) {
      if (!req) continue;
      
      processedRequisitions++;
      const tableName = req.table_name || `Table ${req.id?.substring(0, 8)}`;
      const skuName = req.sku_name || 'Unknown SKU';
      
      let materials: any[] = [];
      
      if (req.materials && Array.isArray(req.materials) && req.materials.length > 0) {
        materials = req.materials;
      } else if (req.id) {
        console.log(`Loading materials for requisition ${req.id}`);
        try {
          materials = await this.dbService.getRequisitionMaterials(req.id);
        } catch (error) {
          console.error(`Error loading materials for requisition ${req.id}:`, error);
        }
      }

      console.log(`Found ${materials.length} materials for SKU: ${skuName}`);
      
      for (const material of materials) {
        if (!material || !material.material_name) continue;
        
        processedMaterials++;
        
        const key = `${material.material_name.toLowerCase()}|${material.unit || ''}`;
        const quantity = material.required_qty || 0;
        
        if (!materialMap.has(key)) {
          materialMap.set(key, {
            material_name: material.material_name,
            material_type: material.type || this.determineMaterialType(material.material_name),
            unit: material.unit || '',
            total_quantity: 0,
            tables: new Set<string>(),
            skus: new Set<string>()
          });
        }
        
        const materialData = materialMap.get(key)!;
        materialData.total_quantity += quantity;
        materialData.tables.add(tableName);
        materialData.skus.add(`${skuName} (Qty: ${req.qty_needed || 1})`);
      }
    }

    console.log(`Processed ${processedRequisitions} requisitions with ${processedMaterials} materials`);
    console.log(`Created ${materialMap.size} unique material entries`);

    this.usageData = Array.from(materialMap.values()).map(item => ({
      material_name: item.material_name,
      material_type: item.material_type,
      unit: item.unit || '-',
      total_quantity: item.total_quantity,
      table_count: item.tables.size,
      sku_count: item.skus.size,
      tables: Array.from(item.tables),
      skus: Array.from(item.skus)
    }));

    console.log('Processed usage data:', this.usageData);

    this.totalMaterials = this.usageData.length;
    this.totalQuantity = this.usageData.reduce((sum, item) => sum + item.total_quantity, 0);
    this.totalTables = new Set(this.usageData.flatMap(item => item.tables)).size;

    this.generateTypeBreakdown();
    this.applySorting();
    this.updatePagination();
  }

  private determineMaterialType(materialName: string): string {
    const name = materialName.toLowerCase();
    
    if (name.includes('meat') || name.includes('chicken') || name.includes('pork') || 
        name.includes('beef') || name.includes('fish')) {
      return 'Meat & Poultry';
    } else if (name.includes('vegetable') || name.includes('veg') || name.includes('onion') || 
               name.includes('garlic') || name.includes('pepper') || name.includes('tomato')) {
      return 'Vegetables';
    } else if (name.includes('spice') || name.includes('seasoning') || name.includes('powder') || 
               name.includes('mix') || name.includes('premix')) {
      return 'Spices & Seasonings';
    } else if (name.includes('packaging') || name.includes('bag') || name.includes('box') || 
               name.includes('container') || name.includes('wrapper')) {
      return 'Packaging';
    } else if (name.includes('oil') || name.includes('sauce') || name.includes('soy') || 
               name.includes('vinegar')) {
      return 'Liquids & Sauces';
    }
    
    return 'Other';
  }

  private generateTypeBreakdown(): void {
    const typeMap = new Map<string, { material_count: number; total_quantity: number }>();

    for (const item of this.usageData) {
      const type = item.material_type || 'Other';
      
      if (!typeMap.has(type)) {
        typeMap.set(type, { material_count: 0, total_quantity: 0 });
      }
      
      const typeData = typeMap.get(type)!;
      typeData.material_count += 1;
      typeData.total_quantity += item.total_quantity;
    }

    this.typeBreakdown = Array.from(typeMap.entries()).map(([type, data]) => ({
      type,
      material_count: data.material_count,
      total_quantity: data.total_quantity,
      percentage: this.totalQuantity > 0 ? (data.total_quantity / this.totalQuantity) * 100 : 0
    })).sort((a, b) => b.total_quantity - a.total_quantity);
  }

  sortData(field: string): void {
    if (this.sortField === field) {
      this.sortAsc = !this.sortAsc;
    } else {
      this.sortField = field;
      this.sortAsc = true;
    }
    
    this.applySorting();
    this.updatePagination();
  }

  private applySorting(): void {
    this.filteredData = [...this.usageData].sort((a: any, b: any) => {
      let aVal = a[this.sortField];
      let bVal = b[this.sortField];
      
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }
      
      if (aVal < bVal) return this.sortAsc ? -1 : 1;
      if (aVal > bVal) return this.sortAsc ? 1 : -1;
      return 0;
    });
  }

  private updatePagination(): void {
    this.totalPages = Math.ceil(this.filteredData.length / this.itemsPerPage);
    this.currentPage = Math.min(this.currentPage, this.totalPages || 1);
    
    const start = (this.currentPage - 1) * this.itemsPerPage;
    const end = start + this.itemsPerPage;
    this.paginatedData = this.filteredData.slice(start, end);
  }

  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.updatePagination();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.updatePagination();
    }
  }

  getTypeClass(type: string): string {
    const lowerType = (type || '').toLowerCase();
    
    if (lowerType.includes('meat') || lowerType.includes('poultry') || lowerType.includes('chicken') || 
        lowerType.includes('pork') || lowerType.includes('beef') || lowerType.includes('fish')) {
      return 'meat-veg';
    } else if (lowerType.includes('vegetable') || lowerType.includes('veg')) {
      return 'meat-veg';
    } else if (lowerType.includes('spice') || lowerType.includes('seasoning') || lowerType.includes('mix')) {
      return 'spice';
    } else if (lowerType.includes('packaging')) {
      return 'packaging';
    } else if (lowerType.includes('liquid') || lowerType.includes('sauce') || lowerType.includes('oil')) {
      return 'liquid';
    }
    return 'other';
  }

  async exportToExcel(): Promise<void> {
    if (this.usageData.length === 0) {
      this.showSnackbarMessage('No data to export', 'error');
      return;
    }

    try {
      const workbook = XLSX.utils.book_new();
      
      const mainData: any[][] = [
        ['Raw Material Usage Report'],
        ['Generated', new Date().toLocaleString('en-PH')],
        ['Table Filter', this.selectedTableId === 'all' ? 'All Tables' : 
          this.userTables.find(t => t.id === this.selectedTableId)?.name || this.selectedTableId],
        ['Total Materials', this.totalMaterials.toString()],
        ['Total Quantity', this.totalQuantity.toFixed(2)],
        ['Total Tables', this.totalTables.toString()],
        [],
        ['Raw Material', 'Type', 'Unit', 'Total Required', 'Tables Used', 'SKUs Used In', 'Table Names']
      ];

      this.usageData.forEach(item => {
        mainData.push([
          item.material_name,
          item.material_type,
          item.unit,
          item.total_quantity,
          item.table_count,
          item.sku_count,
          item.tables.join(', ')
        ]);
      });

      const mainSheet = XLSX.utils.aoa_to_sheet(mainData);
      
      const colWidths = [
        { wch: 30 },
        { wch: 20 },
        { wch: 10 },
        { wch: 15 },
        { wch: 12 },
        { wch: 12 },
        { wch: 40 }
      ];
      mainSheet['!cols'] = colWidths;
      
      XLSX.utils.book_append_sheet(workbook, mainSheet, 'Usage Report');

      const breakdownData: any[][] = [
        ['Material Type Breakdown'],
        ['Generated', new Date().toLocaleString('en-PH')],
        [],
        ['Type', 'Material Count', 'Total Quantity', 'Percentage']
      ];

      this.typeBreakdown.forEach(item => {
        breakdownData.push([
          item.type,
          item.material_count.toString(),
          item.total_quantity.toFixed(2),
          `${item.percentage.toFixed(1)}%`
        ]);
      });

      const breakdownSheet = XLSX.utils.aoa_to_sheet(breakdownData);
      
      breakdownSheet['!cols'] = [
        { wch: 25 },
        { wch: 15 },
        { wch: 15 },
        { wch: 15 }
      ];
      
      XLSX.utils.book_append_sheet(workbook, breakdownSheet, 'Type Breakdown');

      const tableName = this.selectedTableId === 'all' ? 'AllTables' : 
        this.userTables.find(t => t.id === this.selectedTableId)?.name?.replace(/\s+/g, '_') || this.selectedTableId;
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const fileName = `Material_Usage_${tableName}_${dateStr}.xlsx`;

      XLSX.writeFile(workbook, fileName);
      this.showSnackbarMessage('Report exported successfully!', 'success');
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      this.showSnackbarMessage('Failed to export report', 'error');
    }
  }

  private showSnackbarMessage(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    if (this.snackbarTimeout) clearTimeout(this.snackbarTimeout);
    this.snackbarMessage = message;
    this.snackbarType = type;
    this.showSnackbar = true;
    
    this.snackbarTimeout = setTimeout(() => {
      this.hideSnackbar();
    }, 3000);
    
    this.cdRef.detectChanges();
  }

  hideSnackbar(): void {
    this.showSnackbar = false;
    if (this.snackbarTimeout) clearTimeout(this.snackbarTimeout);
    this.cdRef.detectChanges();
  }

  getSnackbarIcon(): string {
    switch (this.snackbarType) {
      case 'success': return '✓';
      case 'error': return '✕';
      case 'info': 
      default: return 'ⓘ';
    }
  }
}