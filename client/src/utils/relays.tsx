import {
createContext,
ReactNode,
useCallback,
useContext,
useEffect,
useRef,
useState,
} from "react"
import { Relay, Filter, Event, relayInit, Sub } from "nostr-tools"
import { uniqBy } from "./utils"

type OnConnectFunc = (relay: Relay) => void
type OnDisconnectFunc = (relay: Relay) => void
type OnEventFunc = (event: Event) => void
type OnDoneFunc = () => void
type OnSubscribeFunc = (sub: Sub, relay: Relay) => void

interface NostrContextType {
    isLoading: boolean
    debug?: boolean
    connectedRelays: Relay[]
    onConnect: (_onConnectCallback?: OnConnectFunc) => void
    onDisconnect: (_onDisconnectCallback?: OnDisconnectFunc) => void
    publish: (event: Event) => void
}
  
const NostrContext = createContext<NostrContextType>({
    isLoading: true,
    connectedRelays: [],
    onConnect: () => null,
    onDisconnect: () => null,
    publish: () => null,
})

const log = (
    isOn: boolean | undefined,
    type: "info" | "error" | "warn",
    ...args: unknown[]
) => {
    if (!isOn) return
    console[type](...args)
}

export function NostrProvider({
    children,
    relayUrls,
    debug,
  }: {
    children: ReactNode
    relayUrls: string[]
    debug?: boolean
  }) {
    const [isLoading, setIsLoading] = useState(true)
    const [connectedRelays, setConnectedRelays] = useState<Relay[]>([])
    const [relays, setRelays] = useState<Relay[]>([])
    const relayUrlsRef = useRef<string[]>([])
  
    let onConnectCallback: null | OnConnectFunc = null
    let onDisconnectCallback: null | OnDisconnectFunc = null
  
    const disconnectToRelays = useCallback(
      (relayUrls: string[]) => {
        relayUrls.forEach(async (relayUrl) => {
          await relays.find((relay) => relay.url === relayUrl)?.close()
          setRelays((prev) => prev.filter((r) => r.url !== relayUrl))
        })
      },
      [relays],
    )
  
    const connectToRelays = useCallback(
      (relayUrls: string[]) => {
        relayUrls.forEach(async (relayUrl) => {
          const relay = relayInit(relayUrl)
  
          if (connectedRelays.findIndex((r) => r.url === relayUrl) >= 0) {
            // already connected, skip
            return
          }
  
          setRelays((prev) => uniqBy([...prev, relay], "url"))
          relay.connect()
  
          relay.on("connect", () => {
            log(debug, "info", `✅ nostr (${relayUrl}): Connected!`)
            setIsLoading(false)
            onConnectCallback?.(relay)
            setConnectedRelays((prev) => uniqBy([...prev, relay], "url"))
          })
  
          relay.on("disconnect", () => {
            log(debug, "warn", `🚪 nostr (${relayUrl}): Connection closed.`)
            onDisconnectCallback?.(relay)
            setConnectedRelays((prev) => prev.filter((r) => r.url !== relayUrl))
          })
  
          relay.on("error", () => {
            log(debug, "error", `❌ nostr (${relayUrl}): Connection error!`)
          })
        })
      },
      [connectedRelays, debug, onConnectCallback, onDisconnectCallback],
    )
  
    useEffect(() => {
      if (relayUrlsRef.current === relayUrls) {
        // relayUrls isn't updated, skip
        return
      }
  
      const relayUrlsToDisconnect = relayUrlsRef.current.filter(
        (relayUrl) => !relayUrls.includes(relayUrl),
      )
  
      disconnectToRelays(relayUrlsToDisconnect)
      connectToRelays(relayUrls)
  
      relayUrlsRef.current = relayUrls
    }, [relayUrls, connectToRelays, disconnectToRelays])
  
    const publish = (event: Event) => {
      return connectedRelays.map((relay) => {
        log(debug, "info", `⬆️ nostr (${relay.url}): Sending event:`, event)
  
        return relay.publish(event)
      })
    }
  
    const value: NostrContextType = {
      debug,
      isLoading,
      connectedRelays,
      publish,
      onConnect: (_onConnectCallback?: OnConnectFunc) => {
        if (_onConnectCallback) {
          onConnectCallback = _onConnectCallback
        }
      },
      onDisconnect: (_onDisconnectCallback?: OnDisconnectFunc) => {
        if (_onDisconnectCallback) {
          onDisconnectCallback = _onDisconnectCallback
        }
      },
    }
  
    return <NostrContext.Provider value={value}>{children}</NostrContext.Provider>
  }
  
  export function useNostr() {
    return useContext(NostrContext)
  }