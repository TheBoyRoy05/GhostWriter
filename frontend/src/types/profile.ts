export interface Profile {
  id: string;
  name: string | null;
  personal_website: string | null;
  github: string | null;
  linkedin: string | null;
  email: string | null;
  phone: string | null;
  hobbies: string | null;
  location: string | null;
  citizenship: boolean | null;
  resume?: unknown;
  created_at: string;
  updated_at: string;
}

export interface SignUpProfileInput {
  name: string;
  personal_website: string;
  github: string;
  linkedin: string;
  email: string;
  phone: string;
  hobbies: string;
  location: string;
  citizenship: boolean | null;
}
