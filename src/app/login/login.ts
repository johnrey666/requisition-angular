import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';

interface LoginResponse {
  success: boolean;
  error?: string;
  message?: string;
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class LoginComponent implements OnInit {
  email = '';
  password = '';
  rememberMe = false;
  isLoading = false;
  loginError = '';
  showPassword = false;
  
  // Form validation states
  emailError = '';
  passwordError = '';
  emailFocused = false;
  passwordFocused = false;
  successMessage = false;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    const rememberedEmail = localStorage.getItem('rememberedEmail');
    if (rememberedEmail) {
      this.email = rememberedEmail;
      this.rememberMe = true;
    }
  }

  async onSubmit(event: Event) {
    event.preventDefault();
    this.clearErrors();

    if (!this.validateForm()) {
      this.triggerShake();
      return;
    }

    this.isLoading = true;
    this.loginError = '';

    try {
      const result = await this.authService.login(this.email, this.password) as LoginResponse;
      
      if (result.success) {
        this.showSuccess();
        
        if (this.rememberMe) {
          localStorage.setItem('rememberedEmail', this.email);
        } else {
          localStorage.removeItem('rememberedEmail');
        }
        
        setTimeout(() => {
          this.router.navigate(['/dashboard']);
        }, 2000);
        
      } else {
        this.loginError = result.error || 'Invalid email or password.';
        this.isLoading = false;
        this.triggerShake();
      }
    } catch (error: any) {
      this.loginError = 'An unexpected error occurred. Please try again.';
      this.isLoading = false;
      this.triggerShake();
    }
  }

  validateForm(): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    let isValid = true;
    
    if (!this.email) {
      this.emailError = 'Email is required';
      isValid = false;
    } else if (!emailRegex.test(this.email)) {
      this.emailError = 'Please enter a valid email';
      isValid = false;
    }

    if (!this.password) {
      this.passwordError = 'Password is required';
      isValid = false;
    } else if (this.password.length < 6) {
      this.passwordError = 'At least 6 characters';
      isValid = false;
    }

    return isValid;
  }

  clearErrors() {
    this.emailError = '';
    this.passwordError = '';
    this.loginError = '';
  }

  clearFieldError(field: string) {
    if (field === 'email') {
      this.emailError = '';
    } else if (field === 'password') {
      this.passwordError = '';
    }
    this.loginError = '';
  }

  showSuccess() {
    this.successMessage = true;
    this.isLoading = false;
  }

  togglePassword() {
    if (!this.isLoading) {
      this.showPassword = !this.showPassword;
    }
  }

  onEmailFocus() {
    this.emailFocused = true;
    this.emailError = '';
  }

  onEmailBlur() {
    this.emailFocused = false;
    if (this.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(this.email)) {
        this.emailError = 'Enter a valid email';
      }
    }
  }

  onPasswordFocus() {
    this.passwordFocused = true;
    this.passwordError = '';
  }

  onPasswordBlur() {
    this.passwordFocused = false;
    if (this.password && this.password.length < 6) {
      this.passwordError = 'At least 6 characters';
    }
  }

  onForgotPassword(event: Event) {
    event.preventDefault();
    if (!this.email) {
      this.loginError = 'Please enter your email to reset password';
      return;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.email)) {
      this.loginError = 'Please enter a valid email address';
      return;
    }
    
    alert(`Password reset link will be sent to: ${this.email}\n(This is a demo - no email will actually be sent)`);
  }

  quickAccess() {
    if (!this.isLoading) {
      this.router.navigate(['/dashboard']);
    }
  }

  private triggerShake() {
    const form = document.getElementById('loginForm');
    if (form) {
      form.classList.add('shake');
      setTimeout(() => {
        form.classList.remove('shake');
      }, 600);
    }
  }
}