import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { BrowserService } from "src/browser/browser.service";

@WebSocketGateway({
  transports: ["websocket"],
  namespace: "events",
  cors: {
    origin: "*",
  },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly browserService: BrowserService) {}

  handleConnection(@ConnectedSocket() client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage("subscribeToSession")
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string },
  ) {
    const { sessionId } = data;
    client.join(sessionId);
    client.emit("subscribed", { sessionId });
  }

  async notifyEvent(
    eventName: string,
    sessionId: string,
    data: Record<string, unknown>,
  ) {
    this.server.to(sessionId).emit(eventName, data);
  }

  // Store session-specific handlers
  private sessionHandlers = new Map<string, (mfaCode: string) => void>();

  @SubscribeMessage("mfaCode")
  async handleMfaCode(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { mfaCode: string; sessionId: string },
  ) {
    const { mfaCode, sessionId } = data;

    // Check if a handler exists for the session
    const handler = this.sessionHandlers.get(sessionId);
    if (handler) {
      handler(mfaCode); // Call the handler and resolve the Promise
      this.sessionHandlers.delete(sessionId); // Clean up after handling
    }

    // Broadcast to the room for additional listeners
    this.server.to(sessionId).emit("mfaCodeSubmitted", { mfaCode, sessionId });
  }

  async waitForMfaCode(sessionId: string): Promise<string> {
    // Return a Promise that resolves when the code is received
    return new Promise((resolve) => {
      const handler = (mfaCode: string) => {
        resolve(mfaCode);
      };

      // Store the handler for this session
      this.sessionHandlers.set(sessionId, handler);
    });
  }
}
