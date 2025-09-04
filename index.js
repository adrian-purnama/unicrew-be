const fastify = require("fastify")({
  logger: {
    level: "error",
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
        singleLine: false,
      },
    },
  },
});

const fastifyMultipart = require("@fastify/multipart");
const mongoose = require("mongoose");
const cors = require("@fastify/cors");
const swagger = require("@fastify/swagger");
const swaggerUI = require("@fastify/swagger-ui");
const authRoutes = require("./route/auth/authRoutes");
const dotenv = require("dotenv");
const registerRoutes = require("./route/auth/registerRoutes");
const loginRoutes = require("./route/auth/loginRoutes");
const adminRoutes = require("./route/admin/adminRoutes");
const userRoutes = require("./route/user/userRoutes");
const companyRoutes = require("./route/company/companyRoutes");
// const jobRoutes = require("./route/company/jobRoutes");
const notificationRoutes = require("./route/notification/notificationRoutes");
const chatSocket = require("./route/chat/chatSocket");
const { chatRoutes } = require("./route/chat/chatRoutes");
const applicationRoutes = require("./route/job/applicationRoutes");
const saveRoutes = require("./route/job/saveRoutes");
const reviewRoutes = require("./route/job/reviewRoutes");
const jobRoutes = require("./route/job/jobRoutes");
const assetRoutes = require("./route/asset/assetRoutes");

dotenv.config();
const MONGODB_URI = process.env.MONGODB_LINK;
const FE_LINK = process.env.FE_LINK;

async function startServer() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    fastify.log.info("✅ MongoDB connected");
    console.log("✅ MongoDB connected");

 await fastify.register(require("@fastify/cors"), {
  origin: (origin, cb) => {
    const allowed = new Set([
      FE_LINK
    ]);
    if (!origin) return cb(null, true);
    cb(null, allowed.has(origin));
  },
  methods: ["GET","POST","PUT","DELETE","OPTIONS","PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["Content-Disposition"],
  credentials: false,
});


    await fastify.register(swagger, {
      swagger: {
        info: {
          title: "My API",
          description: "API documentation for my Fastify app",
          version: "1.0.0",
        },
        host: "localhost:3000",
        schemes: ["http"],
        consumes: ["application/json"],
        produces: ["application/json"],
      },
    });
    await fastify.register(swaggerUI, {
      routePrefix: "/docs",
      uiConfig: {
        docExpansion: "full",
        deepLinking: false,
      },
      staticCSP: true,
      transformStaticCSP: (header) => header,
    });
    fastify.register(fastifyMultipart);
    await fastify.register(require("fastify-sse-v2"));

    fastify.get("/test", async () => {
      return { message: "back end ver 1.0.9" };
    });

    //routes
    // await fastify.register(jobRoutes, { prefix: "/company" });

    await fastify.register(authRoutes, { prefix: "/auth" });
    await fastify.register(registerRoutes, { prefix: "/register" });
    await fastify.register(loginRoutes, { prefix: "/login" });
    await fastify.register(adminRoutes, { prefix: "/admin" });
    await fastify.register(userRoutes, { prefix: "/user" });
    await fastify.register(companyRoutes, { prefix: "/company" });
    await fastify.register(notificationRoutes, { prefix: "/notification" });

    await fastify.register(applicationRoutes, { prefix: "/applicant" });
    await fastify.register(jobRoutes, { prefix: "/job" });
    await fastify.register(saveRoutes, { prefix: "/save" });
    await fastify.register(reviewRoutes, { prefix: "/review" });
    await fastify.register(assetRoutes);

    await fastify.register(chatSocket);
    await fastify.register(chatRoutes, { prefix: "/chat" });

    await fastify.listen({ port: 4001, host: "0.0.0.0" });

    // await fastify.listen({ port: 10000 });
    // fastify.log.info(`🚀 Server running at http://localhost:3000`);
    // console.log(`🚀 Server running at http://localhost:3000`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

startServer();
