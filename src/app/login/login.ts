import { Component, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { DatabaseService } from '../services/database.service';
import { SupabaseService } from '../services/supabase.service';
import { Subject } from 'rxjs';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class LoginComponent implements OnDestroy {
  loginForm: FormGroup;
  isLoading = false;
  errorMessage = '';
  successMessage = '';
  showPassword = false;

  private destroy$ = new Subject<void>();
  private loginAttempts = 0;
  private maxLoginAttempts = 5;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private dbService: DatabaseService,
    private supabaseService: SupabaseService
  ) {
    this.loginForm = this.fb.group({
      username: ['', [Validators.required, Validators.minLength(3)]],
      password: ['', [Validators.required]],
      rememberMe: [false]
    });

    const savedUsername = localStorage.getItem('savedUsername');
    if (savedUsername) {
      this.loginForm.patchValue({
        username: savedUsername,
        rememberMe: true
      });
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async onSubmit(): Promise<void> {
    if (this.loginForm.invalid) {
      this.markFormGroupTouched(this.loginForm);
      return;
    }

    if (this.loginAttempts >= this.maxLoginAttempts) {
      this.showError('Too many failed attempts. Please try again later.');
      return;
    }

    this.isLoading = true;
    this.loginForm.disable(); // 🔥 IMPORTANT
    this.errorMessage = '';
    this.successMessage = '';
    this.loginAttempts++;

    const { username, password, rememberMe } = this.loginForm.value;

    try {
      let loginSuccessful = false;

      if (username.includes('@')) {
        loginSuccessful = await this.loginWithEmail(username, password, username, rememberMe);
      } else {
        loginSuccessful = await this.loginWithUsername(username, password, rememberMe);
      }

      if (!loginSuccessful) {
        this.showError('Invalid username/email or password.');
        this.loginForm.patchValue({ password: '' });
        this.passwordControl?.markAsUntouched();

        // ✅ STOP LOADING IMMEDIATELY
        this.isLoading = false;
        this.loginForm.enable();
      }

    } catch (error) {
      console.error('Login error:', error);
      this.showError('Login failed. Please try again.');

      this.loginForm.patchValue({ password: '' });
      this.passwordControl?.markAsUntouched();

      // ✅ ALWAYS RECOVER UI
      this.isLoading = false;
      this.loginForm.enable();
    }
  }

  private async loginWithEmail(
    email: string,
    password: string,
    displayUsername: string,
    rememberMe: boolean
  ): Promise<boolean> {
    const { user, error } = await this.dbService.login(email, password);

    if (error || !user) {
      return false;
    }

    await this.handleSuccessfulLogin(user, displayUsername, rememberMe);
    return true;
  }

  private async loginWithUsername(
    username: string,
    password: string,
    rememberMe: boolean
  ): Promise<boolean> {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('users')
      .select('email')
      .eq('username', username)
      .limit(1);

    if (error || !data || data.length === 0) {
      return false;
    }

    return this.loginWithEmail(data[0].email, password, username, rememberMe);
  }

  private async handleSuccessfulLogin(
    user: any,
    username: string,
    rememberMe: boolean
  ): Promise<void> {
    this.loginAttempts = 0;

    if (rememberMe) {
      localStorage.setItem('savedUsername', username);
    } else {
      localStorage.removeItem('savedUsername');
    }

    localStorage.setItem('currentUser', JSON.stringify(user));

    this.successMessage = `Welcome back, ${user.email}!`;

    setTimeout(() => {
      this.router.navigate(['/dashboard']);
    }, 800);
  }

  private showError(message: string): void {
    this.errorMessage = message;
    setTimeout(() => {
      if (this.errorMessage === message) {
        this.errorMessage = '';
      }
    }, 5000);
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.values(formGroup.controls).forEach(control => {
      control.markAsTouched();
    });
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  get usernameControl() {
    return this.loginForm.get('username');
  }

  get passwordControl() {
    return this.loginForm.get('password');
  }
}
