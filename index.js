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
const notificationRoutes = require("./route/notification/notificationRoutes");
const chatSocket = require("./route/chat/chatSocket");
const { chatRoutes } = require("./route/chat/chatRoutes");
const applicationRoutes = require("./route/job/applicationRoutes");
const saveRoutes = require("./route/job/saveRoutes");
const reviewRoutes = require("./route/job/reviewRoutes");
const jobRoutes = require("./route/job/jobRoutes");
const assetRoutes = require("./route/asset/assetRoutes");
const cvRoutes = require("./route/cv/cvRoutes");
const fastifyRateLimit = require("@fastify/rate-limit");
const User = require("./schema/userSchema");
const Company = require("./schema/companySchema");
const Admin = require("./schema/adminSchema");
const CVMakeResult = require("./schema/cvMakeResultSchema");
const { setupTTLIndex } = require("./helper/gridfsHelper");

dotenv.config();
const MONGODB_URI = process.env.MONGODB_LINK;
const FE_LINK = process.env.FE_LINK;

// Validate email configuration
if (!process.env.BREVO_API_KEY) {
  console.warn('⚠️  Warning: BREVO_API_KEY not set in .env file');
  console.warn('   Email sending will fail. Please configure Brevo API key in .env');
}

async function startServer() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    fastify.log.info("✅ MongoDB connected");
    console.log("✅ MongoDB connected");

    // Ensure TTL indexes to auto-delete unverified accounts after 15 days
    try {
      const ttlOptions = {
        expireAfterSeconds: 1296000, // 15 days
        partialFilterExpression: { isVerified: false },
      };
      await Promise.all([
        User.collection.createIndex({ createdAt: 1 }, ttlOptions),
        Company.collection.createIndex({ createdAt: 1 }, ttlOptions),
        Admin.collection.createIndex({ createdAt: 1 }, ttlOptions),
      ]);
      fastify.log.info("TTL indexes ensured (User, Company, Admin)");
    } catch (e) {
      fastify.log.error(e, "Failed to ensure TTL indexes");
    }

    // Setup TTL index for CV files (30-minute auto-deletion)
    await setupTTLIndex();

    await fastify.register(require("@fastify/cors"), {
      origin: true, // Allow all origins
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
      allowedHeaders: ["Content-Type", "Authorization"],
      exposedHeaders: ["Content-Disposition"],
      credentials: false,
    });

await fastify.register(fastifyRateLimit, {
  max: 100,
  timeWindow: '1 minute',
});

    await fastify.register(swagger, {
      swagger: {
        info: {
          title: "My API",
          description: "API documentation for my Fastify app",
          version: "1.0.0",
        },
        host: "localhost:4001",
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
    await fastify.register(cvRoutes, { prefix: "/cv" });

    await fastify.register(chatSocket);
    await fastify.register(chatRoutes, { prefix: "/chat" });

    await fastify.listen({ port: 4000, host: "0.0.0.0" });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

startServer();
