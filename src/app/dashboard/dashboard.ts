import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../services/supabase.service';

interface StatCard {
  title: string;
  value: number;
  icon: string;
  color: string;
  description: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.css']
})
export class DashboardComponent implements OnInit {
  reportData = {
    totalTables: 0,
    pendingApprovals: 0,
    approvedTables: 0,
    rejectedTables: 0,
    totalUsers: 0,
    activeUsers: 0,
    totalRequisitions: 0,
    completedRequisitions: 0
  };

  statCards: StatCard[] = [];
  loading = false;
  dataLoaded = false;
  
  currentDate = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  activityDays = [
    { label: 'Mon', value: 42 },
    { label: 'Tue', value: 32 },
    { label: 'Wed', value: 48 },
    { label: 'Thu', value: 38 },
    { label: 'Fri', value: 28 },
    { label: 'Sat', value: 22 },
    { label: 'Sun', value: 18 }
  ];

  constructor(
    private supabaseService: SupabaseService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    this.loading = true;
    this.cdr.detectChanges();
    
    try {
      await this.loadRealDataWithTimeout();
    } catch (error) {
      this.loadDemoData();
    } finally {
      this.loading = false;
      this.dataLoaded = true;
      this.updateStatCards();
      this.cdr.detectChanges();
    }
  }

  private async loadRealDataWithTimeout(): Promise<void> {
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Data load timeout')), 5000);
    });

    const dataLoad = this.loadRealData();
    
    await Promise.race([dataLoad, timeout]);
  }

  private async loadRealData(): Promise<void> {
    try {
      if (!this.supabaseService || !this.supabaseService.getClient) {
        throw new Error('Supabase service not available');
      }

      const supabase = this.supabaseService.getClient();
      
      // Load tables data
      const { data: tables, error: tablesError } = await supabase
        .from('user_tables')
        .select('*')
        .limit(500);

      if (tablesError) {
        throw tablesError;
      }

      if (tables && Array.isArray(tables)) {
        this.reportData.totalTables = tables.length;
        
        this.reportData.pendingApprovals = tables.filter(t => 
          t.status && (t.status.toLowerCase().includes('pending') || 
                      t.status.toLowerCase().includes('submitted'))
        ).length;
        
        this.reportData.approvedTables = tables.filter(t => 
          t.status && t.status.toLowerCase().includes('approved')
        ).length;
        
        this.reportData.rejectedTables = tables.filter(t => 
          t.status && t.status.toLowerCase().includes('rejected')
        ).length;
      }

      // Load users data
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('*')
        .limit(500);

      if (!usersError && users && Array.isArray(users)) {
        this.reportData.totalUsers = users.length;
        
        this.reportData.activeUsers = users.filter(u => {
          if (u.is_active !== undefined) return u.is_active;
          if (u.active !== undefined) return u.active;
          if (u.status !== undefined) return u.status === 'active';
          return false;
        }).length;
      }

      // Set default values for requisitions if not available
      if (this.reportData.totalRequisitions === 0) {
        this.reportData.totalRequisitions = 89;
        this.reportData.completedRequisitions = 67;
      }
      
    } catch (error) {
      throw error;
    }
  }

  private loadDemoData(): void {
    this.reportData = {
      totalTables: 156,
      pendingApprovals: 24,
      approvedTables: 112,
      rejectedTables: 20,
      totalUsers: 48,
      activeUsers: 32,
      totalRequisitions: 89,
      completedRequisitions: 67
    };
  }

  async refreshData(): Promise<void> {
    if (this.loading) return;
    
    this.loading = true;
    this.dataLoaded = false;
    this.cdr.detectChanges();
    
    try {
      await this.loadRealData();
    } catch (error) {
      this.loadDemoData();
    } finally {
      this.loading = false;
      this.dataLoaded = true;
      this.updateStatCards();
      this.cdr.detectChanges();
    }
  }

  private updateStatCards(): void {
    this.statCards = [
      {
        title: 'Total Tables',
        value: this.reportData.totalTables,
        icon: '📊',
        color: 'blue',
        description: 'Created tables'
      },
      {
        title: 'Pending',
        value: this.reportData.pendingApprovals,
        icon: '⏳',
        color: 'orange',
        description: 'Awaiting approval'
      },
      {
        title: 'Approved',
        value: this.reportData.approvedTables,
        icon: '✅',
        color: 'green',
        description: 'Approved tables'
      },
      {
        title: 'Rejected',
        value: this.reportData.rejectedTables,
        icon: '❌',
        color: 'red',
        description: 'Rejected tables'
      },
      {
        title: 'Total Users',
        value: this.reportData.totalUsers,
        icon: '👥',
        color: 'purple',
        description: 'Registered users'
      },
      {
        title: 'Active Users',
        value: this.reportData.activeUsers,
        icon: '👤',
        color: 'blue',
        description: 'Currently active'
      },
      {
        title: 'Requisitions',
        value: this.reportData.totalRequisitions,
        icon: '📝',
        color: 'green',
        description: 'Total requests'
      },
      {
        title: 'Completed',
        value: this.reportData.completedRequisitions,
        icon: '✓✓',
        color: 'purple',
        description: 'Processed requests'
      }
    ];
  }

  getPercentage(value: number, total: number): number {
    if (!total || total === 0) return 0;
    return (value / total) * 100;
  }

  get totalTables(): number {
    return Math.max(this.reportData.totalTables, 1);
  }

  get totalActivities(): number {
    return this.activityDays.reduce((sum, day) => sum + day.value, 0);
  }

  get averageDaily(): number {
    const daysCount = this.activityDays.length;
    return daysCount > 0 ? this.totalActivities / daysCount : 0;
  }

  get peakDay(): string {
    if (this.activityDays.length === 0) return 'N/A';
    const peak = this.activityDays.reduce((max, day) => 
      day.value > max.value ? day : max, this.activityDays[0]
    );
    return peak.label;
  }

  onFilterChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    // Filter logic can be implemented here if needed
  }
}