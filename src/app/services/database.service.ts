import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { 
  User, 
  MasterData, 
  Requisition, 
  RequisitionMaterial, 
  DashboardRequisition,
  UserTable,
  RawMaterial,
  MaterialRequisition,
  MaterialRequisitionMaterial,
  POReceipt
} from '../models/database.model';

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
          metadata: u.user_metadata,
          email_confirmed_at: u.email_confirmed_at 
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

  async debugCheckUserDuplicates(email: string, username: string): Promise<void> {
    console.log('=== DEBUG: Checking for user duplicates ===');
    
    try {
      const { data: dbUsers, error: dbError } = await this.supabase
        .from('users')
        .select('*')
        .or(`email.eq.${email},username.eq.${username}`);
      
      if (!dbError) {
        console.log('Database users found:', dbUsers);
      }
      
      try {
        const { data: { users }, error: authError } = await this.supabase.auth.admin.listUsers();
        if (!authError) {
          const authMatches = users?.filter(u => 
            u.email === email || u.user_metadata?.['username'] === username
          );
          console.log('Auth users found:', authMatches?.map(u => ({
            id: u.id,
            email: u.email,
            username: u.user_metadata?.['username'],
            created_at: u.created_at
          })));
        }
      } catch (adminError) {
        console.log('Admin API access not available:', adminError);
      }
      
    } catch (error) {
      console.error('Debug check error:', error);
    }
  }

  // ========== USER OPERATIONS ==========
  async getCurrentUser(): Promise<User | null> {
    try {
      const { data: { user: authUser } } = await this.supabase.auth.getUser();
      if (!authUser) {
        console.log('No authenticated user found');
        return null;
      }

      console.log('Fetching user profile for:', authUser.id);
      
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching user profile:', error);
        return null;
      }

      if (!data) {
        console.log('Creating user profile from auth data');
        return await this.createUserFromAuth(authUser);
      }

      return data;
    } catch (error) {
      console.error('Error in getCurrentUser:', error);
      return null;
    }
  }

  private async createUserFromAuth(authUser: any): Promise<User | null> {
    try {
      const { data: existingUser } = await this.supabase
        .from('users')
        .select('id')
        .eq('id', authUser.id)
        .maybeSingle();

      if (existingUser) {
        console.log('User already exists in profiles table, fetching...');
        const { data: user } = await this.supabase
          .from('users')
          .select('*')
          .eq('id', authUser.id)
          .single();
        return user;
      }

      const userData = {
        id: authUser.id,
        email: authUser.email,
        username: authUser.user_metadata?.['username'] || authUser.email?.split('@')[0] || 'user',
        role: authUser.user_metadata?.['role'] || 'user',
        full_name: authUser.user_metadata?.['full_name'] || authUser.email?.split('@')[0],
        created_at: new Date().toISOString()
      };

      const { data, error } = await this.supabase
        .from('users')
        .insert([userData])
        .select()
        .single();

      if (error) {
        console.error('Error creating user profile:', error);
        
        if (error.code === '23505') {
          const { data: existing } = await this.supabase
            .from('users')
            .select('*')
            .eq('id', authUser.id)
            .single();
          return existing;
        }
        
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
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const { data: { user: authUser } } = await this.supabase.auth.getUser();
      
      if (!authUser) {
        return { user: null, error: { message: 'User not found after login' } };
      }

      console.log('Fetching user profile for:', authUser.id);
      
      const { data: userProfile, error: profileError } = await this.supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();

      if (profileError && profileError.code !== 'PGRST116') {
        console.error('Error fetching user profile:', profileError);
        return { user: null, error: profileError };
      }

      if (!userProfile) {
        console.log('Creating user profile from auth data');
        const newUser = await this.createUserFromAuth(authUser);
        if (newUser) {
          localStorage.setItem('currentUser', JSON.stringify(newUser));
          return { user: newUser, error: null };
        }
        return { user: null, error: { message: 'Failed to create user profile' } };
      }

      localStorage.setItem('currentUser', JSON.stringify(userProfile));
      return { user: userProfile, error: null };
      
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

  // ========== USER CREATION ==========
  async createUserAdmin(
    email: string,
    password: string,
    metadata: { username: string; full_name: string; role: 'user' | 'admin' }
  ): Promise<{ success: boolean; user?: any; error?: any }> {
    try {
      const adminClient = this.supabaseService.getAdminClient();

      if (!adminClient) {
        console.error('Admin client not available — service_role key missing');
        return { success: false, error: { message: 'Admin client not configured' } };
      }

      console.log('Creating user via admin API:', { email, username: metadata.username });

      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          username: metadata.username,
          full_name: metadata.full_name,
          role: metadata.role
        }
      });

      if (error) {
        console.error('Admin createUser error:', error);
        return { success: false, error };
      }

      if (!data?.user) {
        return { success: false, error: { message: 'No user returned from admin create' } };
      }

      const { error: profileError } = await this.supabase
        .from('users')
        .upsert({
          id: data.user.id,
          email: data.user.email,
          username: metadata.username,
          full_name: metadata.full_name,
          role: metadata.role,
          created_at: new Date().toISOString()
        }, { onConflict: 'id' });

      if (profileError && profileError.code !== '23505') {
        console.warn('Could not create user profile (non-duplicate error):', profileError);
      }

      console.log('User created successfully via admin API:', data.user.id);
      return { success: true, user: data.user };

    } catch (error: any) {
      console.error('Exception in createUserAdmin:', error);
      return { success: false, error };
    }
  }

  async createUserWithAutoConfirm(email: string, password: string, userData: Partial<User>): Promise<{ success: boolean; userId?: string; error?: any }> {
    try {
      const username = userData['username'] as string;
      if (!username) {
        return { 
          success: false, 
          error: { 
            message: 'Username is required',
            details: 'Username must be provided'
          } 
        };
      }
      
      const fullName = userData['full_name'] || '';
      const role = userData['role'] || 'user';
      
      console.log('Creating user:', { email, username });
      
      const { data: authData, error: signUpError } = await this.supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: username,
            full_name: fullName,
            role: role
          },
          emailRedirectTo: window.location.origin
        }
      });

      if (signUpError) {
        console.error('Sign up error:', signUpError);
        
        if (signUpError.message?.includes('already registered') || signUpError.message?.includes('already exists')) {
          console.log('User already exists in auth, attempting to sign in...');
          
          const { data: signInData, error: signInError } = await this.supabase.auth.signInWithPassword({
            email,
            password
          });
          
          if (signInError) {
            return { success: false, error: signInError };
          }
          
          const { data: existingProfile } = await this.supabase
            .from('users')
            .select('id')
            .eq('id', signInData.user.id)
            .maybeSingle();
          
          if (existingProfile) {
            console.log('User profile already exists');
            return { 
              success: false, 
              error: { 
                message: 'User already exists',
                details: 'User profile already exists in the database'
              } 
            };
          }
          
          const { error: profileError } = await this.supabase
            .from('users')
            .insert([{
              id: signInData.user.id,
              email: signInData.user.email,
              username: username,
              full_name: fullName,
              role: role,
              created_at: new Date().toISOString()
            }]);

          if (profileError) {
            console.error('Profile creation error after sign in:', profileError);
            return { success: false, error: profileError };
          }
          
          return { success: true, userId: signInData.user.id };
        }
        
        return { success: false, error: signUpError };
      }

      if (!authData.user) {
        return { success: false, error: { message: 'User creation failed - no user returned' } };
      }

      const userId = authData.user.id;
      
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const { data: existingProfile, error: checkError } = await this.supabase
        .from('users')
        .select('id')
        .eq('id', userId)
        .maybeSingle();

      if (checkError) {
        console.error('Error checking for existing profile:', checkError);
      }

      if (existingProfile) {
        console.log('User profile already exists (likely created by trigger), returning success.');
        return { success: true, userId: userId };
      }
      
      const { error: profileError } = await this.supabase
        .from('users')
        .insert([{
          id: userId,
          email: authData.user.email,
          username: username,
          full_name: fullName,
          role: role,
          created_at: new Date().toISOString()
        }]);

      if (profileError) {
        console.error('Profile creation error:', profileError);
        
        if (profileError.code === '23505') {
          console.log('Profile was created concurrently, returning success.');
          return { success: true, userId: userId };
        }
        
        console.log('Retrying with upsert...');
        const { error: upsertError } = await this.supabase
          .from('users')
          .upsert({
            id: userId,
            email: authData.user.email,
            username: username,
            full_name: fullName,
            role: role,
            created_at: new Date().toISOString()
          }, { onConflict: 'id' });

        if (upsertError) {
          console.error('Upsert also failed:', upsertError);
          return { success: false, error: upsertError };
        }
        
        return { success: true, userId: userId };
      }

      console.log('User created successfully:', userId);
      return { success: true, userId: userId };
      
    } catch (error: any) {
      console.error('Error in createUserWithAutoConfirm:', error);
      return { success: false, error };
    }
  }

  // ========== MASTER DATA OPERATIONS ==========
  async uploadMasterData(data: any[]): Promise<{ success: boolean; count: number; error?: any }> {
    try {
      const uniqueMap = new Map<string, any>();

      data.forEach(row => {
        const formatted = {
          category: row['CATEGORY']?.toString().trim() || null,
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

        const key = `${formatted.sku_code}|${formatted.raw_material}`;
        uniqueMap.set(key, formatted);
      });

      const formattedData = Array.from(uniqueMap.values());

      console.log(`Uploading ${formattedData.length} unique master data rows`);

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

  // ========== MATERIAL REQUISITION OPERATIONS ==========
  async createRequisition(
    requisitionData: any, 
    materials: any[] = []
  ): Promise<{ success: boolean; requisitionId?: string; error?: any }> {
    try {
      console.log('Creating requisition in material_requisitions table:', requisitionData);
      
      const { data: requisition, error: requisitionError } = await this.supabase
        .from('material_requisitions')
        .insert([{
          ...requisitionData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (requisitionError) {
        console.error('Material requisition creation error:', requisitionError);
        return { success: false, error: requisitionError };
      }

      if (materials.length > 0) {
        const formattedMaterials = materials.map(material => ({
          requisition_id: requisition.id,
          material_name: material.name,
          type: material.type || 'raw-material',
          qty_per_batch: material.qty || 1,
          unit: material.unit || 'kg',
          required_qty: material.requiredQty || 1,
          served_qty: material.servedQty || 0,
          remarks: material.remarks || '',
          served_date: material.servedDate,
          is_unserved: material.isUnserved || false,
          brand: material.brand || '',
          supplier: material.supplier || '',
          status: material.status || 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }));

        const { error: materialsError } = await this.supabase
          .from('material_requisition_materials')
          .insert(formattedMaterials);

        if (materialsError) {
          await this.supabase.from('material_requisitions').delete().eq('id', requisition.id);
          console.error('Materials creation error:', materialsError);
          return { success: false, error: materialsError };
        }
      }

      return { success: true, requisitionId: requisition.id };
    } catch (error: any) {
      console.error('Create requisition exception:', error);
      return { success: false, error };
    }
  }

  async getTableRequisitions(tableId: string): Promise<MaterialRequisition[]> {
    try {
      const { data, error } = await this.supabase
        .from('material_requisitions')
        .select(`
          *,
          materials:material_requisition_materials(*)
        `)
        .eq('table_id', tableId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Get material requisitions error:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Get material requisitions exception:', error);
      return [];
    }
  }

  async deleteRequisition(requisitionId: string): Promise<{ success: boolean; error?: any }> {
    try {
      const { error: materialsError } = await this.supabase
        .from('material_requisition_materials')
        .delete()
        .eq('requisition_id', requisitionId);

      if (materialsError) {
        console.error('Delete materials error:', materialsError);
        return { success: false, error: materialsError };
      }

      const { error: requisitionError } = await this.supabase
        .from('material_requisitions')
        .delete()
        .eq('id', requisitionId);

      if (requisitionError) {
        console.error('Delete material requisition error:', requisitionError);
        return { success: false, error: requisitionError };
      }

      return { success: true };
    } catch (error: any) {
      console.error('Delete requisition exception:', error);
      return { success: false, error };
    }
  }

  async updateRequisitionQty(requisitionId: string, qty: number): Promise<{ success: boolean; error?: any }> {
    try {
      const { error } = await this.supabase
        .from('material_requisitions')
        .update({
          qty_needed: qty,
          updated_at: new Date().toISOString()
        })
        .eq('id', requisitionId);

      return { success: !error, error };
    } catch (error: any) {
      console.error('Error in updateRequisitionQty:', error);
      return { success: false, error };
    }
  }

  async updateRequisitionSupplier(requisitionId: string, supplier: string): Promise<{ success: boolean; error?: any }> {
    try {
      const { error } = await this.supabase
        .from('material_requisitions')
        .update({
          supplier: supplier,
          updated_at: new Date().toISOString()
        })
        .eq('id', requisitionId);

      return { success: !error, error };
    } catch (error: any) {
      console.error('Error in updateRequisitionSupplier:', error);
      return { success: false, error };
    }
  }

  async updateMaterialServedQty(requisitionId: string, materialName: string, servedQty: number, remarks?: string): Promise<{ success: boolean; error?: any }> {
    try {
      const updates: any = {
        served_qty: servedQty,
        updated_at: new Date().toISOString(),
        served_date: new Date().toISOString(),
        is_unserved: servedQty < 1
      };

      if (remarks !== undefined) {
        updates.remarks = remarks;
      }

      const { error } = await this.supabase
        .from('material_requisition_materials')
        .update(updates)
        .eq('requisition_id', requisitionId)
        .eq('material_name', materialName);

      return { success: !error, error };
    } catch (error: any) {
      console.error('Error in updateMaterialServedQty:', error);
      return { success: false, error };
    }
  }

  // ========== NEW REQUISITION UPDATE METHODS ==========
  async updateRequisitionDateNeeded(requisitionId: string, dateNeeded?: Date): Promise<{ success: boolean; error?: any }> {
    try {
      const { error } = await this.supabase
        .from('material_requisitions')
        .update({
          date_needed: dateNeeded ? dateNeeded.toISOString() : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', requisitionId);

      return { success: !error, error };
    } catch (error: any) {
      console.error('Error in updateRequisitionDateNeeded:', error);
      return { success: false, error };
    }
  }

  async updateRequisitionBrand(requisitionId: string, brand: string): Promise<{ success: boolean; error?: any }> {
    try {
      const { error } = await this.supabase
        .from('material_requisitions')
        .update({
          brand: brand,
          updated_at: new Date().toISOString()
        })
        .eq('id', requisitionId);

      return { success: !error, error };
    } catch (error: any) {
      console.error('Error in updateRequisitionBrand:', error);
      return { success: false, error };
    }
  }

  // ========== LEGACY REQUISITION OPERATIONS ==========
  async createLegacyRequisition(
    requisitionData: Omit<Requisition, 'id' | 'created_at' | 'updated_at'>,
    materials: any[],
    tableId?: string
  ): Promise<{ success: boolean; requisitionId?: string; error?: any }> {
    try {
      const requisitionWithTable = {
        ...requisitionData,
        table_id: tableId
      };

      const { data: requisition, error: requisitionError } = await this.supabase
        .from('requisitions')
        .insert([requisitionWithTable])
        .select()
        .single();

      if (requisitionError) {
        console.error('Legacy requisition creation error:', requisitionError);
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
        console.error('Legacy materials creation error:', materialsError);
        await this.supabase.from('requisitions').delete().eq('id', requisition.id);
        return { success: false, error: materialsError };
      }

      return { success: true, requisitionId: requisition.id };
    } catch (error) {
      console.error('Create legacy requisition exception:', error);
      return { success: false, error };
    }
  }

  async updateLegacyRequisition(
    id: string,
    requisitionData: Partial<Requisition>,
    materials?: any[]
  ): Promise<{ success: boolean; error?: any }> {
    try {
      const { error: requisitionError } = await this.supabase
        .from('requisitions')
        .update({
          ...requisitionData,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (requisitionError) {
        console.error('Legacy requisition update error:', requisitionError);
        return { success: false, error: requisitionError };
      }

      if (materials && materials.length > 0) {
        const { error: deleteError } = await this.supabase
          .from('requisition_materials')
          .delete()
          .eq('requisition_id', id);

        if (deleteError) {
          console.error('Error deleting existing legacy materials:', deleteError);
          return { success: false, error: deleteError };
        }

        const formattedMaterials = materials.map(material => ({
          requisition_id: id,
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
          console.error('Legacy materials update error:', materialsError);
          return { success: false, error: materialsError };
        }
      }

      return { success: true };
    } catch (error) {
      console.error('Error in updateLegacyRequisition:', error);
      return { success: false, error };
    }
  }

  async getLegacyRequisitions(userId?: string): Promise<Requisition[]> {
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
        console.error('Error fetching legacy requisitions:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getLegacyRequisitions:', error);
      return [];
    }
  }

  async getLegacyRequisitionWithMaterials(id: string): Promise<{ requisition: Requisition; materials: RequisitionMaterial[] } | null> {
    try {
      const { data: requisition, error: requisitionError } = await this.supabase
        .from('requisitions')
        .select('*')
        .eq('id', id)
        .single();

      if (requisitionError || !requisition) {
        console.error('Error fetching legacy requisition:', requisitionError);
        return null;
      }

      const { data: materials, error: materialsError } = await this.supabase
        .from('requisition_materials')
        .select('*')
        .eq('requisition_id', id)
        .order('material_name', { ascending: true });

      if (materialsError) {
        console.error('Error fetching legacy materials:', materialsError);
        return { requisition, materials: [] };
      }

      return { requisition, materials: materials || [] };
    } catch (error) {
      console.error('Error in getLegacyRequisitionWithMaterials:', error);
      return null;
    }
  }

  async updateLegacyRequisitionMaterial(id: string, updates: Partial<RequisitionMaterial>): Promise<{ success: boolean; error?: any }> {
    try {
      const { error } = await this.supabase
        .from('requisition_materials')
        .update(updates)
        .eq('id', id);

      return { success: !error, error };
    } catch (error) {
      console.error('Error in updateLegacyRequisitionMaterial:', error);
      return { success: false, error };
    }
  }

  async deleteLegacyRequisition(id: string): Promise<{ success: boolean; error?: any }> {
    try {
      const { error: materialsError } = await this.supabase
        .from('requisition_materials')
        .delete()
        .eq('requisition_id', id);

      if (materialsError) {
        console.error('Legacy materials deletion error:', materialsError);
        return { success: false, error: materialsError };
      }

      const { error: requisitionError } = await this.supabase
        .from('requisitions')
        .delete()
        .eq('id', id);

      return { success: !requisitionError, error: requisitionError };
    } catch (error) {
      console.error('Error in deleteLegacyRequisition:', error);
      return { success: false, error };
    }
  }

  // ========== TABLE MANAGEMENT OPERATIONS ==========
  async getUserTables(userId: string): Promise<UserTable[]> {
    try {
      const { data, error } = await this.supabase
        .from('user_tables')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching user tables:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getUserTables:', error);
      return [];
    }
  }

  async getTableById(tableId: string): Promise<UserTable | null> {
    try {
      const { data, error } = await this.supabase
        .from('user_tables')
        .select('*')
        .eq('id', tableId)
        .single();

      if (error) {
        console.error('Error fetching table by ID:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error in getTableById:', error);
      return null;
    }
  }

  async createUserTable(tableData: Omit<UserTable, 'id' | 'created_at' | 'updated_at'>): 
    Promise<{ success: boolean; tableId?: string; error?: any }> {
    try {
      const { data, error } = await this.supabase
        .from('user_tables')
        .insert([{
          ...tableData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) {
        console.error('Error creating user table:', error);
        return { success: false, error };
      }

      return { success: true, tableId: data.id };
    } catch (error) {
      console.error('Error in createUserTable:', error);
      return { success: false, error };
    }
  }

  async updateTableName(tableId: string, newName: string): Promise<{ success: boolean; error?: any }> {
    try {
      const { error } = await this.supabase
        .from('user_tables')
        .update({
          name: newName,
          updated_at: new Date().toISOString()
        })
        .eq('id', tableId);

      return { success: !error, error };
    } catch (error) {
      console.error('Error in updateTableName:', error);
      return { success: false, error };
    }
  }

  async updateTableItemCount(tableId: string, itemCount: number): Promise<{ success: boolean; error?: any }> {
    try {
      const { error } = await this.supabase
        .from('user_tables')
        .update({
          item_count: itemCount,
          updated_at: new Date().toISOString()
        })
        .eq('id', tableId);

      return { success: !error, error };
    } catch (error) {
      console.error('Error in updateTableItemCount:', error);
      return { success: false, error };
    }
  }

  async updateTableDateNeeded(tableId: string, dateNeeded?: Date): Promise<{ success: boolean; error?: any }> {
    try {
      const { error } = await this.supabase
        .from('user_tables')
        .update({
          date_needed: dateNeeded ? dateNeeded.toISOString() : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', tableId);

      return { success: !error, error };
    } catch (error: any) {
      console.error('Error in updateTableDateNeeded:', error);
      return { success: false, error };
    }
  }

  async deleteTable(tableId: string): Promise<{ success: boolean; error?: any }> {
    try {
      const { data: requisitions, error: getReqsError } = await this.supabase
        .from('material_requisitions')
        .select('id')
        .eq('table_id', tableId);

      if (getReqsError) {
        console.error('Error getting requisitions for table:', getReqsError);
      }

      if (requisitions && requisitions.length > 0) {
        const requisitionIds = requisitions.map(r => r.id);
        for (const reqId of requisitionIds) {
          const { error: materialsError } = await this.supabase
            .from('material_requisition_materials')
            .delete()
            .eq('requisition_id', reqId);

          if (materialsError) {
            console.error('Error deleting materials for requisition:', reqId, materialsError);
          }
        }

        const { error: requisitionsError } = await this.supabase
          .from('material_requisitions')
          .delete()
          .eq('table_id', tableId);

        if (requisitionsError) {
          console.error('Error deleting table requisitions:', requisitionsError);
          return { success: false, error: requisitionsError };
        }
      }

      const { error: legacyReqsError } = await this.supabase
        .from('requisitions')
        .delete()
        .eq('table_id', tableId);

      if (legacyReqsError) {
        console.error('Error deleting legacy table requisitions:', legacyReqsError);
      }

      // Delete PO receipts for this table
      const { error: poReceiptsError } = await this.supabase
        .from('po_receipts')
        .delete()
        .eq('table_id', tableId);

      if (poReceiptsError) {
        console.error('Error deleting PO receipts:', poReceiptsError);
      }

      const { error: tableError } = await this.supabase
        .from('user_tables')
        .delete()
        .eq('id', tableId);

      return { success: !tableError, error: tableError };
    } catch (error) {
      console.error('Error in deleteTable:', error);
      return { success: false, error };
    }
  }

  async submitTableForApproval(tableId: string, submittedBy: string): Promise<{ success: boolean; error?: any }> {
    try {
      const { error } = await this.supabase
        .from('user_tables')
        .update({
          status: 'submitted',
          submitted_by: submittedBy,
          submitted_date: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', tableId);

      if (error) {
        console.error('Error submitting table for approval:', error);
        return { success: false, error };
      }

      const { error: materialReqsError } = await this.supabase
        .from('material_requisitions')
        .update({
          status: 'submitted',
          submitted_by: submittedBy,
          submitted_date: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('table_id', tableId)
        .eq('status', 'draft');

      if (materialReqsError) {
        console.error('Error updating material requisitions status:', materialReqsError);
      }

      const { error: legacyReqsError } = await this.supabase
        .from('requisitions')
        .update({
          status: 'submitted',
          submitted_by: submittedBy,
          submitted_date: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('table_id', tableId)
        .eq('status', 'draft');

      if (legacyReqsError) {
        console.error('Error updating legacy requisitions status:', legacyReqsError);
      }

      return { success: true };
    } catch (error) {
      console.error('Error in submitTableForApproval:', error);
      return { success: false, error };
    }
  }

  async getPendingApprovals(): Promise<UserTable[]> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) {
        return [];
      }

      const currentUser = await this.getCurrentUser();
      if (!currentUser || currentUser.role !== 'admin') {
        return [];
      }

      const { data, error } = await this.supabase
        .from('user_tables')
        .select('*')
        .eq('status', 'submitted')
        .order('submitted_date', { ascending: true });

      if (error) {
        console.error('Error fetching pending approvals:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getPendingApprovals:', error);
      return [];
    }
  }

  async approveTable(tableId: string, approvedBy: string, remarks?: string): Promise<{ success: boolean; error?: any }> {
    try {
      const { error } = await this.supabase
        .from('user_tables')
        .update({
          status: 'approved',
          approved_by: approvedBy,
          approved_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          remarks: remarks
        })
        .eq('id', tableId);

      if (error) {
        console.error('Error approving table:', error);
        return { success: false, error };
      }

      const { error: materialReqsError } = await this.supabase
        .from('material_requisitions')
        .update({
          status: 'approved',
          approved_by: approvedBy,
          approved_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          remarks: remarks
        })
        .eq('table_id', tableId)
        .eq('status', 'submitted');

      if (materialReqsError) {
        console.error('Error updating material requisitions status:', materialReqsError);
      }

      const { error: legacyReqsError } = await this.supabase
        .from('requisitions')
        .update({
          status: 'approved',
          approved_by: approvedBy,
          approved_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          remarks: remarks
        })
        .eq('table_id', tableId)
        .eq('status', 'submitted');

      if (legacyReqsError) {
        console.error('Error updating legacy requisitions status:', legacyReqsError);
      }

      return { success: true };
    } catch (error) {
      console.error('Error in approveTable:', error);
      return { success: false, error };
    }
  }

  async rejectTable(tableId: string, reviewedBy: string, remarks: string): Promise<{ success: boolean; error?: any }> {
    try {
      const { error } = await this.supabase
        .from('user_tables')
        .update({
          status: 'rejected',
          reviewed_by: reviewedBy,
          reviewed_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          remarks: remarks
        })
        .eq('id', tableId);

      if (error) {
        console.error('Error rejecting table:', error);
        return { success: false, error };
      }

      const { error: materialReqsError } = await this.supabase
        .from('material_requisitions')
        .update({
          status: 'rejected',
          reviewed_by: reviewedBy,
          reviewed_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          remarks: remarks
        })
        .eq('table_id', tableId)
        .eq('status', 'submitted');

      if (materialReqsError) {
        console.error('Error updating material requisitions status:', materialReqsError);
      }

      const { error: legacyReqsError } = await this.supabase
        .from('requisitions')
        .update({
          status: 'rejected',
          reviewed_by: reviewedBy,
          reviewed_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          remarks: remarks
        })
        .eq('table_id', tableId)
        .eq('status', 'submitted');

      if (legacyReqsError) {
        console.error('Error updating legacy requisitions status:', legacyReqsError);
      }

      return { success: true };
    } catch (error) {
      console.error('Error in rejectTable:', error);
      return { success: false, error };
    }
  }

  async updateTableItems(tableId: string, items: DashboardRequisition[], fileName?: string): Promise<{ success: boolean; error?: any }> {
    try {
      console.log(`Updating ${items.length} items for table ${tableId}`);
      
      await this.updateTableItemCount(tableId, items.length);
      
      return { success: true };
    } catch (error) {
      console.error('Error in updateTableItems:', error);
      return { success: false, error };
    }
  }

  // ========== PO RECEIPT OPERATIONS ==========
  async getPOReceiptsByTable(tableId: string): Promise<POReceipt[]> {
    try {
      const { data, error } = await this.supabase
        .from('po_receipts')
        .select('*')
        .eq('table_id', tableId)
        .order('receipt_date', { ascending: false });

      if (error) {
        console.error('Error fetching PO receipts:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getPOReceiptsByTable:', error);
      return [];
    }
  }

  async createPOReceipt(poReceiptData: Partial<POReceipt>): Promise<{ success: boolean; receiptId?: string; error?: any }> {
    try {
      const { data, error } = await this.supabase
        .from('po_receipts')
        .insert([{
          ...poReceiptData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) {
        console.error('Error creating PO receipt:', error);
        return { success: false, error };
      }

      return { success: true, receiptId: data.id };
    } catch (error: any) {
      console.error('Error in createPOReceipt:', error);
      return { success: false, error };
    }
  }

  async updatePOReceipt(receiptId: string, updates: Partial<POReceipt>): Promise<{ success: boolean; error?: any }> {
    try {
      const { error } = await this.supabase
        .from('po_receipts')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', receiptId);

      return { success: !error, error };
    } catch (error: any) {
      console.error('Error in updatePOReceipt:', error);
      return { success: false, error };
    }
  }

  async deletePOReceipt(receiptId: string): Promise<{ success: boolean; error?: any }> {
    try {
      const { error } = await this.supabase
        .from('po_receipts')
        .delete()
        .eq('id', receiptId);

      return { success: !error, error };
    } catch (error: any) {
      console.error('Error in deletePOReceipt:', error);
      return { success: false, error };
    }
  }

  async verifyPOReceipt(receiptId: string, verifiedBy: string): Promise<{ success: boolean; error?: any }> {
    try {
      const { error } = await this.supabase
        .from('po_receipts')
        .update({
          status: 'verified',
          verified_by: verifiedBy,
          verified_date: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', receiptId);

      return { success: !error, error };
    } catch (error: any) {
      console.error('Error in verifyPOReceipt:', error);
      return { success: false, error };
    }
  }

  // ========== SUPPLIER AND BRAND OPERATIONS ==========
  async getSuppliers(): Promise<string[]> {
    try {
      const { data, error } = await this.supabase
        .from('suppliers')
        .select('name')
        .order('name', { ascending: true });

      if (error) {
        console.error('Error fetching suppliers:', error);
        return [];
      }

      return data.map(s => s.name).filter(Boolean);
    } catch (error) {
      console.error('Error in getSuppliers:', error);
      return [];
    }
  }

  async getBrands(): Promise<string[]> {
    try {
      const { data, error } = await this.supabase
        .from('brands')
        .select('name')
        .order('name', { ascending: true });

      if (error) {
        console.error('Error fetching brands:', error);
        return [];
      }

      return data.map(b => b.name).filter(Boolean);
    } catch (error) {
      console.error('Error in getBrands:', error);
      return [];
    }
  }

  async addSupplier(name: string): Promise<{ success: boolean; error?: any }> {
    try {
      const { error } = await this.supabase
        .from('suppliers')
        .upsert([{ name }], { onConflict: 'name' });

      return { success: !error, error };
    } catch (error) {
      console.error('Error in addSupplier:', error);
      return { success: false, error };
    }
  }

  async addBrand(name: string): Promise<{ success: boolean; error?: any }> {
    try {
      const { error } = await this.supabase
        .from('brands')
        .upsert([{ name }], { onConflict: 'name' });

      return { success: !error, error };
    } catch (error) {
      console.error('Error in addBrand:', error);
      return { success: false, error };
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