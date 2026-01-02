import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;
  private supabaseAdmin: SupabaseClient | null = null;

  constructor() {
    // Regular client using anon/public key (safe for browser)
    this.supabase = createClient(
      environment.supabase.url,
      environment.supabase.key
    );

    // Admin client using service_role key (MUST be kept secret!)
    // Only initialize if service_role key is available
    if (environment.supabase.serviceRoleKey) {
      this.supabaseAdmin = createClient(
        environment.supabase.url,
        environment.supabase.serviceRoleKey
      );
      console.log('Supabase admin client initialized (service_role key present)');
    } else {
      console.warn('serviceRoleKey not found in environment — admin operations will fail');
    }
  }

  /**
   * Returns the regular Supabase client (uses anon key)
   * Safe for use in browser / frontend
   */
  getClient(): SupabaseClient {
    return this.supabase;
  }

  /**
   * Returns the admin Supabase client (uses service_role key)
   * REQUIRED for admin actions like creating users without verification
   * NEVER expose service_role key in frontend bundle in production!
   */
  getAdminClient(): SupabaseClient | null {
    if (!this.supabaseAdmin) {
      console.error('Admin client not available — missing service_role key');
    }
    return this.supabaseAdmin;
  }
}