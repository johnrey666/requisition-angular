import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { Session } from '@supabase/supabase-js';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private isAuthenticatedFlag = false;
  private authCheckComplete = false;
  
  constructor(
    private supabase: SupabaseService,
    private router: Router
  ) {
    this.initializeAuth();
  }

  // Initialize auth state listener
  private initializeAuth() {
    this.supabase.onAuthStateChange((event: string, session: Session | null) => {
      console.log('Auth state changed:', event, session);
      this.isAuthenticatedFlag = !!session;
      this.authCheckComplete = true;
      
      if (event === 'SIGNED_IN') {
        console.log('User signed in');
      } else if (event === 'SIGNED_OUT') {
        console.log('User signed out');
        this.router.navigate(['/login']);
      } else if (event === 'TOKEN_REFRESHED') {
        console.log('Token refreshed');
      }
    });
  }

  // Login with email and password
  async login(email: string, password: string): Promise<{success: boolean; error?: string; message?: string}> {
    try {
      console.log('Attempting login for:', email);
      
      const { data, error } = await this.supabase.signIn(email, password);
      
      if (error) {
        console.error('Supabase login error:', error);
        return { 
          success: false, 
          error: this.getErrorMessage(error) 
        };
      }
      
      if (data.user && data.session) {
        console.log('Login successful:', data.user.email);
        this.isAuthenticatedFlag = true;
        return { 
          success: true,
          message: 'Login successful!'
        };
      } else {
        console.error('No user or session data returned');
        return { 
          success: false, 
          error: 'Login failed. Please try again.' 
        };
      }
    } catch (error: any) {
      console.error('Login exception:', error);
      return { 
        success: false, 
        error: 'An unexpected error occurred. Please try again.' 
      };
    }
  }

  // Sign up new user
  async signUp(email: string, password: string): Promise<{success: boolean; error?: string; message?: string}> {
    try {
      // Need to access supabase client directly for signUp
      const supabaseClient = (this.supabase as any).client || (this.supabase as any).supabase;
      if (!supabaseClient) {
        return { 
          success: false, 
          error: 'Supabase client not available' 
        };
      }

      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`
        }
      });
      
      if (error) {
        return { 
          success: false, 
          error: this.getErrorMessage(error) 
        };
      }
      
      if (data.user) {
        return { 
          success: true, 
          message: data.user.identities?.length === 0 
            ? 'Signup successful! Please check your email to confirm your account.' 
            : 'Signup successful! You can now log in.' 
        };
      }
      
      return { 
        success: false, 
        error: 'Signup failed. Please try again.' 
      };
    } catch (error: any) {
      console.error('Signup exception:', error);
      return { 
        success: false, 
        error: 'An unexpected error occurred.' 
      };
    }
  }

  // Get user-friendly error messages
  private getErrorMessage(error: any): string {
    const errorMap: {[key: string]: string} = {
      'Invalid login credentials': 'Invalid email or password.',
      'Email not confirmed': 'Please confirm your email address.',
      'User not found': 'No account found with this email.',
      'Invalid email': 'Please enter a valid email address.',
      'Weak password': 'Password must be at least 6 characters.',
      'Network error': 'Network error. Please check your connection.',
      'User already registered': 'An account with this email already exists.',
      'Password should be at least 6 characters': 'Password must be at least 6 characters.',
      'Auth session missing!': 'Session expired. Please login again.'
    };

    const message = error.message || error.toString();
    return errorMap[message] || message || 'Operation failed. Please try again.';
  }

  // Logout
  async logout(): Promise<void> {
    try {
      await this.supabase.signOut();
      this.isAuthenticatedFlag = false;
      this.router.navigate(['/login']);
    } catch (error) {
      console.error('Logout error:', error);
      // Force logout anyway
      this.isAuthenticatedFlag = false;
      this.router.navigate(['/login']);
    }
  }

  // Check if user is authenticated
  async isAuthenticated(): Promise<boolean> {
    if (!this.authCheckComplete) {
      // Wait a bit for auth state to initialize
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    try {
      const { data } = await this.supabase.getSession();
      this.isAuthenticatedFlag = !!data.session;
      return this.isAuthenticatedFlag;
    } catch (error) {
      console.error('Auth check error:', error);
      return this.isAuthenticatedFlag;
    }
  }

  // Get current user
  async getCurrentUser() {
    try {
      const { data } = await this.supabase.getUser();
      return data.user;
    } catch (error) {
      console.error('Get user error:', error);
      return null;
    }
  }

  // Reset password
  async resetPassword(email: string): Promise<{success: boolean; error?: string; message?: string}> {
    try {
      // Need to access supabase client directly
      const supabaseClient = (this.supabase as any).client || (this.supabase as any).supabase;
      if (!supabaseClient) {
        return { 
          success: false, 
          error: 'Supabase client not available' 
        };
      }

      const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      });
      
      if (error) {
        return { 
          success: false, 
          error: this.getErrorMessage(error) 
        };
      }
      
      return { 
        success: true, 
        message: 'Password reset email sent. Please check your inbox.' 
      };
    } catch (error: any) {
      return { 
        success: false, 
        error: 'Failed to send reset email.' 
      };
    }
  }

  // Get supabase client from service
  get client() {
    return (this.supabase as any).client || this.supabase;
  }

  // Get authentication state (synchronous)
  get isAuthenticatedSync(): boolean {
    return this.isAuthenticatedFlag;
  }
}