#include <BLEAdvertisedDevice.h>
#include <BLEDevice.h>
#include <BLEScan.h>
#include <BLEUtils.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include <map>
#include <vector>

// ================= WIFI & MQTT CONFIGURATION =================
const char *ssid = "WIFI SSID";            // CHANGE THIS
const char *password = "WIFI PASSWORD";    // CHANGE THIS
const char *mqtt_server = "MQTT BROKER";   // CHANGE THIS
const char *mqtt_topic = "SUB MQTT TOPIC"; // CHANGE THIS

WiFiClient espClient;
PubSubClient mqttClient(espClient);

// ================= SOLARUN CONFIGURATION =================
const String EVENT_ID = "EVENT ID";
const int CHECKPOINT_ID = 1;                   // ID NUM OF THE CHECKPOINT NODE
const String APP_SUFFIX = "EVENT SUFFIX CODE"; // CHANGE THIS

// Thresholds & Timings
int scanTime = 3; // 3 seconds scan time to clear memory more frequently
const unsigned long COOLDOWN_TIME = 60000; // 1-minute anti-spam hardware shield
const int RSSI_THRESHOLD = -85; // Distance sensitivity threshold (-85 dBm)

// Memory Management
BLEScan *pBLEScan;
std::map<String, unsigned long> runnerGuestBook;
std::vector<String> offlineBuffer; // Backup queue for offline data
const int MAX_BUFFER_SIZE =
    50; // Maximum buffer size to prevent memory overflow

// ================= CORE FUNCTIONS =================

void processPayload(String payload) {
  if (mqttClient.connected()) {
    if (mqttClient.publish(mqtt_topic, payload.c_str())) {
      Serial.println(">> [SUCCESS] Payload sent to Cloud");
    }
  } else {
    // If WiFi/MQTT is dead, save to buffer safely
    if (offlineBuffer.size() < MAX_BUFFER_SIZE) {
      offlineBuffer.push_back(payload);
      Serial.println(
          ">> [BUFFERED] Internet offline, payload saved to buffer.");
    } else {
      Serial.println(">> [DROPPED] Buffer is full! Payload discarded.");
    }
  }
}

void flushBuffer() {
  if (mqttClient.connected() && !offlineBuffer.empty()) {
    Serial.println("🔄 Flushing delayed payloads from Buffer...");
    while (!offlineBuffer.empty() && mqttClient.connected()) {
      String savedPayload = offlineBuffer.front();
      if (mqttClient.publish(mqtt_topic, savedPayload.c_str())) {
        offlineBuffer.erase(
            offlineBuffer.begin()); // Remove the successfully sent item
        delay(100); // Short delay to prevent overloading the broker
      }
    }
    Serial.println("✅ Buffer flushed successfully.");
  }
}

void setup_wifi() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println();
    Serial.print("Connecting to WiFi: ");
    Serial.println(ssid);
    WiFi.begin(ssid, password);
    while (WiFi.status() != WL_CONNECTED) {
      delay(500);
      Serial.print(".");
    }
    Serial.println("\nWiFi connected! IP: " + WiFi.localIP().toString());
  }
}

void reconnect_mqtt() {
  while (!mqttClient.connected() && WiFi.status() == WL_CONNECTED) {
    Serial.print("Attempting MQTT connection...");
    String clientId = "ESP32-SolaRun-" + String(random(0xffff), HEX);
    if (mqttClient.connect(clientId.c_str())) {
      Serial.println("connected to HiveMQ!");
      flushBuffer(); // Flush buffer immediately after reconnecting
    } else {
      Serial.print("failed, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" try again in 3 seconds");
      delay(3000);
    }
  }
}

// ================= BLE CALLBACK =================
class MyAdvertisedDeviceCallbacks : public BLEAdvertisedDeviceCallbacks {
  void onResult(BLEAdvertisedDevice advertisedDevice) {
    if (advertisedDevice.haveName()) {
      String fullName = advertisedDevice.getName().c_str();
      int rssi = advertisedDevice.getRSSI();

      // 1. HARD THRESHOLDS: Check Suffix AND RSSI Distance
      if (fullName.endsWith(APP_SUFFIX) && rssi >= RSSI_THRESHOLD) {
        unsigned long currentTime = millis();

        // 2. NAME EXTRACTION: Strip the suffix
        String username = fullName.substring(0, fullName.indexOf(APP_SUFFIX));

        // 3. HARDWARE SHIELD: Dynamic Cooldown
        if (runnerGuestBook.find(username) == runnerGuestBook.end() ||
            (currentTime - runnerGuestBook[username] > COOLDOWN_TIME)) {

          runnerGuestBook[username] = currentTime;

          Serial.println("=====================================");
          Serial.printf("🏁 RUNNER DETECTED: %s | RSSI: %d dBm\n",
                        username.c_str(), rssi);

          // 4. PREPARE PAYLOAD AND PROCESS
          String payload = "{\"event_id\":\"" + EVENT_ID +
                           "\", \"rfid_uid\":\"" + username +
                           "\", \"checkpoint_id\":" + String(CHECKPOINT_ID) +
                           ", \"timestamp\":" + String(currentTime) + "}";
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

  // Setup Connections
  setup_wifi();
  mqttClient.setServer(mqtt_server, 1883);

  // Setup BLE
  BLEDevice::init("");
  pBLEScan = BLEDevice::getScan();
  pBLEScan->setAdvertisedDeviceCallbacks(new MyAdvertisedDeviceCallbacks());
  pBLEScan->setActiveScan(true);
  pBLEScan->setInterval(100);
  pBLEScan->setWindow(99);
}

void loop() {
  // Always ensure connection is alive
  if (WiFi.status() != WL_CONNECTED) {
    setup_wifi();
  }
  if (!mqttClient.connected()) {
    reconnect_mqtt();
  }
  mqttClient.loop();

  // Start Non-Blocking Scan
  BLEScanResults *foundDevices = pBLEScan->start(scanTime, false);
  pBLEScan->clearResults();
}
