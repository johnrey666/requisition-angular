import { Component, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DatabaseService } from '../services/database.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div class="sidebar">
      <div class="sidebar-header">
        <div class="app-icon">
          <i class="fas fa-industry"></i>
        </div>
        <div class="header-content">
          <h2>Material Portal</h2>
          @if (isAdmin) {
            <button class="add-user-btn" (click)="showAddUserModal = true" title="Add User">
              <i class="fas fa-user-plus"></i>
            </button>
          }
        </div>
      </div>
      
      <nav class="sidebar-nav">
        <ul>
          <li>
            <a routerLink="/dashboard" routerLinkActive="active" class="nav-link">
              <i class="fas fa-tachometer-alt"></i>
              <span>Dashboard</span>
              <span class="active-indicator"></span>
            </a>
          </li>
          <li>
            <a routerLink="/daily-production" routerLinkActive="active" class="nav-link">
              <i class="fas fa-industry"></i>
              <span>Daily Production</span>
              <span class="active-indicator"></span>
            </a>
          </li>
          <li>
            <a routerLink="/raw-material-requisition" routerLinkActive="active" class="nav-link">
              <i class="fas fa-clipboard-list"></i>
              <span>Material Requisition</span>
              <span class="active-indicator"></span>
            </a>
          </li>
          <li>
            <a routerLink="/usage-report" routerLinkActive="active" class="nav-link">
              <i class="fas fa-chart-bar"></i>
              <span>Usage Report</span>
              <span class="active-indicator"></span>
            </a>
          </li>
        </ul>
      </nav>
      
      <div class="sidebar-footer">
        <button class="logout-btn" (click)="logout()">
          <i class="fas fa-sign-out-alt"></i>
          <span>Logout</span>
        </button>
      </div>
    </div>

    <!-- Add User Modal -->
    @if (showAddUserModal && isAdmin) {
      <div class="modal-overlay" (click)="closeAddUserModal()">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3><i class="fas fa-user-plus"></i> Add New User</h3>
            <button class="modal-close" (click)="closeAddUserModal()">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="modal-body">
            <div class="add-user-form">
              <!-- Full Name (full width) -->
              <div class="form-group full-width">
                <label>Full Name *</label>
                <input type="text" [(ngModel)]="newUser.full_name" 
                       class="form-input" placeholder="Enter full name">
              </div>
              
              <!-- Username & Email (side by side) -->
              <div class="form-row">
                <div class="form-group">
                  <label>Username *</label>
                  <input type="text" [(ngModel)]="newUser.username" 
                         class="form-input" placeholder="Enter username">
                </div>
                <div class="form-group">
                  <label>Email *</label>
                  <input type="email" [(ngModel)]="newUser.email" 
                         class="form-input" placeholder="Enter email">
                </div>
              </div>
              
              <!-- Password & Role (side by side) -->
              <div class="form-row">
                <div class="form-group">
                  <label>Password *</label>
                  <input type="password" [(ngModel)]="newUser.password" 
                         class="form-input" placeholder="Enter password">
                </div>
                <div class="form-group">
                  <label>Role *</label>
                  <select [(ngModel)]="newUser.role" class="form-select">
                    <option value="user">Standard User</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
              </div>
              
              <div class="form-actions">
                <button class="btn-sm btn-danger" (click)="closeAddUserModal()">Cancel</button>
                <button class="btn-sm btn-primary create-user-btn" (click)="createNewUser()" 
                        [disabled]="!isNewUserFormValid() || isCreatingUser">
                  @if (!isCreatingUser) {
                    <span>Create User</span>
                  } @else {
                    <span>Creating...</span>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .sidebar {
      width: 200px;
      height: 100vh;
      background: #ffffff;
      position: fixed;
      left: 0;
      top: 0;
      overflow-y: auto;
      box-shadow: 1px 0 8px rgba(0, 0, 0, 0.04);
      border-right: 1px solid #f0f0f0;
      display: flex;
      flex-direction: column;
      z-index: 100;
    }

    .sidebar-header {
      padding: 24px 16px;
      border-bottom: 1px solid #f5f5f5;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .header-content {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .app-icon {
      width: 32px;
      height: 32px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 14px;
    }

    .sidebar-header h2 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: #333;
      letter-spacing: -0.3px;
    }

    .add-user-btn {
      width: 28px;
      height: 28px;
      background: #667eea;
      border: none;
      border-radius: 6px;
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      font-size: 12px;
    }

    .add-user-btn:hover {
      background: #5a67d8;
      transform: scale(1.05);
    }

    .sidebar-nav {
      padding: 16px 0;
      flex: 1;
    }

    .sidebar-nav ul {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .sidebar-nav li {
      margin: 2px 0;
      position: relative;
    }

    .nav-link {
      display: flex;
      align-items: center;
      padding: 10px 16px;
      color: #666;
      text-decoration: none;
      transition: all 0.2s ease;
      position: relative;
      border-radius: 0;
      font-size: 14px;
    }

    .nav-link:hover {
      background: #f8f9fa;
      color: #333;
    }

    .nav-link:hover i {
      color: #667eea;
    }

    .nav-link.active {
      background: #f8f9fa;
      color: #667eea;
      font-weight: 500;
    }

    .nav-link.active i {
      color: #667eea;
    }

    .nav-link i {
      margin-right: 12px;
      width: 18px;
      text-align: center;
      font-size: 14px;
      color: #888;
      transition: color 0.2s ease;
    }

    .active-indicator {
      position: absolute;
      right: 8px;
      width: 4px;
      height: 4px;
      background: #667eea;
      border-radius: 50%;
      opacity: 0;
      transition: opacity 0.2s ease;
    }

    .nav-link.active .active-indicator {
      opacity: 1;
    }

    .sidebar-footer {
      padding: 16px;
      border-top: 1px solid #f5f5f5;
      background: #fafafa;
    }

    .logout-btn {
      width: 100%;
      padding: 10px;
      background: transparent;
      border: 1px solid #e0e0e0;
      color: #666;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      font-size: 14px;
      font-weight: 500;
    }

    .logout-btn:hover {
      background: #fff;
      border-color: #ddd;
      color: #333;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }

    .logout-btn i {
      margin-right: 8px;
      font-size: 13px;
    }

    /* Scrollbar styling */
    .sidebar::-webkit-scrollbar {
      width: 4px;
    }

    .sidebar::-webkit-scrollbar-track {
      background: #f1f1f1;
    }

    .sidebar::-webkit-scrollbar-thumb {
      background: #ddd;
      border-radius: 2px;
    }

    .sidebar::-webkit-scrollbar-thumb:hover {
      background: #ccc;
    }

    /* Small screen adjustments */
    @media (max-width: 768px) {
      .sidebar {
        width: 180px;
      }
      
      .sidebar-header {
        padding: 20px 16px;
      }
      
      .sidebar-header h2 {
        font-size: 15px;
      }
    }

    /* Modal Styles */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal-content {
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
      max-width: 500px;
      width: 90%;
      max-height: 90vh;
      overflow-y: auto;
    }

    .modal-header {
      padding: 20px 24px;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .modal-header h3 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: #111827;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .modal-close {
      background: none;
      border: none;
      font-size: 20px;
      color: #6b7280;
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      transition: all 0.2s;
    }

    .modal-close:hover {
      background: #f3f4f6;
      color: #374151;
    }

    .modal-body {
      padding: 24px;
    }

    .add-user-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .form-group.full-width {
      width: 100%;
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }

    .form-group label {
      font-size: 14px;
      font-weight: 500;
      color: #374151;
    }

    .form-input, .form-select {
      padding: 8px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 14px;
      transition: border-color 0.2s;
    }

    .form-input:focus, .form-select:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }

    .form-actions {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
      margin-top: 8px;
    }

    .btn-sm {
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-primary {
      background: #667eea;
      color: white;
    }

    .btn-primary:hover:not(:disabled) {
      background: #5a67d8;
    }

    .btn-primary:disabled {
      background: #d1d5db;
      cursor: not-allowed;
    }

    .btn-danger {
      background: #ef4444;
      color: white;
    }

    .btn-danger:hover {
      background: #dc2626;
    }
  `]
})
export class SidebarComponent {
  private databaseService = inject(DatabaseService);
  private router = inject(Router);

  isAdmin = false;
  showAddUserModal = false;
  isCreatingUser = false;

  newUser = {
    full_name: '',
    username: '',
    email: '',
    password: '',
    role: 'user'
  };

  constructor() {
    this.checkAdminStatus();
  }

  private checkAdminStatus() {
    const currentUser = localStorage.getItem('currentUser');
    if (currentUser) {
      try {
        const user = JSON.parse(currentUser);
        this.isAdmin = user.role === 'admin';
      } catch (error) {
        console.error('Error parsing current user:', error);
      }
    }
  }

  logout() {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('savedUsername');
    this.router.navigate(['/login']);
  }

  closeAddUserModal() {
    this.showAddUserModal = false;
    this.resetNewUserForm();
  }

  private resetNewUserForm() {
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
      return;
    }

    this.isCreatingUser = true;
    try {
      const result = await this.databaseService.createUserAdmin(
        this.newUser.email.trim(),
        this.newUser.password,
        {
          username: this.newUser.username.trim(),
          full_name: this.newUser.full_name.trim(),
          role: this.newUser.role as 'user' | 'admin'
        }
      );

      if (result.success) {
        alert('User created successfully!');
        this.closeAddUserModal();
      } else {
        alert('Error creating user: ' + (result.error?.message || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error creating user:', error);
      alert('Error creating user. Please try again.');
    } finally {
      this.isCreatingUser = false;
    }
  }
}