import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/primitives";
import { toast } from "sonner";
import { Upload, Trash2, FileText, Loader2 } from "lucide-react";
import { format } from "date-fns";
import type { BuyerDocument, BuyerDocType, BuyerDocStatus } from "@/types";

// ─── constants ────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<BuyerDocType, string> = {
  ID_PROOF:      "ID Proof",
  ADDRESS_PROOF: "Address Proof",
  INCOME_PROOF:  "Income Proof",
};

const TYPE_HINT: Record<BuyerDocType, string> = {
  ID_PROOF:      "Aadhar, PAN, Passport, or Voter ID",
  ADDRESS_PROOF: "Utility bill, Bank statement, or Rental agreement",
  INCOME_PROOF:  "Salary slips, IT returns, or Bank statement",
};

const STATUS_LABEL: Record<BuyerDocStatus, string> = {
  UPLOADED:     "Uploaded",
  UNDER_REVIEW: "Under Review",
  VERIFIED:     "Verified",
};

const STATUS_VARIANT: Record<BuyerDocStatus, string> = {
  UPLOADED:     "info",
  UNDER_REVIEW: "warning",
  VERIFIED:     "success",
};

const DOC_TYPES: BuyerDocType[] = ["ID_PROOF", "ADDRESS_PROOF", "INCOME_PROOF"];

// ─── Main component ───────────────────────────────────────────────────────────

interface DocumentUploadProps {
  docs: BuyerDocument[];
  loading: boolean;
  onRefresh: () => void;
}

export function DocumentUpload({ docs, loading, onRefresh }: DocumentUploadProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 size={14} className="animate-spin" /> Loading documents…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {DOC_TYPES.map((docType) => {
        const typeDocs = docs.filter((d) => d.docType === docType);
        return (
          <DocTypeCard
            key={docType}
            docType={docType}
            docs={typeDocs}
            onRefresh={onRefresh}
          />
        );
      })}
    </div>
  );
}

// ─── Per-type card ────────────────────────────────────────────────────────────

function DocTypeCard({
  docType,
  docs,
  onRefresh,
}: {
  docType: BuyerDocType;
  docs: BuyerDocument[];
  onRefresh: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large — maximum 10 MB.");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("docType", docType);
      await api.post("/documents/my", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(`${TYPE_LABEL[docType]} uploaded.`);
      onRefresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDelete(id: string, fileName: string) {
    if (!confirm(`Remove "${fileName}"?`)) return;
    try {
      await api.delete(`/documents/my/${id}`);
      toast.success("Document removed.");
      onRefresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Delete failed");
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 glass p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{TYPE_LABEL[docType]}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{TYPE_HINT[docType]}</p>
        </div>

        {/* Upload button */}
        <label
          className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors
            ${uploading
              ? "cursor-wait border-white/15 text-muted-foreground"
              : "border-white/15 text-foreground/90 hover:border-blue-500 hover:text-blue-400"
            }`}
          aria-disabled={uploading}
        >
          {uploading ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Upload size={13} />
          )}
          {uploading ? "Uploading…" : "Upload"}
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            className="sr-only"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </label>
      </div>

      {/* Uploaded files */}
      {docs.length > 0 && (
        <ul className="mt-3 space-y-2">
          {docs.map((doc) => (
            <li
              key={doc._id}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <FileText size={15} className="shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <a
                    href={doc.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-xs font-medium text-blue-400 hover:underline"
                  >
                    {doc.fileName}
                  </a>
                  {doc.createdAt && (
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(doc.createdAt), "dd MMM yyyy")}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Badge variant={(STATUS_VARIANT[doc.status] ?? "default") as any}>
                  {STATUS_LABEL[doc.status] ?? doc.status}
                </Badge>
                {doc.status === "UPLOADED" && (
                  <button
                    onClick={() => handleDelete(doc._id, doc.fileName)}
                    aria-label="Remove document"
                    className="rounded-full p-1 text-muted-foreground hover:bg-white/10 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {docs.length === 0 && (
        <p className="mt-3 text-xs text-muted-foreground">No file uploaded yet.</p>
      )}
    </div>
  );
}
