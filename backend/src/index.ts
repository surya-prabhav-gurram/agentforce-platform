import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { makeServer } from 'graphql-ws'
import { ApolloServer } from '@apollo/server'
import { expressMiddleware } from '@apollo/server/express4'
import { makeExecutableSchema } from '@graphql-tools/schema'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { resolvers } from './graphql/resolvers/index.js'
import { prisma } from './db/client.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const typeDefs = readFileSync(
  join(__dirname, 'graphql/schema/schema.graphql'),
  'utf-8'
)

const schema = makeExecutableSchema({ typeDefs, resolvers: resolvers as any })

const app = express()
const httpServer = createServer(app)

app.use(cors({ origin: '*', credentials: true }))
app.use(express.json())

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({ status: 'ok', db: 'connected' })
  } catch {
    res.status(500).json({ status: 'error', db: 'disconnected' })
  }
})

const wsServer = new WebSocketServer({ server: httpServer, path: '/graphql' })

const graphqlWsServer = makeServer({
  schema,
  context: async () => ({ prisma }),
})

wsServer.on('connection', (socket, request) => {
  const closed = graphqlWsServer.opened(
    {
      protocol: socket.protocol,
      send: (data) => socket.send(data),
      close: (code, reason) => socket.close(code, reason),
      onMessage: (cb) => {
        socket.on('message', (event) => cb(event.toString()))
      },
    },
    { socket, request }
  )
  socket.on('close', (code, reason) => closed(code, reason.toString()))
})

const apolloServer = new ApolloServer({
  schema,
  plugins: [
    {
      async serverWillStart() {
        return {
          async drainServer() {
            await new Promise<void>((resolve) => wsServer.close(() => resolve()))
          },
        }
      },
    },
  ],
  introspection: true,
})

await apolloServer.start()

app.use(
  '/graphql',
  expressMiddleware(apolloServer, {
    context: async () => ({ prisma }),
  }) as any
)

const PORT = parseInt(process.env.PORT ?? '4000')

httpServer.listen(PORT, () => {
  console.log(`Server ready at http://localhost:${PORT}/graphql`)
  console.log(`WebSocket ready at ws://localhost:${PORT}/graphql`)
})
