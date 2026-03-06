import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuthStore } from "@/stores/authStore";
import { supabase, supabaseUrl, supabaseAnonKey } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";

const profileSchema = z.object({
  name: z.string().min(1, "Name is required"),
  personal_website: z.string().optional(),
  github: z.string().optional(),
  linkedin: z
    .string()
    .min(1, "LinkedIn URL is required")
    .refine((val) => !/linkedin\.com\/me\/?$/.test(val.trim()), {
      message: "Use your full profile URL (e.g. linkedin.com/in/yourname), not linkedin.com/me",
    })
    .refine((val) => /^(https?:\/\/)?(www\.)?linkedin\.com\/in\/[^/]+/.test(val.trim()), {
      message: "Enter a valid LinkedIn profile URL (e.g. https://linkedin.com/in/username)",
    }),
  profile_email: z.union([z.string().email(), z.literal("")]).optional(),
  phone: z.string().optional(),
  hobbies: z.string().optional(),
  location: z.string().optional(),
  citizenship: z.enum(["yes", "no", ""]).optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

const Profile = () => {
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const loading = useAuthStore((s) => s.loading);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const navigate = useNavigate();
  const { toast } = useToast();

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: "",
      personal_website: "",
      github: "",
      linkedin: "",
      profile_email: "",
      phone: "",
      hobbies: "",
      location: "",
      citizenship: "",
    },
  });

  useEffect(() => {
    if (profile || user) {
      form.reset({
        name: profile?.name ?? "",
        personal_website: profile?.personal_website ?? "",
        github: profile?.github ?? "",
        linkedin: profile?.linkedin ?? "",
        profile_email: profile?.email ?? user?.email ?? "",
        phone: profile?.phone ?? "",
        hobbies: profile?.hobbies ?? "",
        location: profile?.location ?? "",
        citizenship:
          profile?.citizenship === true ? "yes" : profile?.citizenship === false ? "no" : "",
      });
    }
  }, [profile, user]);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/sign-in");
    }
  }, [user, loading, navigate]);

  const connectExtension = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const linkedinUrl = form.getValues("linkedin") || profile?.linkedin;
    if (!session || !supabaseUrl || !supabaseAnonKey) {
      toast({
        title: "Connection failed",
        description: "Please sign in first.",
        variant: "destructive",
      });
      return;
    }
    if (!linkedinUrl?.trim()) {
      toast({
        title: "LinkedIn required",
        description: "Save your LinkedIn URL in the profile first.",
        variant: "destructive",
      });
      return;
    }
    const normalizedLinkedin = linkedinUrl.trim().startsWith("http")
      ? linkedinUrl.trim()
      : `https://${linkedinUrl.trim()}`;
    window.postMessage(
      {
        type: "GHOST_WRITER_CONNECT",
        session: session,
        supabaseUrl,
        supabaseAnonKey,
        linkedin: normalizedLinkedin,
      },
      "*",
    );
    window.addEventListener(
      "message",
      (e) => {
        if (e.data?.type === "GHOST_WRITER_CONNECTED") {
          if (e.data.success) {
            toast({
              title: "Extension connected",
              description: "You can now scrape your LinkedIn profile.",
            });
          } else {
            toast({
              title: "Connection failed",
              description: "Make sure the GhostWriter extension is installed.",
              variant: "destructive",
            });
          }
        }
      },
      { once: true },
    );
    toast({
      title: "Connecting...",
      description: "If the extension is installed, it should connect.",
    });
  };

  const onSubmit = async (values: ProfileFormValues) => {
    const { error } = await updateProfile({
      name: values.name,
      personal_website: values.personal_website ?? "",
      github: values.github ?? "",
      linkedin: values.linkedin ?? "",
      email: values.profile_email ?? user?.email ?? "",
      phone: values.phone ?? "",
      hobbies: values.hobbies ?? "",
      location: values.location ?? "",
      citizenship: values.citizenship === "yes" ? true : values.citizenship === "no" ? false : null,
    });

    if (error) {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Profile updated",
      description: "Your profile has been saved.",
    });
  };

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-10">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>
              Update your profile details. Fields marked with * are required.
            </CardDescription>
          </CardHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full name *</FormLabel>
                        <FormControl>
                          <Input placeholder="Jane Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormItem>
                    <FormLabel>Auth email (cannot be changed)</FormLabel>
                    <FormControl>
                      <Input type="email" value={user.email ?? ""} disabled className="bg-muted" />
                    </FormControl>
                  </FormItem>
                  <FormField
                    control={form.control}
                    name="linkedin"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>LinkedIn *</FormLabel>
                        <FormControl>
                          <Input
                            type="url"
                            placeholder="https://linkedin.com/in/username"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="github"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>GitHub</FormLabel>
                        <FormControl>
                          <Input type="url" placeholder="https://github.com/username" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="personal_website"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Personal website</FormLabel>
                        <FormControl>
                          <Input type="url" placeholder="https://example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
                        <FormControl>
                          <Input type="tel" placeholder="+1 234 567 8900" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="profile_email"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel>Contact email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="contact@example.com" {...field} />
                        </FormControl>
                        <FormDescription>Optional. Leave empty to use auth email.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Location</FormLabel>
                        <FormControl>
                          <Input placeholder="San Diego, CA" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="citizenship"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>U.S. Citizenship</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="yes">U.S. Citizen</SelectItem>
                            <SelectItem value="no">Not a U.S. Citizen</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="hobbies"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel>Hobbies (comma-separated list)</FormLabel>
                        <FormControl>
                          <Input placeholder="hiking, photography, chess" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-4">
                <Button type="submit" className="w-full">
                  Save changes
                </Button>
                <div className="w-full border-t pt-4">
                  <p className="text-sm font-medium mb-2">Browser Extension</p>
                  <p className="text-sm text-muted-foreground mb-2">
                    Connect the GhostWriter extension to scrape your LinkedIn profile and save it
                    here.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={connectExtension}
                  >
                    Connect Extension
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  <Link to="/" className="text-primary hover:underline">
                    Back to home
                  </Link>
                </p>
              </CardFooter>
            </form>
          </Form>
        </Card>
      </main>
    </div>
  );
};

export default Profile;
