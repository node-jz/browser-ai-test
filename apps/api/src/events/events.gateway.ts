import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { BrowserService } from "src/browser/browser/browser.service";

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
}
