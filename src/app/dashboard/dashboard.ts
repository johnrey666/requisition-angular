import { Component, OnInit } from '@angular/core';
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
  template: `
    <div class="dashboard">
      <!-- Header -->
      <header class="dashboard-header">
        <div>
          <h1>Dashboard</h1>
          <p class="header-subtitle">Raw Material E-Portal Analytics</p>
        </div>
        <div class="header-actions">
          <div class="current-date">
            {{ currentDate }}
          </div>
          <button class="refresh-btn" (click)="refreshData()" [disabled]="loading">
            <svg class="refresh-icon" [class.spinning]="loading" width="16" height="16" viewBox="0 0 24 24">
              <path fill="currentColor" d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
            </svg>
            Refresh
          </button>
        </div>
      </header>

      <!-- Stats Grid -->
      <div class="stats-grid">
        <div *ngFor="let stat of statCards" class="stat-card">
          <div class="stat-card-header">
            <div class="stat-icon" [class]="'icon-' + stat.color">
              <i [class]="stat.icon"></i>
            </div>
            <div class="stat-title">{{ stat.title }}</div>
          </div>
          <div class="stat-value">{{ stat.value }}</div>
          <div class="stat-description">{{ stat.description }}</div>
          <div class="stat-border" [class]="'border-' + stat.color"></div>
        </div>
      </div>

      <!-- Analytics Section -->
      <div class="analytics-section">
        <div class="analytics-header">
          <h2>Analytics</h2>
          <div class="time-filter">
            <select class="filter-select" (change)="onFilterChange($event)">
              <option value="week">This Week</option>
              <option value="month" selected>This Month</option>
              <option value="quarter">This Quarter</option>
            </select>
          </div>
        </div>

        <div class="analytics-grid">
          <!-- Status Distribution -->
          <div class="analytics-card">
            <div class="card-header">
              <h3>Table Status</h3>
              <div class="card-subtitle">Distribution of all tables</div>
            </div>
            <div class="distribution-container">
              <div class="distribution-chart">
                <div class="chart-slice approved" [style.width]="(reportData.approvedTables / totalTables) * 100 + '%'">
                  <div class="slice-label">{{ reportData.approvedTables }}</div>
                </div>
                <div class="chart-slice pending" [style.width]="(reportData.pendingApprovals / totalTables) * 100 + '%'">
                  <div class="slice-label">{{ reportData.pendingApprovals }}</div>
                </div>
                <div class="chart-slice rejected" [style.width]="(reportData.rejectedTables / totalTables) * 100 + '%'">
                  <div class="slice-label">{{ reportData.rejectedTables }}</div>
                </div>
              </div>
              <div class="distribution-legend">
                <div class="legend-item">
                  <span class="legend-color approved"></span>
                  <span class="legend-label">Approved</span>
                  <span class="legend-percentage">{{ (reportData.approvedTables / totalTables) * 100 | number:'1.0-0' }}%</span>
                </div>
                <div class="legend-item">
                  <span class="legend-color pending"></span>
                  <span class="legend-label">Pending</span>
                  <span class="legend-percentage">{{ (reportData.pendingApprovals / totalTables) * 100 | number:'1.0-0' }}%</span>
                </div>
                <div class="legend-item">
                  <span class="legend-color rejected"></span>
                  <span class="legend-label">Rejected</span>
                  <span class="legend-percentage">{{ (reportData.rejectedTables / totalTables) * 100 | number:'1.0-0' }}%</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Activity Overview -->
          <div class="analytics-card">
            <div class="card-header">
              <h3>Activity Overview</h3>
              <div class="card-subtitle">Last 7 days</div>
            </div>
            <div class="activity-chart">
              <div class="chart-bars">
                <div *ngFor="let day of activityDays; let i = index" class="bar-container">
                  <div class="bar" [style.height]="day.value * 2 + 'px'" [title]="day.value + ' activities'">
                    <div class="bar-value">{{ day.value }}</div>
                  </div>
                  <div class="bar-label">{{ day.label }}</div>
                </div>
              </div>
            </div>
            <div class="activity-stats">
              <div class="stat-item">
                <div class="stat-number">{{ totalActivities }}</div>
                <div class="stat-label">Total</div>
              </div>
              <div class="stat-item">
                <div class="stat-number">{{ averageDaily | number:'1.1-1' }}</div>
                <div class="stat-label">Avg/Day</div>
              </div>
              <div class="stat-item">
                <div class="stat-number">{{ peakDay }}</div>
                <div class="stat-label">Peak Day</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Loading State -->
      <div *ngIf="loading" class="loading-overlay">
        <div class="loading-content">
          <div class="loading-spinner"></div>
          <div class="loading-text">Loading data...</div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      --color-primary: #2563eb;
      --color-primary-light: #dbeafe;
      --color-success: #059669;
      --color-success-light: #d1fae5;
      --color-warning: #d97706;
      --color-warning-light: #fef3c7;
      --color-error: #dc2626;
      --color-error-light: #fee2e2;
      --color-gray-50: #f9fafb;
      --color-gray-100: #f3f4f6;
      --color-gray-200: #e5e7eb;
      --color-gray-300: #d1d5db;
      --color-gray-400: #9ca3af;
      --color-gray-500: #6b7280;
      --color-gray-600: #4b5563;
      --color-gray-700: #374151;
      --color-gray-800: #1f2937;
      --color-gray-900: #111827;
      --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
      --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
      --radius-sm: 6px;
      --radius-md: 8px;
      --radius-lg: 12px;
      --transition: all 0.2s ease;
    }

    .dashboard {
      min-height: 100vh;
      background: var(--color-gray-50);
      padding: 2rem;
      position: relative;
    }

    /* Header */
    .dashboard-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 3rem;
    }

    .dashboard-header h1 {
      font-size: 2rem;
      font-weight: 700;
      color: var(--color-gray-900);
      margin: 0 0 0.25rem 0;
      line-height: 1.2;
    }

    .header-subtitle {
      font-size: 0.875rem;
      color: var(--color-gray-500);
      margin: 0;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 1.5rem;
    }

    .current-date {
      font-size: 0.875rem;
      color: var(--color-gray-600);
      padding: 0.5rem 1rem;
      background: white;
      border: 1px solid var(--color-gray-200);
      border-radius: var(--radius-md);
    }

    .refresh-btn {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.625rem 1.25rem;
      background: white;
      border: 1px solid var(--color-gray-200);
      border-radius: var(--radius-md);
      color: var(--color-gray-700);
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: var(--transition);
    }

    .refresh-btn:hover:not(:disabled) {
      background: var(--color-gray-50);
      border-color: var(--color-gray-300);
    }

    .refresh-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .refresh-icon {
      width: 14px;
      height: 14px;
      transition: transform 0.3s ease;
    }

    .refresh-icon.spinning {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1.5rem;
      margin-bottom: 3rem;
    }

    .stat-card {
      background: white;
      border-radius: var(--radius-lg);
      padding: 1.5rem;
      position: relative;
      overflow: hidden;
      border: 1px solid var(--color-gray-200);
      transition: var(--transition);
    }

    .stat-card:hover {
      border-color: var(--color-gray-300);
      box-shadow: var(--shadow-md);
    }

    .stat-card-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .stat-icon {
      width: 2.5rem;
      height: 2.5rem;
      border-radius: var(--radius-md);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1rem;
    }

    .icon-blue {
      background: var(--color-primary-light);
      color: var(--color-primary);
    }

    .icon-orange {
      background: var(--color-warning-light);
      color: var(--color-warning);
    }

    .icon-green {
      background: var(--color-success-light);
      color: var(--color-success);
    }

    .icon-red {
      background: var(--color-error-light);
      color: var(--color-error);
    }

    .icon-purple {
      background: #f3e8ff;
      color: #7c3aed;
    }

    .stat-title {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--color-gray-700);
    }

    .stat-value {
      font-size: 2rem;
      font-weight: 700;
      color: var(--color-gray-900);
      margin: 0.5rem 0;
      line-height: 1;
    }

    .stat-description {
      font-size: 0.75rem;
      color: var(--color-gray-500);
      margin: 0;
    }

    .stat-border {
      position: absolute;
      bottom: 0;
      left: 0;
      width: 100%;
      height: 3px;
    }

    .border-blue {
      background: linear-gradient(90deg, var(--color-primary) 0%, transparent 100%);
    }

    .border-orange {
      background: linear-gradient(90deg, var(--color-warning) 0%, transparent 100%);
    }

    .border-green {
      background: linear-gradient(90deg, var(--color-success) 0%, transparent 100%);
    }

    .border-red {
      background: linear-gradient(90deg, var(--color-error) 0%, transparent 100%);
    }

    .border-purple {
      background: linear-gradient(90deg, #7c3aed 0%, transparent 100%);
    }

    /* Analytics Section */
    .analytics-section {
      margin-bottom: 2rem;
    }

    .analytics-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }

    .analytics-header h2 {
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--color-gray-900);
      margin: 0;
    }

    .filter-select {
      padding: 0.5rem 1rem;
      border: 1px solid var(--color-gray-200);
      border-radius: var(--radius-md);
      background: white;
      color: var(--color-gray-700);
      font-size: 0.875rem;
      cursor: pointer;
      transition: var(--transition);
    }

    .filter-select:hover {
      border-color: var(--color-gray-300);
    }

    .analytics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(450px, 1fr));
      gap: 1.5rem;
    }

    @media (max-width: 1024px) {
      .analytics-grid {
        grid-template-columns: 1fr;
      }
    }

    .analytics-card {
      background: white;
      border-radius: var(--radius-lg);
      padding: 1.5rem;
      border: 1px solid var(--color-gray-200);
    }

    .card-header {
      margin-bottom: 1.5rem;
    }

    .card-header h3 {
      font-size: 1rem;
      font-weight: 600;
      color: var(--color-gray-900);
      margin: 0 0 0.25rem 0;
    }

    .card-subtitle {
      font-size: 0.75rem;
      color: var(--color-gray-500);
      margin: 0;
    }

    /* Distribution Chart */
    .distribution-container {
      display: flex;
      align-items: center;
      gap: 2rem;
    }

    .distribution-chart {
      flex: 1;
      display: flex;
      height: 40px;
      border-radius: var(--radius-md);
      overflow: hidden;
      background: var(--color-gray-100);
    }

    .chart-slice {
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      transition: width 0.3s ease;
    }

    .chart-slice.approved {
      background: var(--color-success);
    }

    .chart-slice.pending {
      background: var(--color-warning);
    }

    .chart-slice.rejected {
      background: var(--color-error);
    }

    .slice-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: white;
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      white-space: nowrap;
    }

    .distribution-legend {
      flex: 0 0 auto;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.75rem;
    }

    .legend-item:last-child {
      margin-bottom: 0;
    }

    .legend-color {
      width: 12px;
      height: 12px;
      border-radius: 50%;
    }

    .legend-color.approved {
      background: var(--color-success);
    }

    .legend-color.pending {
      background: var(--color-warning);
    }

    .legend-color.rejected {
      background: var(--color-error);
    }

    .legend-label {
      font-size: 0.875rem;
      color: var(--color-gray-700);
      flex: 1;
    }

    .legend-percentage {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--color-gray-900);
    }

    /* Activity Chart */
    .activity-chart {
      margin-bottom: 1.5rem;
    }

    .chart-bars {
      display: flex;
      align-items: flex-end;
      gap: 1.5rem;
      height: 120px;
      padding: 0 1rem;
    }

    .bar-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .bar {
      width: 100%;
      background: linear-gradient(180deg, var(--color-primary) 0%, #3b82f6 100%);
      border-radius: var(--radius-sm) var(--radius-sm) 0 0;
      position: relative;
      transition: height 0.3s ease;
    }

    .bar-value {
      position: absolute;
      top: -25px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--color-gray-700);
      opacity: 0;
      transition: opacity 0.2s ease;
    }

    .bar:hover .bar-value {
      opacity: 1;
    }

    .bar-label {
      font-size: 0.75rem;
      color: var(--color-gray-500);
      margin-top: 0.5rem;
      text-align: center;
    }

    .activity-stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
      padding-top: 1rem;
      border-top: 1px solid var(--color-gray-200);
    }

    .stat-item {
      text-align: center;
    }

    .stat-number {
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--color-gray-900);
      margin-bottom: 0.25rem;
    }

    .stat-label {
      font-size: 0.75rem;
      color: var(--color-gray-500);
    }

    /* Loading Overlay */
    .loading-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(255, 255, 255, 0.9);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .loading-content {
      text-align: center;
    }

    .loading-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--color-gray-200);
      border-top-color: var(--color-primary);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 1rem;
    }

    .loading-text {
      font-size: 0.875rem;
      color: var(--color-gray-600);
    }
  `]
})
export class DashboardComponent implements OnInit {
  reportData = {
    totalTables: 156,
    pendingApprovals: 24,
    approvedTables: 112,
    rejectedTables: 20,
    totalUsers: 48,
    activeUsers: 32,
    totalRequisitions: 89,
    completedRequisitions: 67
  };

