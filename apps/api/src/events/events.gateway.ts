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

@WebSocketGateway()
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly browserService: BrowserService) {}

  handleConnection(client: Socket) {
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
    sessionId: string,
    event: Record<string, string | number | boolean>,
  ) {
    this.server.to(sessionId).emit("sessionEvent", event);
  }
}
