import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DatabaseService } from '../services/database.service';
import { SupabaseService } from '../services/supabase.service';

@Component({
  selector: 'app-usage-report',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="report-container">
      <div class="header">
        <h1><i class="fas fa-chart-bar"></i> Usage Report</h1>
        <p>View detailed usage reports and analytics</p>
      </div>

      <div class="content">
        <div class="placeholder-content">
          <i class="fas fa-chart-bar"></i>
          <h3>Usage Reports & Analytics</h3>
          <p>This section will contain comprehensive usage reports and analytics.</p>
          <p>Features to be implemented:</p>
          <ul>
            <li>Material usage statistics</li>
            <li>User activity reports</li>
            <li>Performance metrics</li>
            <li>Export capabilities</li>
          </ul>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .report-container {
      padding: 20px;
      max-width: 1200px;
      margin: 0 auto;
    }

    .header {
      margin-bottom: 30px;
    }

    .header h1 {
      color: #1e293b;
      margin-bottom: 5px;
      font-size: 28px;
    }

    .header p {
      color: #64748b;
      margin: 0;
    }

    .header i {
      margin-right: 10px;
      color: #3b82f6;
    }

    .content {
      background: white;
      border-radius: 12px;
      padding: 40px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      text-align: center;
    }

    .placeholder-content i {
      font-size: 64px;
      color: #cbd5e1;
      margin-bottom: 20px;
    }

    .placeholder-content h3 {
      color: #1e293b;
      margin-bottom: 10px;
    }

    .placeholder-content p {
      color: #64748b;
      margin-bottom: 20px;
    }

    .placeholder-content ul {
      text-align: left;
      display: inline-block;
      color: #64748b;
    }

    .placeholder-content li {
      margin-bottom: 5px;
    }
  `]
})
export class UsageReportComponent implements OnInit {
  constructor(
    private dbService: DatabaseService,
    private supabaseService: SupabaseService
  ) {}

  ngOnInit(): void {
    // Initialize component
  }
}