  statCards: StatCard[] = [];
  loading = false;
  
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

  get totalTables(): number {
    return this.reportData.totalTables || 1;
  }

  get totalActivities(): number {
    return this.activityDays.reduce((sum, day) => sum + day.value, 0);
  }

  get averageDaily(): number {
    return this.totalActivities / this.activityDays.length;
  }

  get peakDay(): string {
    const peak = this.activityDays.reduce((max, day) => 
      day.value > max.value ? day : max, this.activityDays[0]
    );
    return peak.label;
  }

  constructor(private supabaseService: SupabaseService) {}

  ngOnInit(): void {
    this.initializeDashboard();
  }

  private initializeDashboard(): void {
    this.updateStatCards();
    
    // Try to load real data silently
    this.loadRealData();
  }

  async refreshData(): Promise<void> {
    this.loading = true;
    await this.loadRealData();
    this.loading = false;
  }

  private async loadRealData(): Promise<void> {
    try {
      if (!this.supabaseService?.getClient) {
        return;
      }

      const supabase = this.supabaseService.getClient();
      
      // Load tables data
      const { data: tables } = await supabase
        .from('user_tables')
        .select('*');

      if (tables) {
        this.reportData.totalTables = tables.length;
        this.reportData.pendingApprovals = tables.filter(t => t.status === 'submitted').length;
        this.reportData.approvedTables = tables.filter(t => t.status === 'approved').length;
        this.reportData.rejectedTables = tables.filter(t => t.status === 'rejected').length;
      }

      // Load users data
      const { data: users } = await supabase
        .from('users')
        .select('*');

      if (users) {
        this.reportData.totalUsers = users.length;
        this.reportData.activeUsers = users.filter(u => u.is_active).length;
      }

      this.updateStatCards();
      
    } catch (error) {
      console.log('Using demo data:', error);
    }
  }

