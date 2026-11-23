import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { OfficeEvent } from '@agent-office/shared';
import type { Server, WebSocket } from 'ws';

@WebSocketGateway({ path: '/ws/office' })
export class OfficeGateway {
  @WebSocketServer()
  server!: Server;

  broadcast(event: OfficeEvent): void {
    if (!this.server) return;
    const payload = JSON.stringify(event);
    this.server.clients.forEach((client: WebSocket) => {
      if (client.readyState === client.OPEN) {
        client.send(payload);
      }
    });
  }
}
