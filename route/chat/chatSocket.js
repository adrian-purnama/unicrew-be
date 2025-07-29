// helper/chatSocket.js
const jwt = require("jsonwebtoken");
const ChatRoom = require("../../schema/chatRoomSchema");
const Message = require("../../schema/messageSchema");
const Notification = require("../../schema/notificationSchema");

const JWT_SECRET = process.env.JWT_SECRET;
const activeConnections = {}; // roomId => Set of sockets

module.exports = async function chatSocket(fastify) {
    await fastify.register(require("@fastify/websocket"));
    console.log("✅ chatSocket route registered");

    fastify.get("/ws/chat/:roomId", { websocket: true }, (socket, req) => {
        const { roomId } = req.params;
        console.log(`👉 WS handshake for roomId=${roomId}`);

        const token =
            req.headers?.authorization?.split(" ")[1] ||
            (req.url.includes("?") &&
                new URL(`http://${req.headers.host}${req.url}`).searchParams.get("token"));

        if (!token) {
            console.warn("❌ No token provided");
            socket.send(JSON.stringify({ type: "error", message: "No token" }));
            return socket.close();
        }

        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            console.warn("❌ Invalid token:", err.message);
            socket.send(JSON.stringify({ type: "error", message: "Unauthorized" }));
            return socket.close();
        }

        const { _id: userId, role: userRole } = decoded;
        if (!userId || !userRole) {
            console.warn("❌ Invalid token payload");
            socket.send(JSON.stringify({ type: "error", message: "Unauthorized payload" }));
            return socket.close();
        }

        console.log(`🟢 Connected: room=${roomId}, user=${userId}, role=${userRole}`);

        socket.roomId = roomId;

        if (!activeConnections[roomId]) activeConnections[roomId] = new Set();
        activeConnections[roomId].add(socket);

        socket.on("message", (raw) => {
            console.log("📥 Received raw WS message:", raw);
            handleMessage(raw, { roomId, socket, userId, userRole });
        });

        socket.on("close", () => {
            activeConnections[roomId]?.delete(socket);
            console.log(`🔒 Disconnected: room=${roomId}, user=${userId}`);
        });

        socket.on("error", (err) => {
            console.error("⚠️ Socket error:", err.message);
        });
    });

    async function handleMessage(raw, { roomId, socket, userId, userRole }) {
        console.log("⚙️ Inside handleMessage()");

        try {
            const { content } = JSON.parse(raw);
            if (!content) {
                console.warn("⚠️ Empty message received");
                return;
            }

            const msgDoc = await Message.create({
                chatRoom: roomId,
                senderType: userRole,
                sender: userId,
                content,
            });
            console.log(msgDoc);

            const fullMsg = {
                _id: msgDoc._id,
                room: roomId,
                content,
                sender: userId,
                senderType: userRole,
                createdAt: msgDoc.createdAt,
            };

            console.log(`📨 [${roomId}] ${userRole}:${userId} -> ${content}`);

            for (const sock of activeConnections[roomId] || []) {
                try {
                    sock.send(JSON.stringify({ type: "message", data: fullMsg }));
                } catch (err) {
                    console.warn("⚠️ Failed to send message:", err.message);
                }
            }

            const roomDoc = await ChatRoom.findById(roomId);
            if (roomDoc) {
                const target = userRole === "user" ? roomDoc.company : roomDoc.user;

                await Notification.updateOne(
                    {
                        recipient: target,
                        recipientType: userRole === "user" ? "company" : "user",
                        type: "chat",
                        "metadata.roomId": roomId,
                    },
                    {
                        $setOnInsert: {
                            message: "New chat message",
                            metadata: { roomId },
                        },
                    },
                    { upsert: true }
                );
            }
        } catch (err) {
            console.error("❌ Error handling WS message:", err);
        }
    }
};
