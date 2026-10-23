import { Router } from "express";
import fs from "fs";
import path from "path";
import { upload, uploadProfileImage, fileMatchesExtension, extensionForMime, fileUrl } from "../services/uploadService";
import { optimizeUploadedImage } from "../services/media/optimizeImage";
import { generateThumbnail } from "../services/media/thumbnail";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();
router.use(authenticate);

// Self-service profile photo upload. This separate endpoint is intentionally
// image-only and has a lower size limit than document uploads.
router.post(
  "/profile-image",
  requireRole("ADMIN", "DEVELOPER", "CP", "EMPLOYEE"),
  uploadProfileImage.single("file"),
  async (req, res, next) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Choose a profile photo to upload." });
    const extension = path.extname(file.filename).toLowerCase();
    // Do not trust the browser's MIME header alone; the uploaded file's magic
    // bytes must agree with its allowlisted extension before publishing it.
    if (extension !== extensionForMime(file.mimetype) || !fileMatchesExtension(file.path, extension)) {
      await fs.promises.unlink(file.path).catch(() => undefined);
      return res.status(415).json({ error: "Unsupported profile image. Use a valid JPG, PNG or WEBP file." });
    }
    try {
      const size = await optimizeUploadedImage(file.path, file.mimetype);
      return res.status(201).json({ url: fileUrl(file.filename), filename: file.filename, size });
    } catch (error) {
      await fs.promises.unlink(file.path).catch(() => undefined);
      return next(error);
    }
  },
);

// Single-file upload endpoint, used for project brochures/price lists
// (Developer), commission invoices (CP). Field name must be "file".
router.post("/", requireRole("DEVELOPER", "CP", "ADMIN"), upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  // Compress oversized images in place (best-effort; PDFs and other files are
  // left untouched). Same filename/URL, so callers are unaffected.
  const size = await optimizeUploadedImage(req.file.path, req.file.mimetype);
  // Best-effort thumbnail sibling for image uploads (ignored for PDFs etc.).
  await generateThumbnail(req.file.path, req.file.mimetype);
  res.status(201).json({ url: fileUrl(req.file.filename), filename: req.file.filename, size });
});

export default router;
