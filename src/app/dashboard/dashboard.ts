import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DatabaseService } from '../services/database.service';
import { SupabaseService } from '../services/supabase.service';

interface ReportData {
  totalTables: number;
  pendingApprovals: number;
  approvedTables: number;
  rejectedTables: number;
  totalUsers: number;
  activeUsers: number;
  totalRequisitions: number;
  completedRequisitions: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="dashboard-container">
      <div class="dashboard-header">
        <h1><i class="fas fa-tachometer-alt"></i> Dashboard</h1>
        <p>Welcome to the Raw Material E-Portal Dashboard</p>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon">
            <i class="fas fa-table"></i>
          </div>
          <div class="stat-content">
            <h3>{{ reportData.totalTables }}</h3>
            <p>Total Tables</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon pending">
            <i class="fas fa-clock"></i>
          </div>
          <div class="stat-content">
            <h3>{{ reportData.pendingApprovals }}</h3>
            <p>Pending Approvals</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon approved">
            <i class="fas fa-check-circle"></i>
          </div>
          <div class="stat-content">
            <h3>{{ reportData.approvedTables }}</h3>
            <p>Approved Tables</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon rejected">
            <i class="fas fa-times-circle"></i>
          </div>
          <div class="stat-content">
            <h3>{{ reportData.rejectedTables }}</h3>
            <p>Rejected Tables</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">
            <i class="fas fa-users"></i>
          </div>
          <div class="stat-content">
            <h3>{{ reportData.totalUsers }}</h3>
            <p>Total Users</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon active">
            <i class="fas fa-user-check"></i>
          </div>
          <div class="stat-content">
            <h3>{{ reportData.activeUsers }}</h3>
            <p>Active Users</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">
            <i class="fas fa-clipboard-list"></i>
          </div>
          <div class="stat-content">
            <h3>{{ reportData.totalRequisitions }}</h3>
            <p>Total Requisitions</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon completed">
            <i class="fas fa-check-double"></i>
          </div>
          <div class="stat-content">
            <h3>{{ reportData.completedRequisitions }}</h3>
            <p>Completed Requisitions</p>
          </div>
        </div>
      </div>

      <div class="charts-section">
        <div class="chart-card">
          <h3>Table Status Distribution</h3>
          <div class="chart-placeholder">
            <i class="fas fa-chart-pie"></i>
            <p>Chart will be implemented here</p>
          </div>
        </div>

        <div class="chart-card">
          <h3>Monthly Activity</h3>
          <div class="chart-placeholder">
            <i class="fas fa-chart-line"></i>
            <p>Chart will be implemented here</p>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .dashboard-container {
      padding: 20px;
      max-width: 1200px;
      margin: 0 auto;
    }

    .dashboard-header {
      margin-bottom: 30px;
    }

    .dashboard-header h1 {
      color: #1e293b;
      margin-bottom: 5px;
      font-size: 28px;
    }

    .dashboard-header p {
      color: #64748b;
      margin: 0;
    }

    .dashboard-header i {
      margin-right: 10px;
      color: #3b82f6;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-bottom: 40px;
    }

    .stat-card {
      background: white;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      display: flex;
      align-items: center;
      transition: transform 0.2s ease;
    }

    .stat-card:hover {
      transform: translateY(-2px);
    }

    .stat-icon {
      width: 50px;
      height: 50px;
      border-radius: 10px;
      background: #e2e8f0;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 15px;
      font-size: 20px;
      color: #64748b;
    }

    .stat-icon.pending {
      background: #fef3c7;
      color: #d97706;
    }

    .stat-icon.approved {
      background: #d1fae5;
      color: #059669;
    }

    .stat-icon.rejected {
      background: #fee2e2;
      color: #dc2626;
    }

    .stat-icon.active {
      background: #dbeafe;
      color: #2563eb;
    }

    .stat-icon.completed {
      background: #d1fae5;
      color: #059669;
    }

    .stat-content h3 {
      margin: 0 0 5px 0;
      font-size: 24px;
      font-weight: 700;
      color: #1e293b;
    }

    .stat-content p {
      margin: 0;
      color: #64748b;
      font-size: 14px;
    }

    .charts-section {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 20px;
    }

    .chart-card {
      background: white;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }

    .chart-card h3 {
      margin-top: 0;
      color: #1e293b;
      font-size: 18px;
    }

    .chart-placeholder {
      height: 200px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #64748b;
      border: 2px dashed #e2e8f0;
      border-radius: 8px;
    }

    .chart-placeholder i {
      font-size: 48px;
      margin-bottom: 10px;
    }

    .chart-placeholder p {
      margin: 0;
      font-size: 16px;
    }
  `]
})
export class DashboardComponent implements OnInit {
  reportData: ReportData = {
    totalTables: 0,
    pendingApprovals: 0,
    approvedTables: 0,
    rejectedTables: 0,
    totalUsers: 0,
    activeUsers: 0,
    totalRequisitions: 0,
    completedRequisitions: 0
  };

  constructor(
    private dbService: DatabaseService,
    private supabaseService: SupabaseService
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadReportData();
  }

  private async loadReportData(): Promise<void> {
    try {
      // Load tables data
      const supabase = this.supabaseService.getClient();
      
      // Get all tables
      const { data: tables } = await supabase
        .from('user_tables')
        .select('*');

      if (tables) {
        this.reportData.totalTables = tables.length;
        this.reportData.pendingApprovals = tables.filter(t => t.status === 'submitted').length;
        this.reportData.approvedTables = tables.filter(t => t.status === 'approved').length;
        this.reportData.rejectedTables = tables.filter(t => t.status === 'rejected').length;
      }

      // Get users data
      const { data: users } = await supabase
        .from('users')
        .select('*');

      if (users) {
        this.reportData.totalUsers = users.length;
        this.reportData.activeUsers = users.filter(u => u.is_active).length;
      }

      // Get requisitions data (this might need adjustment based on your schema)
      const { data: requisitions } = await supabase
        .from('requisitions')
        .select('*');

      if (requisitions) {
        this.reportData.totalRequisitions = requisitions.length;
        this.reportData.completedRequisitions = requisitions.filter(r => r.status === 'completed').length;
      }

    } catch (error) {
      console.error('Error loading report data:', error);
    }
  }
}