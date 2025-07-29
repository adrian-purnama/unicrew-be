const fastify = require('fastify')({
  logger: {
    level: 'error',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
        singleLine: false,
      }
    }
  }
});
const fastifyMultipart = require("@fastify/multipart");
const mongoose = require('mongoose');
const cors = require('@fastify/cors');
const swagger = require('@fastify/swagger');
const swaggerUI = require('@fastify/swagger-ui');
const authRoutes = require('./route/auth/authRoutes');
const dotenv = require('dotenv');
const registerRoutes = require('./route/auth/registerRoutes');
const loginRoutes = require('./route/auth/loginRoutes');
const adminRoutes = require('./route/admin/adminRoutes');
const userRoutes = require('./route/user/userRoutes');
const companyRoutes = require('./route/company/companyRoutes');
const jobRoutes = require('./route/company/jobRoutes');
const notificationRoutes = require('./route/notification/notificationRoutes');
const chatSocket = require('./route/chat/chatSocket');
const { chatRoutes } = require('./route/chat/chatRoutes');


dotenv.config()
const MONGODB_URI = process.env.MONGODB_LINK


async function startServer(){
    try{
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        })
        fastify.log.info('✅ MongoDB connected');
        console.log('✅ MongoDB connected');
        
        await fastify.register(cors, {
            origin : true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', "PATCH"]
        });
        
        await fastify.register(swagger, {
        swagger: {
            info: {
            title: 'My API',
            description: 'API documentation for my Fastify app',
            version: '1.0.0',
            },
            host: 'localhost:3000', 
            schemes: ['http'],
            consumes: ['application/json'],
            produces: ['application/json'],
        }
        });
        await fastify.register(swaggerUI, {
        routePrefix: '/docs',
        uiConfig: {
            docExpansion: 'full',
            deepLinking: false
        },
        staticCSP: true,
        transformStaticCSP: (header) => header,
        });
        fastify.register(fastifyMultipart);


        fastify.get('/test', async () => {
            return { message: 'hehe' };
        });

        //routes
        await fastify.register(authRoutes, {prefix : '/auth'})
        await fastify.register(registerRoutes, {prefix : '/register'})
        await fastify.register(loginRoutes, {prefix : '/login'})
        await fastify.register(adminRoutes, {prefix : '/admin'})
        await fastify.register(userRoutes, {prefix : '/user'})
        await fastify.register(companyRoutes, {prefix : '/company'})
        await fastify.register(jobRoutes, {prefix : '/company'})
        await fastify.register(notificationRoutes, {prefix : '/notification'})

        await fastify.register(chatSocket)
        await fastify.register(chatRoutes, {prefix : '/chat'})

        
        
        
        
        await fastify.listen({ port: 3000 });
        fastify.log.info(`🚀 Server running at http://localhost:3000`);
        console.log(`🚀 Server running at http://localhost:3000`);

    }catch (err){
        fastify.log.error(err)
        process.exit(1);
    }
}

startServer();