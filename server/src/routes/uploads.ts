import { Router } from "express";
import { upload, fileUrl } from "../services/uploadService";
import { authenticate, requireRole } from "../middleware/auth";

const router = Router();
router.use(authenticate);

// Single-file upload endpoint, used for project brochures/price lists
// (Developer), commission invoices (CP). Field name must be "file".
router.post("/", requireRole("DEVELOPER", "CP", "ADMIN"), upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  res.status(201).json({ url: fileUrl(req.file.filename), filename: req.file.filename, size: req.file.size });
});

export default router;
