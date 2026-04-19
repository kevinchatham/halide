import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';

try {
  await bootstrapApplication(App, appConfig);
} catch (error) {
  // biome-ignore lint/suspicious/noConsole: demo startup error log
  console.error(error);
}