  private updateStatCards(): void {
    this.statCards = [
      {
        title: 'Total Tables',
        value: this.reportData.totalTables,
        icon: 'fas fa-table',
        color: 'blue',
        description: 'Created tables'
      },
      {
        title: 'Pending',
        value: this.reportData.pendingApprovals,
        icon: 'fas fa-clock',
        color: 'orange',
        description: 'Awaiting approval'
      },
      {
        title: 'Approved',
        value: this.reportData.approvedTables,
        icon: 'fas fa-check-circle',
        color: 'green',
        description: 'Approved tables'
      },
      {
        title: 'Rejected',
        value: this.reportData.rejectedTables,
        icon: 'fas fa-times-circle',
        color: 'red',
        description: 'Rejected tables'
      },
      {
        title: 'Total Users',
        value: this.reportData.totalUsers,
        icon: 'fas fa-users',
        color: 'purple',
        description: 'Registered users'
      },
      {
        title: 'Active Users',
        value: this.reportData.activeUsers,
        icon: 'fas fa-user-check',
        color: 'blue',
        description: 'Currently active'
      },
      {
        title: 'Requisitions',
        value: this.reportData.totalRequisitions,
        icon: 'fas fa-clipboard-list',
        color: 'green',
        description: 'Total requests'
      },
      {
        title: 'Completed',
        value: this.reportData.completedRequisitions,
        icon: 'fas fa-check-double',
        color: 'purple',
        description: 'Processed requests'
      }
    ];
  }

  onFilterChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    console.log('Filter changed to:', select.value);
   
  }
}