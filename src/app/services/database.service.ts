import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { User, MasterData, Requisition, RequisitionMaterial } from '../models/database.model';

@Injectable({
  providedIn: 'root'
})
export class DatabaseService {
  constructor(private supabaseService: SupabaseService) {}

  private get supabase() {
    return this.supabaseService.getClient();
  }

  // ========== DEBUG & TESTING METHODS ==========
  async debugCheckUsers(): Promise<void> {
    console.log('=== DEBUG: Checking users ===');
    
    try {
      const { data: { users }, error: authError } = await this.supabase.auth.admin.listUsers();
      
      if (authError) {
        console.warn('Admin API access failed, trying normal auth check:', authError);
        const { data: { user }, error: userError } = await this.supabase.auth.getUser();
        if (userError) {
          console.error('Auth user error:', userError);
        } else {
          console.log('Current auth user:', user);
        }
      } else {
        console.log('Auth users found:', users?.map(u => ({ 
          id: u.id, 
          email: u.email,
          metadata: u.user_metadata 
        })));
      }
      
      const { data: publicUsers, error: publicError } = await this.supabase
        .from('users')
        .select('*');
      
      if (publicError) {
        console.error('Public users error:', publicError);
      } else {
        console.log('Public users found:', publicUsers);
      }
      
    } catch (error) {
      console.error('Debug check error:', error);
    }
  }

  async testLogin(email: string, password: string): Promise<{ success: boolean; message: string; data?: any }> {
    console.log('Testing login with:', { email, password });
    
    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        return { 
          success: false, 
          message: `Login failed: ${error.message}`,
          data: { error }
        };
      }

      await this.supabase.auth.signOut();
      
