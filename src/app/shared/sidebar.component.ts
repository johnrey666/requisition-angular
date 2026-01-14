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
      <!-- Header -->
      <div class="header">
        <div class="app-icon">📦</div>
        <div class="header-content">
          <div class="app-title">E-Material Portal</div>
          @if (isAdmin) {
            <button class="add-user" (click)="showAddUserModal = true" title="Add User">
              <span>+</span>
            </button>
          }
        </div>
      </div>
      
      <!-- Navigation -->
      <nav class="nav">
        <ul>
          <li>
            <a routerLink="/dashboard" routerLinkActive="active" class="nav-link">
              <span class="nav-icon">📊</span>
              <span class="nav-text">Dashboard</span>
            </a>
          </li>
          <li>
            <a routerLink="/daily-production" routerLinkActive="active" class="nav-link">
              <span class="nav-icon">🏭</span>
              <span class="nav-text">Daily Production</span>
            </a>
          </li>
          <li>
            <a routerLink="/raw-material-requisition" routerLinkActive="active" class="nav-link">
              <span class="nav-icon">📝</span>
              <span class="nav-text">Material Requisition</span>
            </a>
          </li>
          <li>
            <a routerLink="/usage-report" routerLinkActive="active" class="nav-link">
              <span class="nav-icon">📈</span>
              <span class="nav-text">Usage Report</span>
            </a>
          </li>
        </ul>
      </nav>
      
      <!-- Footer -->
      <div class="footer">
        <button class="logout" (click)="logout()">
          <span class="logout-icon">↪</span>
          <span class="logout-text">Logout</span>
        </button>
      </div>
    </div>

    <!-- Add User Modal -->
    @if (showAddUserModal && isAdmin) {
      <div class="modal" (click)="closeAddUserModal()">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3>Add New User</h3>
            <button class="modal-close" (click)="closeAddUserModal()">×</button>
          </div>
          <div class="modal-body">
            <div class="form">
              <div class="form-group">
                <label>Full Name</label>
                <input type="text" [(ngModel)]="newUser.full_name" 
                       class="input" placeholder="Enter full name">
              </div>
              
              <div class="form-row">
                <div class="form-group">
                  <label>Username</label>
                  <input type="text" [(ngModel)]="newUser.username" 
                         class="input" placeholder="Enter username">
                </div>
                <div class="form-group">
                  <label>Email</label>
                  <input type="email" [(ngModel)]="newUser.email" 
                         class="input" placeholder="Enter email">
                </div>
              </div>
              
              <div class="form-row">
                <div class="form-group">
                  <label>Password</label>
                  <input type="password" [(ngModel)]="newUser.password" 
                         class="input" placeholder="Enter password">
                </div>
                <div class="form-group">
                  <label>Role</label>
                  <select [(ngModel)]="newUser.role" class="select">
                    <option value="user">Standard User</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
              </div>
              
              <div class="form-actions">
                <button class="btn cancel" (click)="closeAddUserModal()">Cancel</button>
                <button class="btn primary" (click)="createNewUser()" 
                        [disabled]="!isNewUserFormValid() || isCreatingUser">
                  {{ isCreatingUser ? 'Creating...' : 'Create User' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    /* Variables */
    :host {
      --bg: #ffffff;
      --border: #e0e0e0;
      --text: #212121;
      --text-light: #757575;
      --primary: #2196f3;
      --surface: #ffffff;
      --radius: 8px;
    }

    /* Sidebar */
    .sidebar {
      width: 200px;
      height: 100vh;
      background: var(--bg);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      position: fixed;
      left: 0;
      top: 0;
      z-index: 100;
    }

    /* Header */
    .header {
      padding: 20px 16px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .app-icon {
      font-size: 20px;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f5f5f5;
      border-radius: var(--radius);
    }

    .header-content {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .app-title {
      font-size: 13px;
      font-weight: 500;
      color: var(--text);
    }

    .add-user {
      width: 24px;
      height: 24px;
      background: var(--primary);
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .add-user:hover {
      background: #1976d2;
    }

    /* Navigation */
    .nav {
      flex: 1;
      padding: 16px 0;
    }

    .nav ul {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .nav li {
      margin: 2px 0;
    }

    .nav-link {
      display: flex;
      align-items: center;
      padding: 10px 16px;
      color: var(--text-light);
      text-decoration: none;
      transition: all 0.2s;
      font-size: 13px;
    }

    .nav-link:hover {
      background: #f5f5f5;
      color: var(--text);
    }

    .nav-link.active {
      background: #f5f5f5;
      color: var(--primary);
      font-weight: 500;
    }

    .nav-icon {
      font-size: 14px;
      margin-right: 12px;
      width: 16px;
      text-align: center;
    }

    .nav-text {
      flex: 1;
    }

    /* Footer */
    .footer {
      padding: 16px;
      border-top: 1px solid var(--border);
    }

    .logout {
      width: 100%;
      padding: 10px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      color: var(--text);
      font-size: 13px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .logout:hover {
      border-color: var(--text-light);
    }

    .logout-icon {
      font-size: 12px;
    }

    /* Modal */
    .modal {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal-content {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      width: 90%;
      max-width: 400px;
      max-height: 90vh;
      overflow-y: auto;
    }

    .modal-header {
      padding: 16px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .modal-header h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: var(--text);
    }

    .modal-close {
      background: none;
      border: none;
      font-size: 18px;
      color: var(--text-light);
      cursor: pointer;
      padding: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .modal-close:hover {
      color: var(--text);
    }

    .modal-body {
      padding: 16px;
    }

    /* Form */
    .form {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    label {
      font-size: 12px;
      color: var(--text);
      font-weight: 500;
    }

    .input, .select {
      padding: 6px 10px;
      border: 1px solid var(--border);
      border-radius: 4px;
      font-size: 13px;
      background: var(--surface);
      color: var(--text);
    }

    .input:focus, .select:focus {
      outline: none;
      border-color: var(--primary);
    }

    .form-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      margin-top: 8px;
    }

    .btn {
      padding: 6px 12px;
      border: 1px solid var(--border);
      border-radius: 4px;
      font-size: 13px;
      cursor: pointer;
      background: var(--surface);
      color: var(--text);
    }

    .btn:hover:not(:disabled) {
      border-color: var(--text-light);
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn.primary {
      background: var(--primary);
      color: white;
      border-color: var(--primary);
    }

    .btn.primary:hover:not(:disabled) {
      background: #1976d2;
    }

    .cancel {
      background: #f5f5f5;
    }

    .cancel:hover {
      background: #eee;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .sidebar {
        width: 180px;
      }
      
      .header {
        padding: 16px 12px;
      }
      
      .nav-link {
        padding: 8px 12px;
        font-size: 12px;
      }
      
      .nav-icon {
        font-size: 12px;
        margin-right: 10px;
      }
      
      .footer {
        padding: 12px;
      }
    }

    @media (max-width: 480px) {
      .sidebar {
        width: 160px;
      }
      
      .app-title {
        font-size: 12px;
      }
      
      .nav-text {
        display: none;
      }
      
      .nav-icon {
        margin-right: 0;
        font-size: 16px;
      }
      
      .logout-text {
        display: none;
      }
      
      .logout-icon {
        margin-right: 0;
      }
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