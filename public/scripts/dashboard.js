// Toast container
const toastContainer = document.createElement("div");
toastContainer.id = "toast-container";
toastContainer.className = "fixed bottom-4 right-4 flex flex-col gap-2 z-50";
document.body.appendChild(toastContainer);

const BROKER_URL = "ws://localhost:9001";
const client = mqtt.connect(BROKER_URL);

const devices = {};
const charts = {};
const maps = {};

// =================== MQTT CONNECTION ===================
client.on("connect", () => {
  console.log("✅ Connected to MQTT Broker");
  client.subscribe("iot/#", (err) => {
    if (err) console.error("❌ Subscribe error:", err);
    else console.log("📡 Subscribed to all iot topics");
  });
});

client.on("error", (err) => console.error("❌ MQTT Error:", err));
client.on("reconnect", () => console.log("🔄 Reconnecting..."));
client.on("close", () => console.log("❌ Disconnected"));

// =================== HANDLE INCOMING MESSAGES ===================
client.on("message", (topic, payload) => {
  try {
    if (topic.startsWith("iot/status/")) {
      const data = JSON.parse(payload.toString());
  
  // Update the internal devices object
      if (!devices[data.deviceId]) devices[data.deviceId] = {};
      devices[data.deviceId].status = data.status;
      devices[data.deviceId].battery = data.battery;
      devices[data.deviceId].value = data.value || devices[data.deviceId].value;
      devices[data.deviceId].unit = data.unit || devices[data.deviceId].unit;

      updateStatusUI(data.deviceId, data.status, data.battery);
    } 
    else if (topic.startsWith("iot/alert/")) {
      const msg = payload.toString();
      const alertType = msg.startsWith("ALERT")
        ? "error"
        : msg.startsWith("INFO")
        ? "info"
        : "warn";

      const colorClass =
        alertType === "error"
          ? "text-red-600"
          : alertType === "info"
          ? "text-green-600"
          : "text-yellow-600";

      addAlertToList(msg, colorClass);
      showToast(msg,alertType);
    } 
    else if (topic.startsWith("iot/")) {
      const data = JSON.parse(payload.toString());
      updateDeviceUI(data);
    }
  } catch (err) {
    console.error("❌ Message handling error:", err);
  }
});

// =================== UPDATE DEVICE UI ===================
function updateDeviceUI(data) {
  const { deviceId, type, value, unit, battery, status, timestamp } = data;
  if (!devices[deviceId]) createDeviceCard(data);

  const card = document.getElementById(`card-${deviceId}`);
  if (!card) return;

  const valueEl = card.querySelector(".device-value");
  valueEl.textContent = `${value} ${unit || ""}`;

  updateStatusUI(deviceId, status, battery);

  // --- Update chart ---
  if (charts[deviceId] && type !== "gps" && type !== "bulb") {
    const chart = charts[deviceId];
    chart.data.labels.push(new Date(timestamp).toLocaleTimeString());
    chart.data.datasets[0].data.push(parseFloat(value));

    if (chart.data.labels.length > 10) {
      chart.data.labels.shift();
      chart.data.datasets[0].data.shift();
    }

    chart.update();
  }

  // --- Update GPS ---
  if (type === "gps" && maps[deviceId]) {
    const [lat, lng] = value.split(",").map(Number);
    maps[deviceId].marker.setLatLng([lat, lng]);
    maps[deviceId].map.panTo([lat, lng]);
  }
}

// =================== CREATE DEVICE CARD ===================
function createDeviceCard(data) {
  const { deviceId, type } = data;
  const container = document.getElementById("devices-container");

  const card = document.createElement("div");
  card.id = `card-${deviceId}`;
  card.className = "bg-white rounded-xl shadow p-4 space-y-2 border";

  card.innerHTML = `
    <h2 class="text-lg font-semibold text-gray-700">${deviceId}</h2>
    <p class="text-sm text-gray-500">Type: ${type}</p>
    <p class="device-value text-2xl font-bold text-blue-600">--</p>
    <div class="flex justify-between items-center">
      <span class="device-status text-sm font-semibold px-2 py-1 rounded bg-gray-200 text-gray-700">Unknown</span>
      <span class="device-battery text-sm">🔋 --%</span>
    </div>
    <canvas id="chart-${deviceId}" height="100"></canvas>
    <div id="map-${deviceId}" class="rounded h-48 hidden"></div>
  `;

  container.appendChild(card);
  devices[deviceId] = data;

  // Initialize chart (for non-GPS devices)
  if (type !== "gps" && type !== "bulb") {
    const ctx = document.getElementById(`chart-${deviceId}`);
    charts[deviceId] = new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: `${type} data`,
            data: [],
            borderWidth: 2,
            fill: false,
            tension: 0.2,
          },
        ],
      },
      options: {
        scales: { y: { beginAtZero: false } },
        animation: false,
      },
    });
  }

  // Initialize map (for GPS devices)
  if (type === "gps") {
    const mapEl = document.getElementById(`map-${deviceId}`);
    mapEl.classList.remove("hidden");

    const map = L.map(mapEl).setView([28.6, 77.2], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);

    const marker = L.marker([28.6, 77.2]).addTo(map);
    maps[deviceId] = { map, marker };
  }
}

// =================== STATUS UI ===================
function updateStatusUI(deviceId, status, battery) {
  const card = document.getElementById(`card-${deviceId}`);
  if (!card) return;

  const statusEl = card.querySelector(".device-status");
  const batteryEl = card.querySelector(".device-battery");

  statusEl.textContent = status;
  statusEl.className = `device-status font-semibold px-2 py-1 rounded ${
    status === "ONLINE"
      ? "bg-green-100 text-green-700"
      : "bg-red-100 text-red-700"
  }`;

  batteryEl.textContent = `🔋 ${battery.toFixed(1)}%`;
  if (battery < 20) batteryEl.classList.add("text-red-600");
  else batteryEl.classList.remove("text-red-600");
}

// =================== ALERT LIST ===================
function addAlertToList(msg, colorClass) {
  const alertList = document.getElementById("alerts-list");
  const li = document.createElement("li");
  li.className = `py-2 ${colorClass}`;
  li.textContent = msg;
  alertList.prepend(li);

  if (alertList.children.length > 20) {
    alertList.removeChild(alertList.lastChild);
  }
}

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `px-4 py-2 rounded shadow text-white ${
    type === "error" ? "bg-red-500" : type === "warn" ? "bg-yellow-500" : "bg-blue-500"
  }`;
  toast.textContent = message;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4000);
}

// =================== NAV BUTTONS ===================
document.getElementById("btn-devices").addEventListener("click", () => {
  document.getElementById("devices-container").style.display = "grid";
  document.getElementById("alerts-list").parentElement.style.display = "none";
});

document.getElementById("btn-alerts").addEventListener("click", () => {
  document.getElementById("devices-container").style.display = "none";
  document.getElementById("alerts-list").parentElement.style.display = "block";
});

// Default view: show devices, hide alerts
document.getElementById("alerts-list").parentElement.style.display = "none";

