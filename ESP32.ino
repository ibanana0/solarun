#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <map>
#include <vector>
#include <Preferences.h>      // Built-in ESP32 library for internal memory
#include <WiFiManager.h>      // REQUIRED: "WiFiManager by tzapu" in Library Manager
#include <WebServer.h>        // Built-in ESP32 library for Web Server

// ================= GLOBAL CONFIGURATION (Dynamic) =================
// These variables are populated from NVS/Web Portal
String event_id_str;
String checkpoint_id_str;
String app_suffix_str;
String mqtt_server_str;
String mqtt_topic_str;

int CHECKPOINT_ID; // Integer version for backend

WiFiClient espClient;
PubSubClient mqttClient(espClient);
Preferences preferences;
WebServer server(80); // Live configuration server on port 80

// Thresholds & Timings
int scanTime = 3;                             // 3 seconds scan time to clear memory more frequently
const unsigned long COOLDOWN_TIME = 60000;    // 1-minute anti-spam hardware shield
const int RSSI_THRESHOLD = -85;               // Distance sensitivity threshold (-85 dBm)

// Memory Management
BLEScan* pBLEScan;
std::map<String, unsigned long> runnerGuestBook;
std::vector<String> offlineBuffer;            // Backup queue for offline data
const int MAX_BUFFER_SIZE = 50;               // Maximum buffer size to prevent memory overflow

// Reset Config Button (Built-in BOOT button on ESP32)
const int RESET_PIN = 0;

// Task Handle for running Web Server independently on Core 0
TaskHandle_t WebServerTask;

// ================= CORE FUNCTIONS =================

void processPayload(String payload) {
  if (mqttClient.connected()) {
    if (mqttClient.publish(mqtt_topic_str.c_str(), payload.c_str())) {
      Serial.println(">> [SUCCESS] Payload sent to Cloud");
    }
  } else {
    // If WiFi/MQTT is dead, save to buffer safely
    if (offlineBuffer.size() < MAX_BUFFER_SIZE) {
      offlineBuffer.push_back(payload);
      Serial.println(">> [BUFFERED] Internet offline, payload saved.");
    } else {
      Serial.println(">> [DROPPED] Buffer is full!");
    }
  }
}

void flushBuffer() {
  if (mqttClient.connected() && !offlineBuffer.empty()) {
    Serial.println("🔄 Flushing delayed payloads from Buffer...");
    while (!offlineBuffer.empty() && mqttClient.connected()) {
      String savedPayload = offlineBuffer.front();
      if (mqttClient.publish(mqtt_topic_str.c_str(), savedPayload.c_str())) {
        offlineBuffer.erase(offlineBuffer.begin()); // Remove the successfully sent item
        delay(100); // Short delay to prevent overloading the broker
      }
    }
    Serial.println("✅ Buffer flushed.");
  }
}

