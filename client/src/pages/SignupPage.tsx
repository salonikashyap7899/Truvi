import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input, Label, Card } from "@/components/ui/primitives";

const signupSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Enter a valid email"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number").optional().or(z.literal("")),
    role: z.enum(["DEVELOPER", "CP", "BUYER"]),
    companyName: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role === "DEVELOPER" && (!data.companyName || data.companyName.trim().length < 2)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["companyName"], message: "Company name is required for developers" });
    }
  });

type SignupForm = z.infer<typeof signupSchema>;

export default function SignupPage() {
  const navigate = useNavigate();
  const { signup } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
    defaultValues: { role: "CP" },
  });

  const role = watch("role");

  async function onSubmit(data: SignupForm) {
    setServerError(null);
    try {
      await signup(data);
      setSuccess(true);
      setTimeout(() => navigate("/login"), 2000);
    } catch (err: any) {
      setServerError(err?.response?.data?.error || "Something went wrong");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FAF6F0] px-4 py-12">
      <Card className="w-full max-w-md">
        <h1 className="font-serif text-2xl font-semibold text-[#fff]">Join Truvi</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Create your account. An admin will verify and approve it before you get full access.
        </p>

        <div className="mt-5 flex rounded-lg border border-neutral-200 p-1">
          <button
            type="button"
            onClick={() => setValue("role", "DEVELOPER")}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${role === "DEVELOPER" ? "bg-[#3A2E26] text-white" : "text-neutral-500"}`}
          >
            I&apos;m a Developer
          </button>
          <button
            type="button"
            onClick={() => setValue("role", "CP")}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${role === "CP" ? "bg-[#3A2E26] text-white" : "text-neutral-500"}`}
          >
            I&apos;m a Channel Partner
          </button>
          <button
            type="button"
            onClick={() => setValue("role", "BUYER")}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${role === "BUYER" ? "bg-[#3A2E26] text-white" : "text-neutral-500"}`}
          >
            I&apos;m a Buyer
          </button>
        </div>

        {success ? (
          <p className="mt-6 rounded-lg bg-green-50 p-4 text-sm text-green-700">
            Account created! Redirecting to login — your account is pending admin approval.
          </p>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
            <div>
              <Label>Full name</Label>
              <Input {...register("name")} placeholder="Priya Sharma" className="text-[#fff]"/>
              {errors.name && <p className="mt-1 text-xs text-[#fff]">{errors.name.message}</p>}
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" {...register("email")} placeholder="you@example.com" className="text-[#fff]" />
              {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
            </div>
            <div>
              <Label>Phone</Label>
              <Input {...register("phone")} placeholder="98765 43210" className="text-[#fff]"/>
              {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone.message}</p>}
            </div>
            <div>
              <Label>Password</Label>
              <Input type="password" {...register("password")} placeholder="At least 8 characters" className="text-[#fff]"/>
              {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
            </div>
            {role === "DEVELOPER" && (
              <div>
                <Label>Company name</Label>
                <Input {...register("companyName")} placeholder="Skyline Developers Pvt Ltd" className="text-[#fff]"/>
                {errors.companyName && <p className="mt-1 text-xs text-red-600">{errors.companyName.message}</p>}
              </div>
            )}
            {serverError && <p className="text-sm text-red-600">{serverError}</p>}
            <Button type="submit" disabled={isSubmitting} className="w-full bg-[#3A2E26] hover:bg-[#2a201a]">
              {isSubmitting ? "Creating account…" : "Create account"}
            </Button>
            <p className="text-center text-sm text-neutral-500">
              Already have an account? <Link to="/login" className="text-blue-600">Log in</Link>
            </p>
          </form>
        )}
      </Card>
    </main>
  );
}
