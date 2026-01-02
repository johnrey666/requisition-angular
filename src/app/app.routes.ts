import { Routes } from '@angular/router';
import { LoginComponent } from './login/login';
import { DashboardComponent } from './dashboard/dashboard';
import { DailyProductionComponent } from './daily-production/daily-production';
import { RawMaterialRequisitionComponent } from './raw-material-requisition/raw-material-requisition';
import { UsageReportComponent } from './usage-report/usage-report';
import { MainLayoutComponent } from './main-layout.component';

export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  {
    path: '',
    component: MainLayoutComponent,
    children: [
      { path: 'dashboard', component: DashboardComponent },
      { path: 'daily-production', component: DailyProductionComponent },
      { path: 'raw-material-requisition', component: RawMaterialRequisitionComponent },
      { path: 'usage-report', component: UsageReportComponent },
    ]
  },
  { path: '**', redirectTo: '/login' }
];