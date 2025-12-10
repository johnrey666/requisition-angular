import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, AuthResponse, AuthChangeEvent, Session } from '@supabase/supabase-js';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(
      environment.supabase.url,
      environment.supabase.key
    );
  }

  // Sign in with email and password
  async signIn(email: string, password: string): Promise<AuthResponse> {
    return await this.supabase.auth.signInWithPassword({
      email,
      password
    });
  }

  // Get current session
  async getSession() {
    return await this.supabase.auth.getSession();
  }

  // Sign out
  async signOut() {
    return await this.supabase.auth.signOut();
  }

  // Get current user
  async getUser() {
    return await this.supabase.auth.getUser();
  }

  // Auth state changes
  onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void) {
    return this.supabase.auth.onAuthStateChange(callback);
  }

  // Get the supabase client
  get client(): SupabaseClient {
    return this.supabase;
  }
}