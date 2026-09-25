import { Router } from "express";
import { upload, fileUrl } from "../services/uploadService";
import { optimizeUploadedImage } from "../services/media/optimizeImage";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();
router.use(authenticate);

// Single-file upload endpoint, used for project brochures/price lists
// (Developer), commission invoices (CP). Field name must be "file".
router.post("/", requireRole("DEVELOPER", "CP", "ADMIN"), upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  // Compress oversized images in place (best-effort; PDFs and other files are
  // left untouched). Same filename/URL, so callers are unaffected.
  const size = await optimizeUploadedImage(req.file.path, req.file.mimetype);
  res.status(201).json({ url: fileUrl(req.file.filename), filename: req.file.filename, size });
});

export default router;
