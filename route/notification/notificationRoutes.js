const { roleAuth } = require("../../helper/roleAuth");
const Notification = require("../../schema/notificationSchema"); // Adjust path as needed


async function notificationRoutes(fastify, options) {
    fastify.get(
        "/notifications",
        { preHandler: roleAuth(["user", "company"]) },
        async (req, res) => {
            try {
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 20;

                const notifications = await Notification.find({
                    recipientType: req.userRole,
                    recipient: req.userId,
                })
                    .sort({ createdAt: -1 })
                    .skip((page - 1) * limit)
                    .limit(limit);

                const total = await Notification.countDocuments({
                    recipientType: req.userRole,
                    recipient: req.userId,
                });

                res.send({ notifications, total, page });
            } catch (err) {
                console.error("❌ Failed to get notifications:", err);
                res.code(500).send({ message: "Failed to get notifications" });
            }
        }
    );

    fastify.patch(
        "/notifications/:id/read",
        { preHandler: roleAuth(["user", "company"]) },
        async (req, res) => {
            try {
                const notif = await Notification.findOneAndUpdate(
                    {
                        _id: req.params.id,
                        recipientType: req.userRole,
                        recipient: req.userId,
                    },
                    { isRead: true },
                    { new: true }
                );
                if (!notif) return res.code(404).send({ message: "Notification not found" });
                res.send(notif);
            } catch (err) {
                console.error("❌ Failed to mark notification as read:", err);
                res.code(500).send({ message: "Failed to update notification" });
            }
        }
    );

    fastify.delete(
        "/notifications/:id",
        { preHandler: roleAuth(["user", "company"]) },
        async (req, res) => {
            try {
                await Notification.deleteOne({
                    _id: req.params.id,
                    recipientType: req.userRole,
                    recipient: req.userId,
                });
                res.send({ message: "Notification deleted" });
            } catch (err) {
                console.error("❌ Failed to delete notification:", err);
                res.code(500).send({ message: "Failed to delete notification" });
            }
        }
    );

    fastify.post("/notifications", { preHandler: roleAuth(["admin"]) }, async (req, res) => {
        try {
            const notif = await Notification.create(req.body);
            res.send(notif);
        } catch (err) {
            console.error("❌ Failed to create notification:", err);
            res.code(500).send({ message: "Failed to create notification" });
        }
    });

    fastify.patch(
        "/notifications/mark-all-read",
        { preHandler: roleAuth(["user", "company"]) },
        async (req, res) => {
            try {
                await Notification.updateMany(
                    {
                        recipientType: req.userRole,
                        recipient: req.userId,
                        isRead: false,
                    },
                    { isRead: true }
                );
                res.send({ message: "All notifications marked as read" });
            } catch (err) {
                console.error("❌ Failed to mark all as read:", err);
                res.code(500).send({ message: "Failed to update notifications" });
            }
        }
    );
}

module.exports = notificationRoutes;
