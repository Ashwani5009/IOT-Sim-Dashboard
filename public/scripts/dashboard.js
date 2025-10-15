// dashboard.js
document.addEventListener("DOMContentLoaded", () => {
  const devices = {};
  const alerts = [];
  const MAX_ALERTS = 20;

  // MQTT WebSocket connection
  const mqttClient = mqtt.connect("ws://localhost:9001");

  mqttClient.on("connect", () => {
    console.log("✅ Connected to MQTT Broker via WebSockets");
    mqttClient.subscribe("iot/#", (err) => {
      if (err) console.error("❌ Subscription failed:", err);
    });
  });

  mqttClient.on("message", (topic, message) => {
    try {
      const payload = message.toString();

      // Alerts
      if (topic.startsWith("iot/alert/")) {
        const deviceId = topic.split("/").pop();
        const alertObj = { id: Date.now(), deviceId, message: payload, timestamp: new Date().toLocaleTimeString() };
        alerts.unshift(alertObj);
        if (alerts.length > MAX_ALERTS) alerts.pop();
        renderAlerts();
        showToast(payload, "error");
        return;
      }

      // Telemetry
      const data = JSON.parse(payload);
      if (!devices[data.deviceId]) {
        devices[data.deviceId] = data;
        renderDevice(data);
      } else {
        Object.assign(devices[data.deviceId], data);
        updateDeviceCard(data.deviceId);
      }

    } catch (e) {
      console.error("❌ Failed to process MQTT message:", e);
    }
  });

  // ---------------- Toasts & Alerts ----------------
  function showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type} fixed bottom-4 right-4 bg-${type === "error" ? "red" : type === "success" ? "green" : "blue"}-500 text-white p-2 rounded shadow`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  function renderAlerts() {
    const list = document.getElementById("alerts-list");
    if (!list) return;
    list.innerHTML = "";
    if (!alerts.length) {
      const li = document.createElement("li");
      li.className = "no-alerts";
      li.textContent = "No alerts yet";
      list.appendChild(li);
      return;
    }
    alerts.forEach(a => {
      const li = document.createElement("li");
      li.className = "alert-item py-2";
      li.innerHTML = `
        <p><strong>${a.deviceId}</strong>: ${a.message}</p>
        <p class="text-xs text-gray-400">${a.timestamp}</p>
      `;
      list.appendChild(li);
    });
  }

  // ---------------- Devices ----------------
  const charts = {};
  const deviceMaps = {};

  function renderDevice(device) {
    const container = document.getElementById("devices-container");
    if (!container) return;

    const card = document.createElement("div");
    card.id = `device-${device.deviceId}`;
    card.className = "bg-white p-4 rounded shadow space-y-2";

    card.innerHTML = `
      <h3 class="font-semibold text-lg">${device.deviceId} (${device.type})</h3>
      <p>Status: <span class="device-status ${device.status === "ONLINE" ? "text-green-600" : "text-red-600"}">${device.status}</span></p>
      <p>Battery: <span class="battery-bar"><span class="battery-fill bg-green-400 inline-block h-2 rounded" style="width:${device.battery}%"></span> ${device.battery.toFixed(0)}%</span></p>
      ${device.type === "temperature" || device.type === "heartRate" ? `<canvas id="chart-${device.deviceId}" width="300" height="150"></canvas>` : ""}
      ${device.type === "gps" ? `
        <div id="map-${device.deviceId}" class="device-map relative" style="height:300px; border:1px solid #ccc;">
          <div class="absolute inset-0 flex items-center justify-center text-gray-500 text-sm" id="map-loading-${device.deviceId}">
            Waiting for GPS data...
          </div>
        </div>
      ` : ""}
      ${device.type === "bulb" ? `<button class="toggle-bulb px-2 py-1 bg-blue-500 text-white rounded">${device.state === "ON" ? "Turn OFF" : "Turn ON"}</button>` : ""}
      <p class="last-updated text-xs text-gray-400">Last updated: --:--:--</p>
    `;

    container.appendChild(card);

    if (device.type === "temperature" || device.type === "heartRate") createChart(device.deviceId);
    if (device.type === "gps") createMap(device.deviceId);

    if (device.type === "bulb") {
      const btn = card.querySelector(".toggle-bulb");
      btn.addEventListener("click", () => {
        const cmd = device.state === "ON" ? "TURN_OFF" : "TURN_ON";
        mqttClient.publish(`iot/control/${device.deviceId}`, cmd);
      });
    }
  }

  function updateDeviceCard(deviceId) {
    const device = devices[deviceId];
    const card = document.getElementById(`device-${deviceId}`);
    if (!card) return;

    // Status
    const statusEl = card.querySelector(".device-status");
    statusEl.textContent = device.status;
    statusEl.className = "device-status " + (device.status === "ONLINE" ? "text-green-600" : "text-red-600");

    // Battery
    const batteryFill = card.querySelector(".battery-fill");
    batteryFill.style.width = `${device.battery}%`;
    card.querySelector(".battery-bar span:last-child").textContent = `${device.battery.toFixed(0)}%`;

    // Bulb
    if (device.type === "bulb") {
      const btn = card.querySelector(".toggle-bulb");
      btn.textContent = device.state === "ON" ? "Turn OFF" : "Turn ON";
    }

    // Charts & Maps
    if (device.type === "temperature" || device.type === "heartRate") updateChart(deviceId, device.value);
    if (device.type === "gps") updateMap(deviceId, device.value);
  }

  // ---------------- Charts ----------------
  function createChart(deviceId) {
    const ctx = document.getElementById(`chart-${deviceId}`).getContext("2d");
    charts[deviceId] = new Chart(ctx, {
      type: "line",
      data: { labels: [], datasets: [{ label: deviceId, data: [], borderColor: "blue", fill: false }] },
      options: { animation: false, scales: { x: { display: true }, y: { beginAtZero: true } } }
    });
  }

  function updateChart(deviceId, value) {
    if (!charts[deviceId] || value === undefined) return;
    const chart = charts[deviceId];
    chart.data.labels.push(new Date().toLocaleTimeString());
    chart.data.datasets[0].data.push(value);
    if (chart.data.labels.length > 20) {
      chart.data.labels.shift();
      chart.data.datasets[0].data.shift();
    }
    chart.update();
  }

  // ---------------- Maps ----------------
  function createMap(deviceId) {
    const div = document.getElementById(`map-${deviceId}`);
    const map = L.map(div).setView([28.6, 77.2], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
    const marker = L.marker([28.6, 77.2]).addTo(map);
    deviceMaps[deviceId] = { map, marker, trail: [[28.6, 77.2]], polyline: L.polyline([[28.6, 77.2]], { color: "blue" }).addTo(map) };
  }

  function updateMap(deviceId, value) {
    if (!deviceMaps[deviceId] || !value) return;
    const [lat, lng] = value.split(",").map(Number);
    const mapObj = deviceMaps[deviceId];

    // Hide loading
    const loadingEl = document.getElementById(`map-loading-${deviceId}`);
    if (loadingEl) loadingEl.style.display = "none";

    mapObj.marker.setLatLng([lat, lng]);
    mapObj.trail.push([lat, lng]);
    if (mapObj.trail.length > 10) mapObj.trail.shift();
    mapObj.polyline.setLatLngs(mapObj.trail);
    mapObj.map.panTo([lat, lng]);

    const card = document.getElementById(`device-${deviceId}`);
    if(card) card.querySelector(".last-updated").textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
  }

  // Expose globally
  window.devicesManager = { devices, renderAlerts };
});

