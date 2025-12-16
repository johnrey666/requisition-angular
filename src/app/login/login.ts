import { Component, ChangeDetectorRef, NgZone } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NgClass } from '@angular/common';
import { SupabaseService } from '../services/supabase.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class LoginComponent {
  loginForm: FormGroup;
  isLoading: boolean = false;
  errorMessage: string = '';
  successMessage: string = '';
  showPassword: boolean = false;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private supabaseService: SupabaseService,
    private cdRef: ChangeDetectorRef,
    private ngZone: NgZone
  ) {
    this.loginForm = this.fb.group({
      username: ['', [Validators.required, Validators.minLength(3)]],
      password: ['', [Validators.required, Validators.minLength(1)]],
      rememberMe: [false]
    });

    // Check for saved credentials
    const savedUsername = localStorage.getItem('savedUsername');
    if (savedUsername) {
      this.loginForm.patchValue({
        username: savedUsername,
        rememberMe: true
      });
    }
  }

  async onSubmit(): Promise<void> {
    if (this.loginForm.invalid) {
      this.markFormGroupTouched(this.loginForm);
      return;
    }

    this.ngZone.run(() => {
      this.isLoading = true;
      this.errorMessage = '';
      this.successMessage = '';
    });

    const { username, password, rememberMe } = this.loginForm.value;

    try {
      console.log('Login attempt with:', username);
      
      const supabase = this.supabaseService.getClient();
      
      // Determine email to use
      let email = username;
      if (!username.includes('@')) {
        email = `${username}@system.local`;
      }
      
      console.log('Attempting login with email:', email);
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password
      });

      this.ngZone.run(() => {
        if (error) {
          console.error('Login error:', error);
          this.isLoading = false;
          this.errorMessage = 'Invalid username or password';
          this.cdRef.detectChanges();
          return;
        }

        if (data.user) {
          // Login successful
          if (rememberMe) {
            localStorage.setItem('savedUsername', username);
          } else {
            localStorage.removeItem('savedUsername');
          }

          // Access user metadata safely
          const metadata = data.user.user_metadata || {};
          const fullName = metadata['full_name'] || metadata['fullName'] || username;
          const role = metadata['role'] || 'user';

          const userInfo = {
            id: data.user.id,
            email: data.user.email,
            username: username,
            full_name: fullName,
            role: role
          };

          localStorage.setItem('currentUser', JSON.stringify(userInfo));
          
          this.isLoading = false;
          this.successMessage = `Welcome back, ${fullName}!`;
          this.cdRef.detectChanges();
          
          setTimeout(() => {
            this.ngZone.run(() => {
              this.router.navigate(['/dashboard']);
            });
          }, 1000);
        } else {
          this.isLoading = false;
          this.errorMessage = 'Login failed. Please try again.';
          this.cdRef.detectChanges();
        }
      });
      
    } catch (error: any) {
      console.error('Login exception:', error);
      this.ngZone.run(() => {
        this.isLoading = false;
        this.errorMessage = 'An unexpected error occurred. Please try again.';
        this.cdRef.detectChanges();
      });
    }
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.values(formGroup.controls).forEach(control => {
      control.markAsTouched();
      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }

  togglePasswordVisibility(): void {
    this.ngZone.run(() => {
      this.showPassword = !this.showPassword;
      this.cdRef.detectChanges();
    });
  }

  get usernameControl() {
    return this.loginForm.get('username');
  }

  get passwordControl() {
    return this.loginForm.get('password');
  }
}