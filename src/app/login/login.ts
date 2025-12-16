import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NgClass } from '@angular/common';
import { DatabaseService } from '../services/database.service';
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
    private dbService: DatabaseService,
    private supabaseService: SupabaseService
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

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const { username, password, rememberMe } = this.loginForm.value;

    try {
      console.log('Login attempt with input:', username);
      
      let loginResult = null;
      
      // Check if input looks like an email (contains @)
      if (username.includes('@')) {
        // User entered an email directly
        loginResult = await this.loginWithEmail(username, password, username, rememberMe);
      } else {
        // User entered a username - need to find associated email
        loginResult = await this.loginWithUsername(username, password, rememberMe);
      }
      
      // If loginResult is false, show error (already handled in methods)
      if (loginResult === false) {
        this.showError('Invalid credentials. Please try again.');
      }
      
    } catch (error: any) {
      console.error('Login exception:', error);
      this.showError('An unexpected error occurred. Please try again.');
    } finally {
      // This will ALWAYS run, stopping the loader
      this.isLoading = false;
    }
  }

  private async loginWithEmail(email: string, password: string, displayUsername: string, rememberMe: boolean): Promise<boolean> {
    console.log('Attempting login with email:', email);
    
    try {
      const { user, error } = await this.dbService.login(email, password);
      
      if (error) {
        console.error('Email login error:', error);
        return false;
      } 
      
      if (user) {
        this.handleSuccessfulLogin(user, displayUsername, rememberMe);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error in loginWithEmail:', error);
      return false;
    }
  }

  private async loginWithUsername(username: string, password: string, rememberMe: boolean): Promise<boolean> {
    console.log('Looking up email for username:', username);
    
    try {
      // First, try to find the user by username in public.users table
      const supabase = this.supabaseService.getClient();
      const { data: users, error: findError } = await supabase
        .from('users')
        .select('email, username, role, full_name')
        .eq('username', username)
        .limit(1);

      if (findError) {
        console.error('Error finding user by username:', findError);
        // Try alternative login methods
        return await this.tryAlternativeLogins(username, password, rememberMe);
      }

      if (!users || users.length === 0) {
        console.log('Username not found in database');
        // Try common email patterns
        return await this.tryAlternativeLogins(username, password, rememberMe);
      }

      const userData = users[0];
      const email = userData.email;
      console.log('Found email for username:', email);
      
      // Now login with the found email
      const { user, error: loginError } = await this.dbService.login(email, password);
      
      if (loginError) {
        console.error('Login error after finding email:', loginError);
        return false;
      } 
      
      if (user) {
        this.handleSuccessfulLogin(user, username, rememberMe);
        return true;
      }
      
      return false;
    } catch (error: any) {
      console.error('Error in loginWithUsername:', error);
      return false;
    }
  }

  private async tryAlternativeLogins(username: string, password: string, rememberMe: boolean): Promise<boolean> {
    console.log('Trying alternative login methods for:', username);
    
    // Try common email patterns
    const emailPatterns = [
      `${username}@system.local`,
      `${username}@rawmaterial.com`,
      `${username}@example.com`,
      `${username}@gmail.com`,
      username // Try as-is (in case it's already an email without @domain)
    ];
    
    for (const email of emailPatterns) {
      console.log('Trying email pattern:', email);
      
      try {
        const { user, error } = await this.dbService.login(email, password);
        
        if (error) {
          // Check if error is "Invalid login credentials" vs other errors
          if (error.message?.includes('Invalid login credentials')) {
            console.log(`Invalid credentials for ${email}`);
            continue; // Try next pattern
          }
          console.log(`Other error for ${email}:`, error.message);
          continue;
        }
        
        if (user) {
          console.log(`Login successful with ${email}`);
          this.handleSuccessfulLogin(user, username, rememberMe);
          return true;
        }
      } catch (error) {
        console.log(`Error trying ${email}:`, error);
        continue;
      }
    }
    
    return false; // No login succeeded
  }

  private handleSuccessfulLogin(user: any, username: string, rememberMe: boolean): void {
    // Save to localStorage if remember me is checked
    if (rememberMe) {
      localStorage.setItem('savedUsername', username);
    } else {
      localStorage.removeItem('savedUsername');
    }

    // Save user info to localStorage
    localStorage.setItem('currentUser', JSON.stringify(user));
    
    // Show success message
    this.successMessage = `Welcome back, ${user.full_name || user.username || user.email}!`;
    
    // Navigate to dashboard after a brief delay
    setTimeout(() => {
      this.router.navigate(['/dashboard']);
    }, 1000);
  }

  private showError(message: string): void {
    this.errorMessage = message;
    // Clear error message after 5 seconds
    setTimeout(() => {
      this.errorMessage = '';
    }, 5000);
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
    this.showPassword = !this.showPassword;
  }

  get usernameControl() {
    return this.loginForm.get('username');
  }

  get passwordControl() {
    return this.loginForm.get('password');
  }
}