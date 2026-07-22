import { z } from "zod";

// A stricter email check than a bare format test: the domain must have a dot
// and a 2+ character TLD. (Genuine deliverability is still proven by the email
// OTP — a dummy address can pass format checks but can never be verified.)
const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email")
  .regex(/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i, "Enter a valid email");

// Indian mobile number: 10 digits starting 6–9. Required for every account so
// the phone OTP has somewhere to go.
const phoneField = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number");

// Strong password: at least 8 chars with a lowercase, an uppercase, a number
// and a special character.
const strongPassword = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[a-z]/, "Add at least one lowercase letter")
  .regex(/[A-Z]/, "Add at least one uppercase letter")
  .regex(/[0-9]/, "Add at least one number")
  .regex(/[^A-Za-z0-9]/, "Add at least one special character");

const otpField = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code");

export const signupSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: emailField,
    password: strongPassword,
    phone: phoneField,
    role: z.enum(["DEVELOPER", "CP", "BUYER", "AMBASSADOR"], { error: "Select a role" }),
    companyName: z.string().optional(),
    reraNumber: z.string().optional(),
    // Optional referral code — links the new account to the referring
    // CP/Ambassador when valid (ignored silently if blank or unrecognised).
    referralCode: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role === "DEVELOPER" && (!data.companyName || data.companyName.trim().length < 2)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["companyName"], message: "Company name is required for developers" });
    }
  });
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

// Public account-verification endpoints (no auth token yet — the account is
// created but cannot log in until BOTH the emailed and texted OTPs are
// confirmed).
export const verifyAccountSchema = z.object({
  email: emailField,
  emailOtp: otpField,
  phoneOtp: otpField,
});
export type VerifyAccountInput = z.infer<typeof verifyAccountSchema>;

export const resendOtpSchema = z.object({
  email: emailField,
});
export type ResendOtpInput = z.infer<typeof resendOtpSchema>;
