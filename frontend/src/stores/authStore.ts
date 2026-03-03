import type { User, Session } from "@supabase/supabase-js";
import { create } from "zustand";
import { supabase } from "@/utils/supabase";
import type { Profile } from "@/types/profile";

function profileFromUserMetadata(user: User | null): Profile | null {
  if (!user) return null;
  const m = user.user_metadata ?? {};
  return {
    id: user.id,
    name: m.name ?? null,
    personal_website: m.personal_website ?? null,
    github: m.github ?? null,
    linkedin: m.linkedin ?? null,
    email: m.email ?? null,
    phone: m.phone ?? null,
    hobbies: m.hobbies ?? null,
    created_at: user.created_at,
    updated_at: user.updated_at ?? user.created_at,
  };
}

interface ProfileInput {
  name: string;
  personal_website: string;
  github: string;
  linkedin: string;
  email: string;
  phone: string;
  hobbies: string;
}

interface AuthStore {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, profile: ProfileInput) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  init: () => () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  session: null,
  profile: null,
  loading: true,

  signIn: async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  },

  signUp: async (email: string, password: string, profileData: ProfileInput) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: profileData.name || null,
          personal_website: profileData.personal_website || null,
          github: profileData.github || null,
          linkedin: profileData.linkedin || null,
          email: profileData.email || null,
          phone: profileData.phone || null,
          hobbies: profileData.hobbies || null,
        },
      },
    });
    return { error: error as Error | null };
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ profile: null });
  },

  refreshProfile: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    set({ profile: profileFromUserMetadata(user) });
  },

  init: () => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      set({
        session,
        user: session?.user ?? null,
        profile: profileFromUserMetadata(session?.user ?? null),
        loading: false,
      });
    });
    return () => subscription.unsubscribe();
  },
}));