      return { 
        success: true, 
        message: 'Login test successful',
        data: { user: data.user }
      };
    } catch (error: any) {
      return { 
        success: false, 
        message: `Login test error: ${error.message}`,
        data: { error }
      };
    }
  }

  // ========== USER OPERATIONS ==========
  async getCurrentUser(): Promise<User | null> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) {
        console.log('No authenticated user found');
        return null;
      }

      console.log('Fetching user profile for:', user.id);
      
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('Error fetching user profile:', error);
        
        if (error.code === 'PGRST116') {
          console.log('Creating user profile from auth data');
          return await this.createUserFromAuth(user);
        }
        
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error in getCurrentUser:', error);
      return null;
    }
  }

  private async createUserFromAuth(authUser: any): Promise<User | null> {
    try {
      const userData = {
        id: authUser.id,
        email: authUser.email,
        username: authUser.user_metadata?.username || authUser.email?.split('@')[0] || 'user',
        role: authUser.user_metadata?.role || 'user',
        full_name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0],
        created_at: new Date().toISOString()
      };

      const { data, error } = await this.supabase
        .from('users')
        .insert([userData])
        .select()
        .single();

      if (error) {
        console.error('Error creating user profile:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error in createUserFromAuth:', error);
      return null;
    }
  }

  async login(email: string, password: string): Promise<{ user: User | null; error: any }> {
    try {
      console.log('Login attempt with email:', email);
      
      const { data: authData, error: authError } = await this.supabase.auth.signInWithPassword({
        email,
        password
      });

      if (authError) {
        console.error('Auth login error:', authError);
        return { user: null, error: authError };
      }

      console.log('Auth successful, fetching user profile...');
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const user = await this.getCurrentUser();
      
      if (!user) {
        console.warn('User profile not found after successful auth');
        const createdUser = await this.createUserFromAuth(authData.user);
        if (createdUser) {
          return { user: createdUser, error: null };
        }
        return { user: null, error: { message: 'User profile not found' } };
      }

      return { user, error: null };
    } catch (error: any) {
      console.error('Login exception:', error);
      return { user: null, error };
    }
  }

  async loginWithUsername(username: string, password: string): Promise<{ user: User | null; error: any }> {
    try {
      console.log('Login attempt with username:', username);
      
      const { data: users, error: findError } = await this.supabase
        .from('users')
        .select('email')
        .eq('username', username)
        .limit(1);

      if (findError || !users || users.length === 0) {
        console.error('User not found by username:', username);
        return { user: null, error: { message: 'User not found' } };
      }

      const email = users[0].email;
      console.log('Found email for username:', email);
      
      return await this.login(email, password);
    } catch (error: any) {
      console.error('Login with username exception:', error);
      return { user: null, error };
    }
  }

  async logout(): Promise<void> {
    try {
      await this.supabase.auth.signOut();
      localStorage.removeItem('currentUser');
      localStorage.removeItem('savedUsername');
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  // ========== MASTER DATA OPERATIONS ==========
 async uploadMasterData(data: any[]): Promise<{ success: boolean; count: number; error?: any }> {
  try {
    // Deduplicate rows based on sku_code + raw_material (the conflict keys)
    const uniqueMap = new Map<string, any>();

    data.forEach(row => {
      const formatted = {
        category: row['CATEGORY']?.toString().trim() || null, // Allow null
        sku_code: row['SKU CODE']?.toString().trim() || '',
        sku_name: row['SKU']?.toString().trim() || '',
        quantity_per_unit: row['QUANTITY PER UNIT']?.toString().trim() || '',
        unit: row['UNIT']?.toString().trim() || '',
        quantity_per_pack: row['QUANTITY PER PACK']?.toString().trim() || '',
        pack_unit: row['UNIT2']?.toString().trim() || '',
        raw_material: row['RAW MATERIAL']?.toString().trim() || '',
        quantity_per_batch: row['QUANTITY/BATCH']?.toString().trim() || '',
        batch_unit: row['UNIT4']?.toString().trim() || '',
        type: row['TYPE']?.toString().trim() || ''
      };

      // Create unique key: sku_code|raw_material
      const key = `${formatted.sku_code}|${formatted.raw_material}`;
      
      // Keep the last occurrence (in case of duplicates with slight differences)
      uniqueMap.set(key, formatted);
    });

    const formattedData = Array.from(uniqueMap.values());

    console.log(`Uploading ${formattedData.length} unique master data rows (deduplicated from ${data.length})`);

    const { error } = await this.supabase
      .from('master_data')
      .upsert(formattedData, { onConflict: 'sku_code,raw_material' });

    if (error) {
      console.error('Master data upload error:', error);
      return { success: false, count: 0, error };
    }

    return { success: true, count: formattedData.length };
  } catch (error) {
    console.error('Master data upload exception:', error);
    return { success: false, count: 0, error };
  }
}

  async getMasterData(): Promise<MasterData[]> {
    try {
      const { data, error } = await this.supabase
        .from('master_data')
        .select('*')
        .order('category', { ascending: true });

      if (error) {
        console.error('Error fetching master data:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getMasterData:', error);
      return [];
    }
  }

  async getCategories(): Promise<string[]> {
    try {
      const { data, error } = await this.supabase
        .from('master_data')
        .select('category')
        .order('category', { ascending: true });

      if (error) {
        console.error('Error fetching categories:', error);
        return [];
      }

      const categories = [...new Set(data.map(item => item.category).filter(Boolean))];
      return categories.sort();
    } catch (error) {
      console.error('Error in getCategories:', error);
      return [];
    }
  }

  async getSkusByCategory(category: string): Promise<{ name: string; code: string }[]> {
    try {
      const { data, error } = await this.supabase
        .from('master_data')
        .select('sku_name, sku_code')
        .eq('category', category)
        .order('sku_name', { ascending: true });

      if (error) {
        console.error('Error fetching SKUs:', error);
        return [];
      }

      const map = new Map<string, string>();
      data.forEach(item => {
        const name = item.sku_name?.trim();
        const code = item.sku_code?.trim();
        if (name && code && !map.has(name)) {
          map.set(name, code);
        }
      });

      return Array.from(map, ([name, code]) => ({ name, code }));
    } catch (error) {
      console.error('Error in getSkusByCategory:', error);
      return [];
    }
  }

  // ========== REQUISITION OPERATIONS ==========
  async createRequisition(
    requisitionData: Omit<Requisition, 'id' | 'created_at' | 'updated_at'>,
    materials: any[]
  ): Promise<{ success: boolean; requisitionId?: string; error?: any }> {
    try {
      const { data: requisition, error: requisitionError } = await this.supabase
        .from('requisitions')
        .insert([requisitionData])
        .select()
        .single();

      if (requisitionError) {
        console.error('Requisition creation error:', requisitionError);
        return { success: false, error: requisitionError };
      }

      const formattedMaterials = materials.map(material => ({
        requisition_id: requisition.id,
        material_name: material.name,
        qty_per_batch: material.qty,
        unit: material.unit,
        type: material.type,
        required_qty: material.requiredQty,
        served_qty: material.servedQty || 0,
        remarks: material.remarks || '',
        served_date: material.servedDate,
        is_unserved: material.isUnserved || false
      }));

      const { error: materialsError } = await this.supabase
        .from('requisition_materials')
        .insert(formattedMaterials);

      if (materialsError) {
        console.error('Materials creation error:', materialsError);
        await this.supabase.from('requisitions').delete().eq('id', requisition.id);
        return { success: false, error: materialsError };
      }

      return { success: true, requisitionId: requisition.id };
    } catch (error) {
      console.error('Create requisition exception:', error);
      return { success: false, error };
    }
  }

  async getRequisitions(userId?: string): Promise<Requisition[]> {
    try {
      let query = this.supabase
        .from('requisitions')
        .select('*')
        .order('created_at', { ascending: false });

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching requisitions:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getRequisitions:', error);
      return [];
    }
  }

  async getRequisitionWithMaterials(id: string): Promise<{ requisition: Requisition; materials: RequisitionMaterial[] } | null> {
    try {
      const { data: requisition, error: requisitionError } = await this.supabase
        .from('requisitions')
        .select('*')
        .eq('id', id)
        .single();

      if (requisitionError || !requisition) {
        console.error('Error fetching requisition:', requisitionError);
        return null;
      }

      const { data: materials, error: materialsError } = await this.supabase
        .from('requisition_materials')
        .select('*')
        .eq('requisition_id', id)
        .order('material_name', { ascending: true });

      if (materialsError) {
        console.error('Error fetching materials:', materialsError);
        return { requisition, materials: [] };
      }

      return { requisition, materials: materials || [] };
    } catch (error) {
      console.error('Error in getRequisitionWithMaterials:', error);
      return null;
    }
  }

  async updateRequisition(id: string, updates: Partial<Requisition>): Promise<{ success: boolean; error?: any }> {
    try {
      const { error } = await this.supabase
        .from('requisitions')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      return { success: !error, error };
    } catch (error) {
      console.error('Error in updateRequisition:', error);
      return { success: false, error };
    }
  }

  async updateRequisitionMaterial(id: string, updates: Partial<RequisitionMaterial>): Promise<{ success: boolean; error?: any }> {
    try {
      const { error } = await this.supabase
        .from('requisition_materials')
        .update(updates)
        .eq('id', id);

      return { success: !error, error };
    } catch (error) {
      console.error('Error in updateRequisitionMaterial:', error);
      return { success: false, error };
    }
  }

  async deleteRequisition(id: string): Promise<{ success: boolean; error?: any }> {
    try {
      const { error: materialsError } = await this.supabase
        .from('requisition_materials')
        .delete()
        .eq('requisition_id', id);

      if (materialsError) {
        console.error('Materials deletion error:', materialsError);
        return { success: false, error: materialsError };
      }

      const { error: requisitionError } = await this.supabase
        .from('requisitions')
        .delete()
        .eq('id', id);

      return { success: !requisitionError, error: requisitionError };
    } catch (error) {
      console.error('Error in deleteRequisition:', error);
      return { success: false, error };
    }
  }

  // ========== SYNC OPERATIONS ==========
  async syncToCloud(localData: any): Promise<{ success: boolean; error?: any }> {
    try {
      const { error } = await this.supabase
        .from('cloud_sync')
        .upsert({
          id: 'requisition_system',
          data: localData,
          last_sync: new Date().toISOString(),
          device_info: navigator.userAgent.substring(0, 200)
        });

      return { success: !error, error };
    } catch (error) {
      console.error('Error in syncToCloud:', error);
      return { success: false, error };
    }
  }

  async restoreFromCloud(): Promise<any | null> {
    try {
      const { data, error } = await this.supabase
        .from('cloud_sync')
        .select('data')
        .eq('id', 'requisition_system')
        .single();

      if (error || !data) {
        console.error('Error restoring from cloud:', error);
        return null;
      }

      return data.data;
    } catch (error) {
      console.error('Error in restoreFromCloud:', error);
      return null;
    }
  }

  // ========== USER MANAGEMENT ==========
  async getAllUsers(): Promise<User[]> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) {
        console.log('User not authenticated');
        return [];
      }

      const currentUser = await this.getCurrentUser();
      if (!currentUser || currentUser.role !== 'admin') {
        console.log('User is not admin');
        return [];
      }

      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching all users:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getAllUsers:', error);
      return [];
    }
  }

  async updateUser(userId: string, updates: Partial<User>): Promise<{ success: boolean; error?: any }> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) {
        return { success: false, error: { message: 'Not authenticated' } };
      }

      const currentUser = await this.getCurrentUser();
      if (!currentUser) {
        return { success: false, error: { message: 'User not found' } };
      }

      if (currentUser.role !== 'admin' && currentUser.id !== userId) {
        return { success: false, error: { message: 'Unauthorized' } };
      }

      const { error } = await this.supabase
        .from('users')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      return { success: !error, error };
    } catch (error) {
      console.error('Error in updateUser:', error);
      return { success: false, error };
    }
  }
}