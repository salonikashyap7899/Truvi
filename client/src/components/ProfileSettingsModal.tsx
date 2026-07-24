import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import { roleLabel } from "@/lib/rolePaths";

const svg = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const camera = "M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2zM12 17a4 4 0 100-8 4 4 0 000 8z";
const close = "M18 6L6 18M6 6l12 12";
const initialsOf = (s: string) => s.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

/**
 * Shared "Edit profile" modal for the Founder & Admin dashboards. The user can
 * change their display name, upload a profile picture and write a short bio.
 * The image is uploaded via POST /uploads (returns a URL) which is then saved
 * on the account through PATCH /auth/profile. On success the auth store is
 * updated in place so the new name/avatar reflect immediately everywhere.
 */
export default function ProfileSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(user?.name ?? "");
      setBio(user?.bio ?? "");
      setAvatarUrl(user?.avatarUrl ?? "");
    }
  }, [open, user]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please choose an image (JPG, PNG or WEBP)."); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Image must be under 10MB."); return; }
    const fd = new FormData();
    fd.append("file", file);
    setUploading(true);
    try {
      // Do NOT set Content-Type manually — the browser must add the multipart
      // boundary itself, or the server can't parse the file.
      const res = await api.post("/uploads", fd);
      setAvatarUrl(res.data.url);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Image upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function save() {
    if (name.trim().length < 2) { toast.error("Name must be at least 2 characters."); return; }
    setSaving(true);
    try {
      const res = await api.patch("/auth/profile", { name: name.trim(), bio: bio.trim(), avatarUrl: avatarUrl || null });
      const u = res.data.user;
      // Merge only the edited fields onto the existing session user so its other
      // fields (id shape, token-derived flags) are preserved untouched.
      if (user) setUser({ ...user, name: u.name, bio: u.bio ?? null, avatarUrl: u.avatarUrl ?? null });
      toast.success("Profile updated");
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ps-overlay" onClick={onClose}>
      <div className="ps-modal card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Edit profile">
        <div className="ps-head">
          <div>
            <div className="ps-title">Edit profile</div>
            <div className="ps-sub">How your account appears across Truvi</div>
          </div>
          <button className="ps-close" onClick={onClose} aria-label="Close">{svg(close)}</button>
        </div>

        <div className="ps-avatar-row">
          <div className="ps-avatar">
            {avatarUrl ? <img src={avatarUrl} alt="Profile" /> : <span>{initialsOf(name || user?.email || "?")}</span>}
            <button className="ps-avatar-cam" onClick={() => fileRef.current?.click()} disabled={uploading} title="Upload photo">{svg(camera)}</button>
          </div>
          <div className="ps-avatar-meta">
            <button className="btn" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? "Uploading…" : avatarUrl ? "Change photo" : "Upload photo"}</button>
            {avatarUrl && <button className="ps-remove" onClick={() => setAvatarUrl("")}>Remove</button>}
            <div className="ps-hint">JPG, PNG or WEBP · up to 10MB</div>
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onPickFile} />
        </div>

        <div className="ps-field">
          <label>Full name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={80} />
        </div>

        <div className="ps-field">
          <label>Email</label>
          <input value={user?.email ?? ""} disabled />
          <div className="ps-hint">{user ? `${roleLabel(user.role)} account` : ""} · email can’t be changed here</div>
        </div>

        <div className="ps-field">
          <label>Bio <span className="ps-count">{bio.length}/500</span></label>
          <textarea rows={3} value={bio} maxLength={500} onChange={(e) => setBio(e.target.value)} placeholder="A short line about you — role, focus, anything you'd like your team to see." />
        </div>

        <div className="ps-actions">
          <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || uploading}>{saving ? "Saving…" : "Save changes"}</button>
        </div>
      </div>
    </div>
  );
}
