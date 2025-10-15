const devices = {};
const alerts = [];
const MAX_ALERTS = 20;

const mqtt = window.mqttClient;

// Toast helper
function showToast(message, type="error"){
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(()=>toast.remove(), 4000);
}

// Handle MQTT messages
mqtt.on("message", (topic, message)=>{
  const payload = message.toString();
  try {
    const data = JSON.parse(payload);
    if(data.deviceId){
      devices[data.deviceId] = { ...devices[data.deviceId], ...data };
      return;
    }
  } catch{}

  if(topic.startsWith("iot/alert/")){
    const deviceId = topic.split("/").pop();
    const alertObj = { id:Date.now(), deviceId, message:payload, timestamp:new Date().toLocaleTimeString() };
    alerts.unshift(alertObj);
    if(alerts.length>MAX_ALERTS) alerts.pop();
    renderAlerts();
    showToast(payload,"error");
  }

  if(topic.startsWith("iot/ack/")){
    showToast(payload,"success");
  }
});

// Send command
function sendCommand(deviceId, action){
  mqtt.publish(`iot/control/${deviceId}`, action);
  console.log(`📤 Command sent to ${deviceId}: ${action}`);
}

// Render alerts
function renderAlerts(){
  const list = document.getElementById("alerts-list");
  if(!list) return;
  list.innerHTML = "";
  if(!alerts.length){ list.innerHTML = "<li>No alerts yet</li>"; return;}
  alerts.forEach(a=>{
    const li = document.createElement("li");
    li.innerHTML = `<strong>${a.deviceId}</strong>: ${a.message} <span class="text-xs">${a.timestamp}</span>`;
    list.appendChild(li);
  });
}

// Expose globally
window.devicesManager = {
  devices,
  sendCommand,
  renderAlerts
};

