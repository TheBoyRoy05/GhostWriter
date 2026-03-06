import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuthStore } from "@/stores/authStore";
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

const signUpSchema = z
  .object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirm_password: z.string(),
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
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });

type SignUpFormValues = z.infer<typeof signUpSchema>;

const SignUp = () => {
  const signUp = useAuthStore((s) => s.signUp);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      email: "",
      password: "",
      confirm_password: "",
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

  const onSubmit = async (values: SignUpFormValues) => {
    setIsSubmitting(true);
    const { error } = await signUp(values.email, values.password, {
      name: values.name,
      personal_website: values.personal_website ?? "",
      github: values.github ?? "",
      linkedin: values.linkedin ?? "",
      email: values.profile_email ?? values.email,
      phone: values.phone ?? "",
      hobbies: values.hobbies ?? "",
      location: values.location ?? "",
      citizenship: values.citizenship === "yes" ? true : values.citizenship === "no" ? false : null,
    });
    setIsSubmitting(false);

    if (error) {
      toast({
        title: "Sign up failed",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Account created",
      description: "Check your email to confirm your account.",
    });
    navigate("/");
  };

  return (
    <div className="h-screen flex flex-col items-center justify-center px-4 overflow-auto bg-background">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Create an account</CardTitle>
          <CardDescription>
            Enter your details below. Fields marked with * are required.
          </CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Auth email *</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="you@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password *</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="••••••••" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirm_password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm password *</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="••••••••" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
                        <Input
                          type="url"
                          placeholder="https://github.com/username"
                          {...field}
                        />
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
                        <Input
                          type="url"
                          placeholder="https://example.com"
                          {...field}
                        />
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
                    <FormItem>
                      <FormLabel>Contact email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="contact@example.com"
                          {...field}
                        />
                      </FormControl>
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
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || undefined}
                      >
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
                    <FormItem>
                      <FormLabel>Hobbies (comma-separated list)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="hiking, photography, chess"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Creating account…" : "Create account"}
              </Button>
              <p className="text-sm text-muted-foreground text-center">
                Already have an account?{" "}
                <Link to="/sign-in" className="text-primary hover:underline">
                  Sign in
                </Link>
              </p>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
};

export default SignUp;
