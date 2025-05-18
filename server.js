const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const bodyParser = require("body-parser");
const { createClient } = require("@supabase/supabase-js");

const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");

dayjs.extend(utc);
dayjs.extend(timezone);

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(bodyParser.json());

// Supabase setup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// State management with duration tracking
let rainStartedAt = null;
let lastStatus = 0;
let clients = [];
let durationUpdateInterval = null;

// Calculate current rain duration in seconds
const calculateCurrentDuration = () => {
  if (!rainStartedAt) return 0;
  
  try {
    const now = dayjs().tz("Asia/Jakarta");
    return now.diff(rainStartedAt, "second");
  } catch (error) {
    console.error("Error calculating duration:", error);
    return 0;
  }
};

// Start duration updates
const startDurationUpdates = () => {
  if (durationUpdateInterval) return;

  durationUpdateInterval = setInterval(() => {
    try {
      const currentDuration = calculateCurrentDuration();
      broadcast({
        type: "duration_update",
        duration: currentDuration,
        isRaining: true,
        startedAt: formatTime(rainStartedAt)
      });
    } catch (error) {
      console.error("Error in duration update interval:", error);
    }
  }, 1000); // Update every second
};

// Stop duration updates
const stopDurationUpdates = () => {
  if (durationUpdateInterval) {
    clearInterval(durationUpdateInterval);
    durationUpdateInterval = null;
  }
};

// WebSocket connection
wss.on("connection", (ws) => {
  clients.push(ws);
  
  // Send initial status to new client
  try {
    if (rainStartedAt) {
      ws.send(JSON.stringify({
        status: "hujan",
        startedAt: formatTime(rainStartedAt),
        duration: calculateCurrentDuration()
      }));
    }
  } catch (error) {
    console.error("Error sending initial status:", error);
  }

  ws.on("close", () => {
    clients = clients.filter((client) => client !== ws);
  });
});

// Broadcast function with error handling
function broadcast(data) {
  clients.forEach((client) => {
    try {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    } catch (error) {
      console.error("Error broadcasting to client:", error);
    }
  });
}

// Format standar waktu lokal
const formatTime = (time) => time.format("DD/MM/YYYY HH:mm:ss");

// POST endpoint dari ESP8266
app.post("/rain", async (req, res) => {
  try {
    const { isRaining } = req.body;
    const now = dayjs().tz("Asia/Jakarta");

    if (isRaining === 1 && lastStatus === 0) {
      // Mulai hujan
      rainStartedAt = now;
      startDurationUpdates();
      broadcast({ 
        status: "hujan", 
        startedAt: formatTime(now),
        duration: 0
      });
      console.log({ status: "hujan", startedAt: formatTime(now) });

    } else if (isRaining === 0 && lastStatus === 1 && rainStartedAt) {
      // Hujan berhenti
      const endedAt = now;
      const duration = calculateCurrentDuration();
      stopDurationUpdates();

      // Insert data ke Supabase
      console.log("Attempting to save data to Supabase:", {
        start_time: formatTime(rainStartedAt),
        end_time: formatTime(endedAt),
        duration
      });
      
      const { data, error } = await supabase
        .from('rain_history')
        .insert([
          { 
            start_time: formatTime(rainStartedAt), 
            end_time: formatTime(endedAt), 
            duration: duration 
          }
        ]);
      
      if (error) {
        console.error("Error saving to Supabase:", error);
      } else {
        console.log("Successfully saved data to Supabase:", data);
      }

      broadcast({
        status: "berhenti",
        startedAt: formatTime(rainStartedAt),
        endedAt: formatTime(endedAt),
        duration,
      });

      console.log({
        status: "berhenti",
        startedAt: formatTime(rainStartedAt),
        endedAt: formatTime(endedAt),
        duration,
      });

      rainStartedAt = null;
    }

    lastStatus = isRaining;
    res.sendStatus(200);
  } catch (error) {
    console.error("Error processing rain status:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Endpoint buat fetch history
app.get("/history", async (req, res) => {
  try {
    console.log("Fetching history from Supabase...");
    const { data, error } = await supabase
      .from('rain_history')
      .select('*')
      .order('id', { ascending: false });
    
    if (error) {
      console.error("Error fetching from Supabase:", error);
      return res.status(500).json({ error: "Database error", details: error });
    }
    
    console.log(`Successfully fetched ${data?.length || 0} records from Supabase`);
    res.json(data);
  } catch (error) {
    console.error("Error fetching history:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
});

// Cleanup on server shutdown
process.on("SIGTERM", () => {
  stopDurationUpdates();
  server.close();
});

// Validasi tabel sebelum mulai server
async function validateSupabaseSetup() {
  try {
    console.log("Validating Supabase setup...");
    // Cek apakah bisa mengakses tabel rain_history
    const { data, error } = await supabase
      .from('rain_history')
      .select('count', { count: 'exact', head: true });
    
    if (error) {
      console.error("Error validating Supabase table:", error);
      console.error("Please check your Supabase setup and ensure the 'rain_history' table exists");
      // Tidak menghentikan server, hanya memberikan peringatan
    } else {
      console.log("Supabase connection successful! Table 'rain_history' is accessible.");
    }
  } catch (e) {
    console.error("Failed to validate Supabase connection:", e);
  }
}

// Menentukan port dan host dari environment variable atau default
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0'; // Gunakan 0.0.0.0 untuk binding ke semua IP

server.listen(PORT, HOST, async () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
  await validateSupabaseSetup();
});