import { ApolloClient, InMemoryCache, split, HttpLink } from '@apollo/client'
import { GraphQLWsLink } from '@apollo/client/link/subscriptions'
import { getMainDefinition } from '@apollo/client/utilities'
import { createClient } from 'graphql-ws'

const GRAPHQL_URL = import.meta.env.VITE_GRAPHQL_URL ?? 'http://localhost:4000/graphql'
const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:4000/graphql'

const httpLink = new HttpLink({ uri: GRAPHQL_URL })

const wsLink = new GraphQLWsLink(
  createClient({
    url: WS_URL,
    retryAttempts: 5,
  })
)

const splitLink = split(
  ({ query }) => {
    const definition = getMainDefinition(query)
    return definition.kind === 'OperationDefinition' && definition.operation === 'subscription'
  },
  wsLink,
  httpLink
)

export const apolloClient = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: { fetchPolicy: 'cache-and-network' },
  },
})
