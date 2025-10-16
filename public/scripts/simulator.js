import mqtt from "mqtt";

const BROKER_URL = "ws://localhost:9001";
const client = mqtt.connect(BROKER_URL);

let publishInterval = 3000;
let publishTimer = null;

const devices = [
  { id: "temp-sensor-1", type: "temperature", unit: "°C", threshold: 28, status: "ONLINE", battery: 100 },
  { id: "smart-bulb-1", type: "bulb", unit: "state", state: "OFF", status: "ONLINE", battery: 100 },
  { id: "heart-monitor-1", type: "heartRate", unit: "bpm", status: "ONLINE", battery: 100 },
  { id: "vehicle-1", type: "gps", unit: "lat,lng", status: "ONLINE", battery: 100 }
];

// ================= MQTT CONNECTION =================
client.on("connect", () => {
  console.log("✅ Connected to MQTT Broker");

  client.subscribe("iot/control/#", (err) => {
    if (err) console.error("❌ Subscription error:", err);
    else console.log("📩 Subscribed to control topics: iot/control/#");
  });

  startPublishing();
});

client.on("error", (err) => console.error("❌ Connection error:", err));
client.on("reconnect", () => console.log("🔄 Reconnecting..."));
client.on("close", () => console.log("❌ Connection closed"));

client.on("message", (topic, message) => {
  const cmd = message.toString();
  const deviceId = topic.split("/").pop();
  handleCommand(deviceId, cmd);
});

// ================= DATA GENERATION =================
function generateData(device) {
  if (device.status !== "ONLINE") return null;

  switch (device.type) {
    case "temperature": return (20 + Math.random() * 15).toFixed(2);
    case "bulb": return device.state;
    case "heartRate": return Math.floor(60 + Math.random() * 40);
    case "gps":
      const lat = 28.6 + Math.random() * 0.01;
      const lng = 77.2 + Math.random() * 0.01;
      return `${lat.toFixed(5)},${lng.toFixed(5)}`;
    default: return null;
  }
}

// ================= PUBLISH STATUS =================
function publishStatus(device) {
  const statusPayload = JSON.stringify({
    deviceId: device.id,
    status: device.status,
    battery: device.battery,
    timestamp: new Date().toISOString()
  });
  client.publish(`iot/status/${device.id}`, statusPayload);
}

// ================= PUBLISH TELEMETRY =================
function publishTelemetry(device) {
  if (device.status !== "ONLINE") return;

  const value = generateData(device);
  const payload = JSON.stringify({
    deviceId: device.id,
    type: device.type,
    value,
    unit: device.unit,
    battery: device.battery,
    status: device.status,
    timestamp: new Date().toISOString()
  });

  const topic = `iot/${device.type}/${device.id}`;
  client.publish(topic, payload);

  // Temperature threshold alerts
  if (device.type === "temperature" && parseFloat(value) > device.threshold) {
    const alert = `ALERT: ${device.id} exceeded threshold (${value}°C > ${device.threshold}°C)`;
    client.publish(`iot/alert/${device.id}`, alert);
  }
}

// ================= PUBLISH LOOP =================
function startPublishing() {
  if (publishTimer) clearInterval(publishTimer);

  publishTimer = setInterval(() => {
    devices.forEach(device => {

      // Decrease battery
      device.battery = Math.max(0, device.battery - Math.random() * 2);

      // Low battery offline
      if (device.battery < 10 && device.status === "ONLINE") {
        device.status = "OFFLINE";
        client.publish(`iot/alert/${device.id}`, `ALERT: ${device.id} went OFFLINE due to low battery`);
        console.log(`⚠️ ${device.id} is OFFLINE (low battery)`);
        publishStatus(device);
      }

      // Random disconnect
      if (Math.random() < 0.05 && device.status === "ONLINE") {
        device.status = "OFFLINE";
        client.publish(`iot/alert/${device.id}`, `ALERT: ${device.id} randomly disconnected`);
        console.log(`❌ ${device.id} disconnected`);
        publishStatus(device);
      }

      // Random recovery
      if (Math.random() < 0.05 && device.status === "OFFLINE") {
        device.status = "ONLINE";
        device.battery = 100;
        client.publish(`iot/alert/${device.id}`, `INFO: ${device.id} recovered and is ONLINE`);
        console.log(`✅ ${device.id} recovered and ONLINE`);
        publishStatus(device);
      }

      // Publish telemetry only if ONLINE
      if (device.status === "ONLINE") publishTelemetry(device);
    });
  }, publishInterval);
}

// ================= HANDLE COMMANDS =================
function handleCommand(deviceId, cmd) {
  const device = devices.find(d => d.id === deviceId);
  if (!device) return;

  let ackMessage = "";

  if (cmd.startsWith("SET_INTERVAL:")) {
    const interval = parseInt(cmd.split(":")[1]);
    if (!isNaN(interval) && interval > 500) {
      publishInterval = interval;
      startPublishing();
      ackMessage = `ACK: Interval set to ${publishInterval}ms`;
    } else ackMessage = "NACK: Invalid interval";
  }
  else if (cmd.startsWith("SET_THRESHOLD:") && device.type === "temperature") {
    const threshold = parseFloat(cmd.split(":")[1]);
    if (!isNaN(threshold)) {
      device.threshold = threshold;
      ackMessage = `ACK: Threshold set to ${device.threshold}°C`;
    } else ackMessage = "NACK: Invalid threshold";
  }
  else if ((cmd === "TURN_ON" || cmd === "TURN_OFF") && device.type === "bulb") {
    device.state = cmd === "TURN_ON" ? "ON" : "OFF";
    ackMessage = `ACK: Bulb set to ${device.state}`;
    publishTelemetry(device);
  }
  else if (cmd === "RESET" && device.type === "bulb") {
    device.state = "OFF";
    ackMessage = `ACK: Device reset to OFF`;
    publishTelemetry(device);
  }
  else ackMessage = "NACK: Command not supported";

  // Send ACK
  client.publish(`iot/ack/${deviceId}`, ackMessage);
}

