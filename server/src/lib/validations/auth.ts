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

// Mobile number for the phone OTP. Accepts EITHER a bare Indian 10-digit
// number (starting 6–9, unchanged behaviour) OR a full international number in
// E.164 form with a leading "+" and country code (e.g. +14155551234,
// +971501234567). Spaces, dashes and brackets are stripped first.
const phoneField = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s\-()]/g, ""))
  .refine(
    (v) => /^[6-9]\d{9}$/.test(v) || /^\+[1-9]\d{6,14}$/.test(v),
    "Enter a valid mobile number — Indian 10-digit, or international with country code (e.g. +14155551234).",
  );

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
  password: z.string().min(1, "Enter your password"),
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

// Forgot-password: request a reset code sent to the account's email.
export const forgotPasswordSchema = z.object({
  email: emailField,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

// Reset-password: confirm the emailed code and set a new (strong) password.
export const resetPasswordSchema = z.object({
  email: emailField,
  otp: otpField,
  password: strongPassword,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
