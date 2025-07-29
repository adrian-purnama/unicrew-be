const Company = require("../../schema/companySchema");
const Message = require("../../schema/messageSchema");
const User = require("../../schema/userSchema");

async function chatRoutes(fastify, option) {
    fastify.get("/chat/:roomId/messages", async (req, reply) => {
        const { roomId } = req.params;

        const messages = await Message.find({ chatRoom: roomId }).sort({ createdAt: 1 }).lean();

        // Fetch sender names based on senderType
        const userIds = messages.filter((m) => m.senderType === "user").map((m) => m.sender);
        const companyIds = messages.filter((m) => m.senderType === "company").map((m) => m.sender);

        const users = await User.find({ _id: { $in: userIds } })
            .select("fullName")
            .lean();
        const companies = await Company.find({ _id: { $in: companyIds } })
            .select("name")
            .lean();

        const userMap = Object.fromEntries(users.map((u) => [u._id.toString(), u.fullName]));
        const companyMap = Object.fromEntries(companies.map((c) => [c._id.toString(), c.name]));

        const enriched = messages.map((m) => ({
            ...m,
            senderName:
                m.senderType === "user"
                    ? userMap[m.sender.toString()]
                    : companyMap[m.sender.toString()],
        }));

        reply.send(enriched);
    });
}

module.exports = {
    chatRoutes,
};
