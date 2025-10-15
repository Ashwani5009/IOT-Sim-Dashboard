import mqtt from "mqtt";

const BROKER_URL = "ws://localhost:9001";
const client = mqtt.connect(BROKER_URL);

let publishInterval = 3000;
let publishTimer = null;

client.on("connect", () => {
  console.log("✅ Connected to MQTT Broker");

  client.subscribe("iot/control/#", (err) => {
    if (err) {
      console.error("❌ Subscription error:", err);
    } else {
      console.log("📩 Subscribed to control topics: iot/control/#");
    }
  });

  startPublishing();
});

client.on("error", (err) => {
  console.error("❌ Connection error:", err);
});

client.on("reconnect", () => {
  console.log("🔄 Reconnecting...");
});

client.on("close", () => {
  console.log("❌ Connection closed");
});

client.on("message", (topic, message) => {
  const cmd = message.toString();
  const deviceId = topic.split("/").pop();
  console.log(`📥 Received command for ${deviceId}: ${cmd}`);

  handleCommand(deviceId, cmd);
});

// Devices now have "status" and "battery"
const devices = [
  { id: "temp-sensor-1", type: "temperature", unit: "°C", threshold: 28, status: "ONLINE", battery: 100 },
  { id: "smart-bulb-1", type: "bulb", unit: "state", state: "OFF", status: "ONLINE", battery: 100 },
  { id: "heart-monitor-1", type: "heartRate", unit: "bpm", status: "ONLINE", battery: 100 },
  { id: "vehicle-1", type: "gps", unit: "lat,lng", status: "ONLINE", battery: 100 }
];

function generateData(device) {
  if (device.status !== "ONLINE") {
    return null; // no data if device offline
  }

  switch (device.type) {
    case "temperature":
      return (20 + Math.random() * 15).toFixed(2);
    case "bulb":
      return device.state;
    case "heartRate":
      return Math.floor(60 + Math.random() * 40);
    case "gps":
      const lat = 28.6 + Math.random() * 0.01;
      const lng = 77.2 + Math.random() * 0.01;
      return `${lat.toFixed(5)},${lng.toFixed(5)}`;
    default:
      return null;
  }
}

function publishTelemetry(device) {
  if (device.status !== "ONLINE") return; // skip offline devices

  const value = generateData(device);
  const payload = JSON.stringify({
    deviceId: device.id,
    type: device.type,
    value,
    unit: device.unit,
    battery: device.battery,
    status: device.status,
    timestamp: new Date().toISOString(),
  });

  const topic = `iot/${device.type}/${device.id}`;
  client.publish(topic, payload, { qos: 0 }, (err) => {
    if (err) {
      console.error("❌ Publish error:", err);
    } else {
      console.log(`📡 Published to ${topic}:`, payload);
    }
  });

  // Check threshold alerts for temperature
  if (device.type === "temperature" && parseFloat(value) > device.threshold) {
    const alert = `ALERT: ${device.id} exceeded threshold (${value}°C > ${device.threshold}°C)`;
    const alertTopic = `iot/alert/${device.id}`;
    client.publish(alertTopic, alert, { qos: 1 }, (err) => {
      if (!err) {
        console.log(`🚨 Sent alert to ${alertTopic}: ${alert}`);
      }
    });
  }
}

function startPublishing() {
  if (publishTimer) clearInterval(publishTimer);

  publishTimer = setInterval(() => {
    devices.forEach((device) => {
      device.battery = Math.max(0, device.battery - Math.random() * 2);

      if (device.battery < 10 && device.status === "ONLINE") {
        device.status = "OFFLINE";
        const alert = `ALERT: ${device.id} went OFFLINE due to low battery`;
        client.publish(`iot/alert/${device.id}`, alert, { qos: 1 });
        console.log(`⚠️ ${device.id} is OFFLINE (low battery)`);
      }

      if (Math.random() < 0.05 && device.status === "ONLINE") {
        device.status = "OFFLINE";
        const alert = `ALERT: ${device.id} randomly disconnected`;
        client.publish(`iot/alert/${device.id}`, alert, { qos: 1 });
        console.log(`❌ ${device.id} disconnected`);
      }

      if (Math.random() < 0.05 && device.status === "OFFLINE") {
        device.status = "ONLINE";
        device.battery = 100;
        const alert = `INFO: ${device.id} recovered and is ONLINE`;
        client.publish(`iot/alert/${device.id}`, alert, { qos: 1 });
        console.log(`✅ ${device.id} recovered and ONLINE again`);
      }

      publishTelemetry(device);
    });
  }, publishInterval);
}

function handleCommand(deviceId, cmd) {
  let ackMessage = null;
  const device = devices.find(d => d.id === deviceId);

  if (cmd.startsWith("SET_INTERVAL:")) {
    const newInterval = parseInt(cmd.split(":")[1], 10);
    if (!isNaN(newInterval) && newInterval > 500) {
      publishInterval = newInterval;
      console.log(`⏱️ Changed publish interval to ${publishInterval}ms`);
      startPublishing();
      ackMessage = `ACK: Interval updated to ${publishInterval}ms`;
    } else {
      ackMessage = "NACK: Invalid interval";
    }
  } else if (cmd.startsWith("SET_THRESHOLD:") && device && device.type === "temperature") {
    const newThreshold = parseFloat(cmd.split(":")[1]);
    if (!isNaN(newThreshold)) {
      device.threshold = newThreshold;
      console.log(`🌡️ Threshold for ${deviceId} set to ${device.threshold}°C`);
      ackMessage = `ACK: Threshold updated to ${device.threshold}°C`;
    } else {
      ackMessage = "NACK: Invalid threshold";
    }
  } else if (cmd === "RESET" && device) {
    if (device.type === "bulb") {
      device.state = "OFF";
      console.log(`🔄 ${deviceId} reset to OFF`);
      ackMessage = "ACK: Device reset to OFF";
      publishTelemetry(device);
    } else {
      ackMessage = "NACK: Reset not supported for this device";
    }
  } else if ((cmd === "TURN_ON" || cmd === "TURN_OFF") && device) {
    if (device.type === "bulb") {
      device.state = cmd === "TURN_ON" ? "ON" : "OFF";
      console.log(`💡 ${deviceId} turned ${device.state}`);
      ackMessage = `ACK: Bulb set to ${device.state}`;
      publishTelemetry(device);
    } else {
      ackMessage = "NACK: Command not supported for this device";
    }
  }

  if (ackMessage) {
    const ackTopic = `iot/ack/${deviceId}`;
    client.publish(ackTopic, ackMessage, { qos: 0 }, (err) => {
      if (err) {
        console.error("❌ ACK publish error:", err);
      } else {
        console.log(`✅ Sent ACK to ${ackTopic}: ${ackMessage}`);
      }
    });
  }
}