void reconnect_mqtt() {
  while (!mqttClient.connected() && WiFi.status() == WL_CONNECTED) {
    Serial.print("Attempting MQTT connection to ");
    Serial.print(mqtt_server_str);
    Serial.print("...");

    String clientId = "ESP32-SolaRun-" + String(random(0xffff), HEX);
    if (mqttClient.connect(clientId.c_str())) {
      Serial.println(" connected!");
      flushBuffer();
    } else {
      Serial.print(" failed, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" try again in 3 seconds");
      delay(3000);
    }
  }
}

// ================= LOCAL WEB SERVER (Access via ESP32 IP) =================

// Task function to run the web server continuously on Core 0
void webServerTaskCode(void * pvParameters) {
  for(;;) {
    server.handleClient();
    vTaskDelay(10 / portTICK_PERIOD_MS); // Yield to watchdog to prevent crashes
  }
}

void handleRoot() {
  String html = "<html><head><meta name='viewport' content='width=device-width, initial-scale=1'>";
  html += "<style>body{font-family:Arial; padding:20px; background:#f4f4f9;} ";
  html += "input{width:100%; padding:10px; margin:8px 0 20px 0; border:1px solid #ccc; border-radius:4px;} ";
  html += "input[type=submit]{background:#2ecc71; color:white; font-weight:bold; cursor:pointer; font-size:16px;}</style></head><body>";
  html += "<h2>⚙️ SolaRun Live Config</h2>";
  html += "<form action='/save' method='POST'>";

  // ---> NEW FEATURE: WiFi Network Changes <---
  html += "<h3>📶 Network Settings</h3>";
  html += "<label>WiFi SSID:</label><input type='text' name='wifi_ssid' value='" + WiFi.SSID() + "'>";
  html += "<label>WiFi Password:</label><input type='text' name='wifi_pass' placeholder='Leave blank to keep unchanged'>";
  html += "<hr>";

  // ---> Existing App Configuration <---
  html += "<h3>🏃 App Settings</h3>";
  html += "<label>Event ID:</label><input type='text' name='event_id' value='" + event_id_str + "'>";
  html += "<label>Checkpoint ID:</label><input type='number' name='check_id' value='" + checkpoint_id_str + "'>";
  html += "<label>App Suffix:</label><input type='text' name='app_suffix' value='" + app_suffix_str + "'>";
  html += "<label>MQTT Server:</label><input type='text' name='mqtt_server' value='" + mqtt_server_str + "'>";
  html += "<label>MQTT Topic:</label><input type='text' name='mqtt_topic' value='" + mqtt_topic_str + "'>";
  html += "<input type='submit' value='Save & Restart ESP32'>";
  html += "</form></body></html>";

  server.send(200, "text/html", html);
}

void handleSave() {
  // 1. Process standard App Configuration
  if(server.hasArg("event_id")) preferences.putString("event_id", server.arg("event_id"));
  if(server.hasArg("check_id")) preferences.putString("check_id", server.arg("check_id"));
  if(server.hasArg("app_suffix")) preferences.putString("app_suffix", server.arg("app_suffix"));
  if(server.hasArg("mqtt_server")) preferences.putString("mqtt_server", server.arg("mqtt_server"));
  if(server.hasArg("mqtt_topic")) preferences.putString("mqtt_topic", server.arg("mqtt_topic"));

  // 2. Process NEW WiFi Network Configuration
  if(server.hasArg("wifi_ssid")) {
    String new_ssid = server.arg("wifi_ssid");
    String new_pass = server.arg("wifi_pass");

    // Only attempt to change WiFi if the SSID changed or a new password was typed
    if(new_ssid != "" && (new_ssid != WiFi.SSID() || new_pass != "")) {
      Serial.println("⚠️ Updating WiFi Credentials!");

      WiFi.persistent(true);   // Ensure credentials are saved to flash
      WiFi.disconnect();       // Disconnect from current network
      delay(100);

      if (new_pass != "") {
        WiFi.begin(new_ssid.c_str(), new_pass.c_str());
      } else {
        WiFi.begin(new_ssid.c_str()); // Open network or keep old password for new SSID (if possible)
      }

      delay(1000); // Give ESP32 NVS flash 1 second to write the new credentials securely
    }
  }

  // 3. Send Success Message & Restart
  server.send(200, "text/html", "<html><body><h2>✅ Config Saved!</h2><p>ESP32 is restarting...</p></body></html>");
  delay(1500);
  ESP.restart(); // Restart to apply all new settings
}

// ================= SETUP CAPTIVE PORTAL (WiFiManager) =================

void setup_wifi_and_config() {
  WiFiManager wm;

  // If BOOT button is pressed during startup, CLEAR all memory and reset device
  if (digitalRead(RESET_PIN) == LOW) {
    Serial.println("⚠️ RESET BUTTON PRESSED! Clearing Configs...");
    wm.resetSettings();
    preferences.clear();
    Serial.println("Configs cleared. Restarting...");
    delay(1000);
    ESP.restart();
  }

  // 1. Fetch data from internal memory (If none exists, use defaults)
  String def_event_id = preferences.getString("event_id", "DEFAULT_EVENT_ID");
  String def_check_id = preferences.getString("check_id", "1");
  String def_app_suffix = preferences.getString("app_suffix", "-SolaRunv1");
  String def_mqtt_server = preferences.getString("mqtt_server", "broker.hivemq.com");
  String def_mqtt_topic = preferences.getString("mqtt_topic", "race/checkpoint");

  // 2. Create Input Forms for Setup Portal (WiFiManager)
  WiFiManagerParameter custom_event_id("event_id", "Event ID", def_event_id.c_str(), 50);
  WiFiManagerParameter custom_check_id("check_id", "Checkpoint ID", def_check_id.c_str(), 5);
  WiFiManagerParameter custom_app_suffix("app_suffix", "App Suffix", def_app_suffix.c_str(), 20);
  WiFiManagerParameter custom_mqtt_server("mqtt_server", "MQTT Server", def_mqtt_server.c_str(), 50);
  WiFiManagerParameter custom_mqtt_topic("mqtt_topic", "MQTT Topic", def_mqtt_topic.c_str(), 50);

  wm.addParameter(&custom_event_id);
  wm.addParameter(&custom_check_id);
  wm.addParameter(&custom_app_suffix);
  wm.addParameter(&custom_mqtt_server);
  wm.addParameter(&custom_mqtt_topic);

  // Max time to search for saved WiFi before opening AP portal (90 seconds)
  wm.setConnectTimeout(90);

  // 3. Start Portal
  Serial.println("Attempting to connect to WiFi or open Setup Portal...");
  bool res = wm.autoConnect("SolaRun-Setup-Node", "SolaRunDevConfig123");

  if (!res) {
    Serial.println("Failed to connect to WiFi and timed out. Restarting...");
    delay(3000);
    ESP.restart();
  }

  Serial.println("✅ WiFi Connected! IP: " + WiFi.localIP().toString());

  // 4. Save Web Portal input to internal memory
  preferences.putString("event_id", custom_event_id.getValue());
  preferences.putString("check_id", custom_check_id.getValue());
  preferences.putString("app_suffix", custom_app_suffix.getValue());
  preferences.putString("mqtt_server", custom_mqtt_server.getValue());
  preferences.putString("mqtt_topic", custom_mqtt_topic.getValue());

  // 5. Assign to active variables
  event_id_str = custom_event_id.getValue();
  checkpoint_id_str = custom_check_id.getValue();
  app_suffix_str = custom_app_suffix.getValue();
  mqtt_server_str = custom_mqtt_server.getValue();
  mqtt_topic_str = custom_mqtt_topic.getValue();

  CHECKPOINT_ID = checkpoint_id_str.toInt();
}

// ================= BLE CALLBACK =================

class MyAdvertisedDeviceCallbacks: public BLEAdvertisedDeviceCallbacks {
    void onResult(BLEAdvertisedDevice advertisedDevice) {
      if (advertisedDevice.haveName()) {
        String fullName = advertisedDevice.getName().c_str();
        int rssi = advertisedDevice.getRSSI();

        // 1. HARD THRESHOLDS: Check Suffix AND RSSI Distance
        if (fullName.endsWith(app_suffix_str) && rssi >= RSSI_THRESHOLD) {
          unsigned long currentTime = millis();

          // 2. NAME EXTRACTION: Strip the suffix
          String username = fullName.substring(0, fullName.indexOf(app_suffix_str));

          // 3. HARDWARE SHIELD: Dynamic Cooldown
          if (runnerGuestBook.find(username) == runnerGuestBook.end() ||
              (currentTime - runnerGuestBook[username] > COOLDOWN_TIME)) {

            runnerGuestBook[username] = currentTime;

            Serial.println("=====================================");
            Serial.printf("🏁 RUNNER DETECTED: %s | RSSI: %d dBm\n", username.c_str(), rssi);

            // 4. PREPARE PAYLOAD AND PROCESS
            String payload = "{\"event_id\":\"" + event_id_str + "\", \"rfid_uid\":\"" + username + "\", \"checkpoint_id\":" + String(CHECKPOINT_ID) + ", \"timestamp\":" + String(currentTime) + "}";
            processPayload(payload);
            Serial.println("=====================================");
          }
        }
      }
    }
};

void setup() {
  Serial.begin(115200);
  Serial.println("Starting ESP32 SolaRun Node...");

  // Setup Reset Button
  pinMode(RESET_PIN, INPUT_PULLUP);

  // Setup NVS Memory (Non-Volatile Storage)
  preferences.begin("solarun", false);

  // Call Portal / Connect WiFi
  setup_wifi_and_config();

  // Start Local Web Server if successfully connected to WiFi network
  server.on("/", handleRoot);
  server.on("/save", handleSave);
  server.begin();
  Serial.println("🌐 Live Web Server running on IP: " + WiFi.localIP().toString());

  // ---> NEW: Pin the Web Server to Core 0 so BLE scanning doesn't block it
  xTaskCreatePinnedToCore(
    webServerTaskCode,   // Task function
    "WebServerTask",     // Task name
    4096,                // Stack size
    NULL,                // Parameters
    1,                   // Priority
    &WebServerTask,      // Task handle
    0                    // Run on Core 0
  );

  // Setup MQTT
  mqttClient.setServer(mqtt_server_str.c_str(), 1883);

  // Setup BLE
  BLEDevice::init("");
  pBLEScan = BLEDevice::getScan();
  pBLEScan->setAdvertisedDeviceCallbacks(new MyAdvertisedDeviceCallbacks());
  pBLEScan->setActiveScan(true);

  // CHANGED: Balance the Radio Antenna between BLE and WiFi
  pBLEScan->setInterval(100);
  pBLEScan->setWindow(40); // Changed from 99 to 40. Leaves 60% of radio time for WiFi!
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    // Don't open portal in loop, just do standard reconnect
    WiFi.reconnect();
    delay(1000);
  }

  if (!mqttClient.connected()) {
    reconnect_mqtt();
  }
  mqttClient.loop();

  // Start Non-Blocking Scan
  BLEScanResults* foundDevices = pBLEScan->start(scanTime, false);
  pBLEScan->clearResults();

  // CHANGED: Force the loop to pause briefly to ensure WiFi gets enough time
  // to process any heavy pending web traffic before the next scan starts
  delay(50);
}
