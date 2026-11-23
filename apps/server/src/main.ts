import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true });
  app.useWebSocketAdapter(new WsAdapter(app));

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '127.0.0.1');
  console.log(`Agent Office Server listening on http://127.0.0.1:${port}`);
}

bootstrap();
