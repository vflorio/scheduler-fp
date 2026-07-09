import type { Logger } from "@lab-health-monitor/common";
import { loadSlackConfig } from "@lab-health-monitor/common";
import { DeviceMonitor, type DeviceStatusChange, SuitestApiClient } from "@lab-health-monitor/suitest";
import { App, LogLevel } from "@slack/bolt";

/*
  Lab Health Monitor - Slack Bot
  Monitors Suitest devices and sends alerts to Slack
 */

class SlackApp {
  private app: App;
  private logger: Logger;
  private deviceMonitor: DeviceMonitor;
  private channelId: string | undefined;

  constructor() {
    const configResult = loadSlackConfig();

    if (!configResult.ok) {
      console.error("Configuration error:", configResult.error.message);
      process.exit(1);
    }

    const config = configResult.value;

    this.app = new App({
      socketMode: true,
      token: config.slack.botToken,
      appToken: config.slack.appToken,
      logLevel: LogLevel.INFO,
    });

    this.logger = {
      info: (message, ...args) => this.app.logger.info(message, ...args),
      warn: (message, ...args) => this.app.logger.warn(message, ...args),
      error: (message, ...args) => this.app.logger.error(message, ...args),
      debug: (message, ...args) => this.app.logger.debug(message, ...args),
    };

    const suitestClient = new SuitestApiClient(config.suitest);

    this.deviceMonitor = new DeviceMonitor(
      this.logger,
      suitestClient,
      config.monitor.pollingIntervalMs,
      this.onStatusChange,
    );

    this.channelId = config.slack.channelId;

    this.setupCommands();
  }

  private onStatusChange = (change: DeviceStatusChange) => {
    if (!this.channelId) {
      this.logger.warn("SLACK_CHANNEL_ID not configured");
      return;
    }

    const text = `${change.displayName} status changed from ${change.previousStatus} to ${change.currentStatus}`;

    this.app.client.chat
      .postMessage({
        channel: this.channelId,
        text,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text,
            },
          },
        ],
      })
      .catch((error) => {
        this.logger.error("Failed to send Slack message:", error);
      });
  };

  private setupCommands = () => {
    this.app.command("/devices", async ({ ack, respond }) => {
      await ack();

      const devices = this.deviceMonitor.getAllDevices();

      if (devices.length === 0) {
        await respond("No devices found. Monitor may still be initializing.");
        return;
      }

      const deviceList = devices
        .map((d) => {
          return `${d.customName} - ${d.status} (${d.modelId})`;
        })
        .join("\n");

      await respond({
        text: `Lab Devices Status\n${deviceList}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `Lab Devices Status\n${deviceList}`,
            },
          },
        ],
      });
    });
  };

  start = async () => {
    await this.app.start(process.env.PORT || 3000);
    await this.deviceMonitor.start();
  };
}

new SlackApp().start();
