import { Router } from "express";
import { Notification } from "../models/Notification";
import { authenticate, AuthedRequest } from "../middleware/auth";

const router = Router();
router.use(authenticate);

router.get("/", async (req: AuthedRequest, res) => {
  const notifications = await Notification.find({ userId: req.user!.userId }).sort({ createdAt: -1 }).limit(50);
  res.json({ notifications });
});

router.patch("/:id/read", async (req: AuthedRequest, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user!.userId },
    { $set: { isRead: true } },
    { new: true }
  );
  if (!notification) return res.status(404).json({ error: "Notification not found" });
  res.json({ notification });
});

router.patch("/read-all", async (req: AuthedRequest, res) => {
  await Notification.updateMany({ userId: req.user!.userId, isRead: false }, { $set: { isRead: true } });
  res.json({ message: "All notifications marked as read" });
});

export default router;
